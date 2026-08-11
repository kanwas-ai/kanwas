import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'fs/promises'
import path from 'path'
import type { Logger } from 'pino'

import { readFileIdentity, type FileIdentitySnapshot } from './filesystem.js'

export type ChangeType = 'create' | 'update' | 'delete' | 'rename'

export interface FileChangeEvent {
  type: Exclude<ChangeType, 'rename'>
  path: string
  isDirectory: boolean
}

export interface FileRenameEvent {
  type: 'rename'
  oldPath: string
  path: string
  isDirectory: boolean
}

export type WatchEvent = FileChangeEvent | FileRenameEvent

export type FileChangeHandler = {
  bivarianceHack(event: WatchEvent): Promise<void>
}['bivarianceHack']

export interface WatcherOptions {
  /** Directory or glob paths to watch */
  watchPath?: string
  /** Multiple paths or globs to watch */
  watchPaths?: string[]
  /** Patterns to ignore (glob patterns) */
  ignored?: string[]
  /** Whether to wait for writes to settle before emitting */
  awaitWriteFinish?: boolean
  /** Handler for file changes */
  onFileChange: FileChangeHandler
  /** Handler for errors */
  onError?: (error: Error) => void
  /** Handler for when watcher is ready */
  onReady?: () => void
  /** Logger instance */
  logger?: Logger
}

const DEFAULT_IGNORED = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.DS_Store',
  '**/.ready', // Ignore our ready marker
]

/**
 * FileWatcher watches a directory for changes and calls handlers.
 * Uses chokidar under the hood with sensible defaults for workspace sync.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null
  private readonly options: WatcherOptions
  private readonly log?: Logger
  /**
   * Queue to serialize event handlers.
   *
   * Without this, multiple file change events fire handlers concurrently,
   * causing read-modify-write races on shared resources like metadata.yaml.
   * By chaining handlers through this promise, each completes before the next starts.
   */
  private handlerQueue: Promise<void> = Promise.resolve()
  private readonly knownPaths = new Map<string, FileIdentitySnapshot>()
  private readonly recentlyDeleted = new Map<
    string,
    FileIdentitySnapshot & {
      path: string
      expiresAt: number
    }
  >()
  private readonly pendingDeleteTimers = new Map<string, NodeJS.Timeout>()
  private static readonly RENAME_WINDOW_MS = 500

  constructor(options: WatcherOptions) {
    this.options = options
    this.log = options.logger?.child({ component: 'FileWatcher' })
  }

  /**
   * Start watching the directory.
   */
  start(): void {
    if (this.watcher) {
      return // Already watching
    }

    const ignored = [...DEFAULT_IGNORED, ...(this.options.ignored ?? [])]
    const watchTargets = this.options.watchPaths ?? (this.options.watchPath ? [this.options.watchPath] : [])

    if (watchTargets.length === 0) {
      throw new Error('FileWatcher requires `watchPath` or `watchPaths`.')
    }

    this.log?.debug(
      { watchTargets, ignored, awaitWriteFinish: this.options.awaitWriteFinish ?? true },
      'Starting file watcher'
    )

    this.watcher = chokidar.watch(watchTargets, {
      persistent: true,
      ignoreInitial: true, // Don't emit events for initial files
      ignored,
      awaitWriteFinish:
        this.options.awaitWriteFinish === false
          ? false
          : {
              stabilityThreshold: 500,
              pollInterval: 100,
            },
      depth: 99, // Watch all subdirectories
    })

    // File added
    this.watcher.on('add', (path) => {
      this.handleAdd(path, false)
    })

    // File changed
    this.watcher.on('change', (path) => {
      this.handleUpdate(path, false)
    })

    // File removed
    this.watcher.on('unlink', (path) => {
      this.handleDelete(path, false)
    })

    // Directory added
    this.watcher.on('addDir', (path) => {
      this.handleAdd(path, true)
    })

    // Directory removed
    this.watcher.on('unlinkDir', (path) => {
      this.handleDelete(path, true)
    })

    // Watcher ready
    this.watcher.on('ready', async () => {
      await this.seedKnownPaths(watchTargets)
      this.log?.info({ watchTargets }, 'File watcher ready')
      this.options.onReady?.()
    })

    // Error handling
    this.watcher.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err))
      this.log?.error({ error: error.message }, 'Watcher error')
      this.options.onError?.(error)
    })
  }

  private handleChange(event: WatchEvent): void {
    this.log?.debug({ type: event.type, path: event.path, isDirectory: event.isDirectory }, 'File change detected')

    // Serialize handlers through the queue to prevent race conditions.
    // Each handler must complete before the next one starts.
    this.handlerQueue = this.handlerQueue
      .then(() => this.options.onFileChange(event))
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err))
        this.log?.error({ type: event.type, path: event.path, error: error.message }, 'Error handling file change')
        this.options.onError?.(error)
      })
  }

  private handleAdd(targetPath: string, isDirectory: boolean): void {
    void this.processAdd(targetPath, isDirectory)
  }

  private async processAdd(targetPath: string, isDirectory: boolean): Promise<void> {
    const identity = await readFileIdentity(targetPath)
    if (identity) {
      this.knownPaths.set(targetPath, identity)
      const renameMatch = this.takeRecentDeleteMatch(targetPath, identity)
      if (renameMatch) {
        this.log?.debug({ oldPath: renameMatch.path, path: targetPath, isDirectory }, 'Detected filesystem rename')
        this.handleChange({ type: 'rename', oldPath: renameMatch.path, path: targetPath, isDirectory })
        return
      }
    }

    this.handleChange({ type: 'create', path: targetPath, isDirectory })
  }

  private handleUpdate(targetPath: string, isDirectory: boolean): void {
    void this.processUpdate(targetPath, isDirectory)
  }

  private async processUpdate(targetPath: string, isDirectory: boolean): Promise<void> {
    const identity = await readFileIdentity(targetPath)
    if (identity) {
      this.knownPaths.set(targetPath, identity)
    }

    this.handleChange({ type: 'update', path: targetPath, isDirectory })
  }

  private handleDelete(targetPath: string, isDirectory: boolean): void {
    const previous = this.knownPaths.get(targetPath)
    this.knownPaths.delete(targetPath)
    if (previous) {
      this.rememberDeletedPath(targetPath, previous)
      const timer = setTimeout(() => {
        this.pendingDeleteTimers.delete(targetPath)
        this.handleChange({ type: 'delete', path: targetPath, isDirectory })
      }, FileWatcher.RENAME_WINDOW_MS)
      this.pendingDeleteTimers.set(targetPath, timer)
      return
    }

    this.handleChange({ type: 'delete', path: targetPath, isDirectory })
  }

  private rememberDeletedPath(targetPath: string, identity: FileIdentitySnapshot): void {
    this.pruneDeletedCache()
    this.recentlyDeleted.set(this.getIdentityKey(identity), {
      ...identity,
      path: targetPath,
      expiresAt: Date.now() + FileWatcher.RENAME_WINDOW_MS,
    })
  }

  private takeRecentDeleteMatch(
    targetPath: string,
    identity: FileIdentitySnapshot
  ): (FileIdentitySnapshot & { path: string }) | null {
    this.pruneDeletedCache()
    const match = this.recentlyDeleted.get(this.getIdentityKey(identity))
    if (!match || match.path === targetPath) {
      return null
    }

    if (
      match.isDirectory !== identity.isDirectory ||
      match.size !== identity.size ||
      match.mtimeMs !== identity.mtimeMs
    ) {
      return null
    }

    // Preserve identity only for in-folder file renames. Cross-folder file moves
    // should flow through delete + create so the target canvas treats them as new.
    if (!identity.isDirectory && path.dirname(match.path) !== path.dirname(targetPath)) {
      return null
    }

    this.recentlyDeleted.delete(this.getIdentityKey(identity))
    const pendingDelete = this.pendingDeleteTimers.get(match.path)
    if (pendingDelete) {
      clearTimeout(pendingDelete)
      this.pendingDeleteTimers.delete(match.path)
    }
    return match
  }

  private pruneDeletedCache(): void {
    const now = Date.now()
    for (const [key, value] of this.recentlyDeleted.entries()) {
      if (value.expiresAt <= now) {
        this.recentlyDeleted.delete(key)
      }
    }
  }

  private getIdentityKey(identity: FileIdentitySnapshot): string {
    return `${identity.dev}:${identity.ino}`
  }

  private async seedKnownPaths(watchTargets: string[]): Promise<void> {
    const roots = new Set<string>()
    for (const target of watchTargets) {
      roots.add(this.getScanRoot(target))
    }

    for (const root of roots) {
      await this.scanExistingPaths(root)
    }
  }

  private getScanRoot(target: string): string {
    const wildcardIndex = target.search(/[*{[]/)
    if (wildcardIndex === -1) {
      return target
    }

    const prefix = target.slice(0, wildcardIndex)
    const trimmed = prefix.endsWith(path.sep) ? prefix.slice(0, -1) : prefix
    return trimmed.length > 0 ? trimmed : path.sep
  }

  private async scanExistingPaths(root: string): Promise<void> {
    const identity = await readFileIdentity(root)
    if (!identity) {
      return
    }

    this.knownPaths.set(root, identity)
    if (!identity.isDirectory) {
      return
    }

    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.name === '.git' ||
        entry.name === 'node_modules' ||
        entry.name === '.ready' ||
        entry.name === '.DS_Store'
      ) {
        continue
      }

      await this.scanExistingPaths(path.join(root, entry.name))
    }
  }

  /**
   * Stop watching and clean up.
   */
  async stop(): Promise<void> {
    for (const timer of this.pendingDeleteTimers.values()) {
      clearTimeout(timer)
    }
    this.pendingDeleteTimers.clear()

    if (this.watcher) {
      this.log?.debug('Stopping file watcher')
      await this.watcher.close()
      this.watcher = null
      this.log?.info('File watcher stopped')
    }
  }
}
