// Chokidar file watcher — COPIED from execenv/src/watcher.ts (execenv is an app,
// not a library, so we copy rather than import).
//
// IMPORTANT (chokidar 4): glob strings in `ignored`/watch targets are NO LONGER
// interpreted as globs — they are matched literally and never hit real paths. The
// execenv original relied on `**/.git/**`-style ignores that silently do nothing
// under chokidar 4, so `.git/`, `node_modules/`, and the daemon's own `.kanwas/`
// were all being watched (`.git` churn during a checkout, trashed binaries
// re-adopted from `.kanwas/trash/`, …). This copy uses a FUNCTION `ignored`
// (chokidar-4-correct) that skips those directories by path segment and, when a
// content filter is set, splits text vs binary by extension.
import chokidar, { type FSWatcher } from 'chokidar'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
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
  watchPath?: string
  watchPaths?: string[]
  /**
   * Restrict emitted events to text (`.md`/`.yaml`) or binary files. Directories
   * are always traversed (so nested content is found); this only filters files.
   */
  content?: 'text' | 'binary'
  awaitWriteFinish?: boolean
  onFileChange: FileChangeHandler
  onError?: (error: Error) => void
  onReady?: () => void
  logger?: Logger
}

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.DS_Store', '.kanwas'])
const TEXT_FILE_RE = /\.(md|ya?ml)$/i

/** True when any path segment names a directory the daemon must never watch. */
function hasSkippedSegment(p: string): boolean {
  for (const segment of p.split(path.sep)) {
    if (SKIP_DIR_NAMES.has(segment)) return true
  }
  return false
}

/**
 * Build a chokidar-4 function `ignored`. Always skips SKIP_DIR_NAMES anywhere in
 * the path; when `content` is set, additionally ignores files of the other kind.
 *
 * chokidar calls this twice per path — once WITHOUT stats (pre-stat) and once
 * WITH — and ignores the path if EITHER call returns true. So directory decisions
 * must be safe on the no-stats call: we only skip-by-segment there and defer all
 * content filtering to the stats call (where isFile()/isDirectory() is known),
 * guaranteeing directories are always traversed.
 */
function buildIgnored(content?: 'text' | 'binary'): (p: string, stats?: Stats) => boolean {
  return (p: string, stats?: Stats): boolean => {
    if (hasSkippedSegment(p)) return true
    if (!content || !stats) return false // defer content filtering to the stats call
    if (!stats.isFile()) return false // directory → traverse
    const isText = TEXT_FILE_RE.test(p)
    return content === 'text' ? !isText : isText
  }
}

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private readonly options: WatcherOptions
  private readonly log?: Logger
  private handlerQueue: Promise<void> = Promise.resolve()
  private readonly knownPaths = new Map<string, FileIdentitySnapshot>()
  private readonly recentlyDeleted = new Map<string, FileIdentitySnapshot & { path: string; expiresAt: number }>()
  private readonly pendingDeleteTimers = new Map<string, NodeJS.Timeout>()
  private static readonly RENAME_WINDOW_MS = 500

  constructor(options: WatcherOptions) {
    this.options = options
    this.log = options.logger?.child({ component: 'FileWatcher' })
  }

  start(): void {
    if (this.watcher) return

    const watchTargets = this.options.watchPaths ?? (this.options.watchPath ? [this.options.watchPath] : [])
    if (watchTargets.length === 0) {
      throw new Error('FileWatcher requires `watchPath` or `watchPaths`.')
    }

    this.log?.debug(
      { watchTargets, content: this.options.content, awaitWriteFinish: this.options.awaitWriteFinish ?? true },
      'Starting file watcher'
    )

    this.watcher = chokidar.watch(watchTargets, {
      persistent: true,
      ignoreInitial: true,
      ignored: buildIgnored(this.options.content),
      awaitWriteFinish:
        this.options.awaitWriteFinish === false ? false : { stabilityThreshold: 500, pollInterval: 100 },
      depth: 99,
    })

    this.watcher.on('add', (p) => this.handleAdd(p, false))
    this.watcher.on('change', (p) => this.handleUpdate(p, false))
    this.watcher.on('unlink', (p) => this.handleDelete(p, false))
    // Directory (canvas) events fire from a SINGLE watcher — otherwise a text and
    // a binary watcher would both report `addDir` and the syncer would mint two
    // canvases for the same directory. The binary watcher owns them; the text
    // watcher still TRAVERSES directories (to reach .md files) but stays silent.
    if (this.options.content !== 'text') {
      this.watcher.on('addDir', (p) => this.handleAdd(p, true))
      this.watcher.on('unlinkDir', (p) => this.handleDelete(p, true))
    }

    this.watcher.on('ready', async () => {
      await this.seedKnownPaths(watchTargets)
      this.log?.info({ watchTargets }, 'File watcher ready')
      this.options.onReady?.()
    })

    this.watcher.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err))
      this.log?.error({ error: error.message }, 'Watcher error')
      this.options.onError?.(error)
    })
  }

  private handleChange(event: WatchEvent): void {
    this.log?.debug({ type: event.type, path: event.path, isDirectory: event.isDirectory }, 'File change detected')
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
    if (identity) this.knownPaths.set(targetPath, identity)
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
    if (!match || match.path === targetPath) return null
    if (
      match.isDirectory !== identity.isDirectory ||
      match.size !== identity.size ||
      match.mtimeMs !== identity.mtimeMs
    )
      return null
    // Preserve identity only for in-folder file renames; cross-folder moves flow
    // through delete + create so the target canvas treats them as new.
    if (!identity.isDirectory && path.dirname(match.path) !== path.dirname(targetPath)) return null

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
      if (value.expiresAt <= now) this.recentlyDeleted.delete(key)
    }
  }

  private getIdentityKey(identity: FileIdentitySnapshot): string {
    return `${identity.dev}:${identity.ino}`
  }

  private async seedKnownPaths(watchTargets: string[]): Promise<void> {
    const roots = new Set<string>()
    for (const target of watchTargets) roots.add(this.getScanRoot(target))
    for (const root of roots) await this.scanExistingPaths(root)
  }

  private getScanRoot(target: string): string {
    const wildcardIndex = target.search(/[*{[]/)
    if (wildcardIndex === -1) return target
    const prefix = target.slice(0, wildcardIndex)
    const trimmed = prefix.endsWith(path.sep) ? prefix.slice(0, -1) : prefix
    return trimmed.length > 0 ? trimmed : path.sep
  }

  private async scanExistingPaths(root: string): Promise<void> {
    const identity = await readFileIdentity(root)
    if (!identity) return
    this.knownPaths.set(root, identity)
    if (!identity.isDirectory) return

    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      await this.scanExistingPaths(path.join(root, entry.name))
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.pendingDeleteTimers.values()) clearTimeout(timer)
    this.pendingDeleteTimers.clear()
    if (this.watcher) {
      this.log?.debug('Stopping file watcher')
      await this.watcher.close()
      this.watcher = null
      this.log?.info('File watcher stopped')
    }
  }
}
