// Live folder → yDoc engine.
//
// A trimmed, LOCAL-FIRST replacement for execenv/src/sync-manager.ts. It reuses
// the copied `watcher.ts` + `metadata-manager.ts` and the shared `FilesystemSyncer`,
// but deliberately DROPS everything the local model doesn't want:
//   - NO clearDirectory / yDoc→folder hydration (adoption already built the yDoc)
//   - NO 3-way merge / markdown shadow map / yDoc-wins writebacks
//   - NO Kanwas.md restore or metadata retry queue
// Disk changes simply apply to the yDoc (last-writer-wins; the flusher is a later
// mission). The only writes the runtime makes are suppression-tagged metadata.yaml
// sidecars (and `.kanwas/`).
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import WebSocket from 'ws'
import type { Logger } from 'pino'
import { PathMapper, connectToWorkspace } from 'shared'
import type { CanvasItem, CanvasMetadata, NodeItem, WorkspaceConnection } from 'shared'
import { LOCAL_USER } from 'shared/local-api'
import {
  ContentConverter,
  FilesystemSyncer,
  type FileChange,
  type FileUploadResult,
  type SyncResult,
} from 'shared/server'
import {
  hasMetadataYaml,
  isDirectory,
  readFileBinary,
  readFileContent,
  serializeMetadata,
  writeMetadataYaml,
} from './filesystem.js'
import { writeFileAtomic } from './atomic-write.js'
import { buildDiskIndex } from './disk-index.js'
import { rebuildDiskAlignedMappings } from './disk-align.js'
import { buildStickyYaml, FolderFlusher, type FlusherSource } from './folder-flusher.js'
import { joinFrontmatter, splitFrontmatter } from './frontmatter.js'
import type { FrontmatterRegistry } from './frontmatter-registry.js'
import { MetadataManager } from './metadata-manager.js'
import { mintSocketToken } from './identity.js'
import { nodeFileClass, type NodeFileClass } from './name-match.js'
import type { SuppressionRegistry } from './suppression.js'
import { dedupeFilename, mimeTypeForUpload, type UploadRequest, type UploadResult } from './upload.js'
import { FileWatcher, type WatchEvent } from './watcher.js'

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp3', '.wav', '.m4a', '.svg'])

/** Node-backing file extensions whose delete we defer to survive editor atomic saves. */
const NODE_FILE_SUFFIXES = ['.md', '.sticky.yaml', '.text.yaml', '.url.yaml']

/**
 * How long to defer a content/binary delete before applying it. Editors save via
 * write-tmp+rename or delete+recreate; a same-path recreate (or a delayed unlink
 * echo) landing inside this window converts the delete into an in-place update so
 * the node id — and its edges/position — survive. Chokidar already defers the
 * unlink ~500ms for inode-rename detection, so the effective same-path grace is
 * ~1s, comfortably wider than any editor's tmp-rename gap.
 */
const DELETE_DEFER_MS = 500

interface PendingDelete {
  timer: NodeJS.Timeout
  /** Raw-content hash of the file at the moment it was last synced (for move pairing). */
  hash: string | undefined
  cls: NodeFileClass
}

/** PUT /workspaces/:id/notes/:nodeId/content body (Mission A1). */
export interface NoteSaveRequest {
  nodeId: string
  body: string
  /** sha256 hex of the disk bytes the editor last saw; omit to skip the conflict guard. */
  baseHash?: string | null
  /** Overwrite disk even if `baseHash` is stale (active-user-wins per the plan's conflict rule). */
  force?: boolean
}

/** Discriminated on `status`, mirroring the HTTP status the route sends. */
export type NoteSaveResult =
  | { status: 200; hash: string; relPath: string }
  | { status: 404; error: string }
  | { status: 422; error: string }
  | { status: 409; diskHash: string | null }

export type NoteBaselineResult =
  | { status: 200; hash: string | null; relPath: string }
  | { status: 404; error: string }
  | { status: 422; error: string }

export interface SyncOrchestratorOptions {
  folder: string
  workspaceId: string
  rootCanvasId: string
  yjsHost: string
  yjsSocketPath?: string
  secret: string
  logger: Logger
  /** Shared echo-cancellation for the runtime's own writes (folder→yDoc + flusher). */
  suppression: SuppressionRegistry
  /** Node-id → frontmatter block, populated here on read, consumed by the flusher. */
  frontmatter: FrontmatterRegistry
  /** When the folder was empty (welcome note seeded in-memory), skip the root sidecar. */
  seededEmpty: boolean
  /** Canvases whose sidecars are stale after offline-rename recovery — refresh at boot. */
  recoveredCanvasIds?: string[]
}

export class SyncOrchestrator {
  private readonly folder: string
  private readonly workspaceId: string
  private readonly rootCanvasId: string
  private readonly yjsHost: string
  private readonly yjsSocketPath: string
  private readonly secret: string
  private readonly log: Logger
  private readonly seededEmpty: boolean
  private readonly recoveredCanvasIds: string[]
  private readonly suppression: SuppressionRegistry
  private readonly frontmatter: FrontmatterRegistry

  private connection: WorkspaceConnection | null = null
  private pathMapper: PathMapper | null = null
  private syncer: FilesystemSyncer | null = null
  private metadataManager: MetadataManager | null = null
  private immediateWatcher: FileWatcher | null = null
  private settledWatcher: FileWatcher | null = null
  private folderFlusher: FolderFlusher | null = null

  private queue: Promise<unknown> = Promise.resolve()
  private currentRelPath: string | null = null

  /** Deferred content/binary deletes, keyed by folder-relative path (atomic-save guard). */
  private pendingDeletes = new Map<string, PendingDelete>()
  /** Last-synced raw-content hash per file path — used to pair a move (delete→create). */
  private fileHashes = new Map<string, string>()

  constructor(options: SyncOrchestratorOptions) {
    this.folder = options.folder
    this.workspaceId = options.workspaceId
    this.rootCanvasId = options.rootCanvasId
    this.yjsHost = options.yjsHost
    this.yjsSocketPath = options.yjsSocketPath ?? '/yjs/socket.io'
    this.secret = options.secret
    this.log = options.logger.child({ component: 'SyncOrchestrator' })
    this.seededEmpty = options.seededEmpty
    this.recoveredCanvasIds = options.recoveredCanvasIds ?? []
    this.suppression = options.suppression
    this.frontmatter = options.frontmatter
  }

  /** The yDoc→folder flusher, available after start(). */
  get flusher(): FolderFlusher {
    if (!this.folderFlusher) throw new Error('SyncOrchestrator.flusher accessed before start()')
    return this.folderFlusher
  }

  /**
   * Folder-relative path for a node id, per the live disk-aligned PathMapper
   * (WP-C: UI-context → coding-agent resolution). Undefined before start(), or
   * for a node id with no on-disk mapping (metadata-only text/link nodes,
   * unknown ids).
   */
  resolveNodePath(nodeId: string): string | undefined {
    return this.pathMapper?.getPathForNode(nodeId)
  }

  async start(): Promise<void> {
    try {
      // 1. Connect as a non-renderer client (keeps the room alive across renderer reloads).
      this.connection = await connectToWorkspace({
        host: this.yjsHost,
        workspaceId: this.workspaceId,
        clientKind: 'local-runtime',
        protocol: 'ws',
        path: this.yjsSocketPath,
        WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
        socketToken: () => mintSocketToken(this.secret, this.workspaceId).token,
        timeout: 20_000,
      })
      this.log.info('Connected watcher client to room')

      // 2. Build syncer + metadata manager on the connected proxy. Align mappings
      //    to the real on-disk filenames (adopted files are never renamed to their
      //    sanitized form, so a live edit of e.g. README.md must map to its node).
      this.pathMapper = new PathMapper()
      rebuildDiskAlignedMappings(this.pathMapper, this.connection.proxy, this.folder)
      for (const mapping of this.pathMapper.getAllMappings().nodes) {
        try {
          const bytes = await fsp.readFile(path.join(this.folder, mapping.path))
          this.fileHashes.set(mapping.path, hashRaw(bytes))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      const contentConverter = new ContentConverter()

      const fileUploader = async (
        buffer: Buffer,
        _canvasId: string,
        filename: string,
        mimeType: string
      ): Promise<FileUploadResult> => ({ storagePath: this.currentRelPath ?? filename, mimeType, size: buffer.length })
      const fileReader = async (rel: string): Promise<Buffer> => readFileBinary(path.join(this.folder, rel))

      this.syncer = new FilesystemSyncer({
        proxy: this.connection.proxy,
        yDoc: this.connection.yDoc,
        contentStore: this.connection.contentStore,
        pathMapper: this.pathMapper,
        contentConverter,
        fileUploader,
        fileReader,
        auditActor: `user:${LOCAL_USER.id}`,
        autoCreateCanvases: true,
        // A watcher event whose directory no longer exists on disk (a stale event
        // queued behind a `git mv` that already completed) must not mint a canvas
        // — that's how a rename ghost-sidecar happens (A4.2).
        directoryExists: (rel) => fs.existsSync(path.join(this.folder, rel)),
      })

      this.metadataManager = new MetadataManager({
        logger: this.log,
        workspacePath: this.folder,
        findCanvasById: (id) => this.findCanvasById(id),
        getCanvasPathById: (id) => this.pathMapper?.getPathForCanvas(id),
        listCanvasIds: () => this.listCanvasIds(),
        writeMetadata: (canvasDir, canvasPath, metadata, createDir) =>
          this.writeSuppressedMetadata(canvasDir, canvasPath, metadata, createDir),
      })

      // 3. Materialize sidecars for canvases that lack one (restart id-stability).
      //    Runs before the watchers start, so these writes produce no echo.
      const written = await this.metadataManager.materializeMissing(async (canvasPath) => {
        if (this.seededEmpty && canvasPath.length === 0) return true // skip phantom root sidecar
        const dir = canvasPath.length === 0 ? this.folder : path.join(this.folder, canvasPath)
        return hasMetadataYaml(dir)
      })
      this.log.info({ written }, 'Materialized missing metadata.yaml sidecars')

      // Offline-rename recovery renamed some reconstructed nodes to follow their
      // moved files; their EXISTING sidecars still hold the stale names. Rewrite just
      // those (idempotent, pre-watcher so no echo) so the on-disk sidecar reflects
      // the recovered identity — stale sidecar entries cleaned.
      for (const canvasId of this.recoveredCanvasIds) {
        await this.metadataManager.refreshCanvasMetadata(canvasId)
      }
      if (this.recoveredCanvasIds.length > 0) {
        this.log.info({ canvases: this.recoveredCanvasIds.length }, 'Refreshed sidecars after offline-rename recovery')
      }

      // 4. Start watchers: a fast text watcher (.md/.yaml, no write-finish debounce)
      //    and a settled binary watcher (awaits write-finish). Both watch the folder
      //    root with a chokidar-4 FUNCTION ignore (glob-string ignores are dead in
      //    chokidar 4) that reliably skips `.git/`, `node_modules/`, `.kanwas/` and
      //    splits text vs binary by extension.
      this.immediateWatcher = new FileWatcher({
        watchPath: this.folder,
        content: 'text',
        logger: this.log,
        awaitWriteFinish: false,
        onFileChange: (e) => this.onWatchEvent(e),
        onError: (err) => this.log.error({ error: err.message }, 'Watcher error'),
      })
      this.settledWatcher = new FileWatcher({
        watchPath: this.folder,
        content: 'binary',
        logger: this.log,
        onFileChange: (e) => this.onWatchEvent(e),
        onError: (err) => this.log.error({ error: err.message }, 'Watcher error'),
      })
      this.immediateWatcher.start()
      this.settledWatcher.start()

      // 5. The yDoc→folder flusher. Reconciles on the SAME queue as watch events,
      //    so a flush never interleaves with a folder→yDoc apply (no PathMapper race).
      const source: FlusherSource = {
        root: () => this.connection?.proxy.root,
        noteFragment: (nodeId) => this.connection?.contentStore.getBlockNoteFragment(nodeId),
        realign: () => this.realign(),
        enqueue: (task) => this.enqueue(task),
        recordSyncedHash: (rel, hash) => {
          this.fileHashes.set(rel, hash)
        },
        removeSyncedHash: (rel) => {
          this.fileHashes.delete(rel)
        },
      }
      this.folderFlusher = new FolderFlusher({
        folder: this.folder,
        rootCanvasId: this.rootCanvasId,
        source,
        suppression: this.suppression,
        frontmatter: this.frontmatter,
        logger: this.log,
      })

      this.log.info('Bidirectional folder↔yDoc sync active (flusher ready)')
    } catch (error) {
      await this.stop().catch((cleanupError) => {
        this.log.error({ error: String(cleanupError) }, 'Failed to roll back partial synchronizer startup')
      })
      throw error
    }
  }

  /** Chain a task onto the shared serialization queue (with watcher handlers). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Rebuild the disk-aligned PathMapper from the live tree after a structural flush. */
  private realign(): void {
    if (this.pathMapper && this.connection) {
      rebuildDiskAlignedMappings(this.pathMapper, this.connection.proxy, this.folder)
    }
  }

  private onWatchEvent(event: WatchEvent): Promise<void> {
    // Cancel a deferred same-path delete as early as possible: an atomic-save
    // recreate (create/update at the just-deleted path) must convert to an
    // in-place update, not a delete+create that would mint a new node id.
    if (event.type === 'create' || event.type === 'update') {
      const rel = this.toPosixRel(event.path)
      if (rel) this.cancelPendingDelete(rel)
    }
    // Serialize handlers to avoid read-modify-write races on metadata.yaml.
    this.queue = this.queue
      .then(() =>
        event.type === 'rename'
          ? this.handleRename(event.oldPath, event.path, event.isDirectory)
          : this.handleChange(event.type, event.path)
      )
      .catch((err) => this.log.error({ error: String(err), event }, 'Error handling watch event'))
    return this.queue as Promise<void>
  }

  private async handleChange(type: 'create' | 'update' | 'delete', absPath: string): Promise<void> {
    if (!this.syncer || !this.metadataManager) return
    const relPath = this.toPosixRel(absPath)
    if (!relPath || relPath.startsWith('..')) return

    if (type === 'delete') {
      // Drop the runtime's own removals (rename/move/trash) — real deletes proceed.
      if (this.suppression.consumeDelete(relPath)) {
        this.log.debug({ relPath }, 'Skipped internally-generated removal')
        return
      }
      // Node-backing deletes are DEFERRED: an editor atomic save (delete+recreate
      // or write-tmp+rename) fires an unlink that a recreate at the same path
      // undoes moments later. Deferring lets the recreate convert it to an update
      // (id/edges/position preserved). Genuine deletes apply after the window.
      if (this.isNodeBackingFile(relPath) && this.pathMapper?.getMapping(relPath)) {
        this.scheduleDeferredDelete(relPath)
        return
      }
      await this.applyChange({ type: 'delete', path: relPath }, null, absPath)
      return
    }

    const prepared = await this.prepareContent(absPath, relPath)
    if (prepared === 'skip') return
    if (prepared === 'dir') {
      await this.applyChange({ type, path: relPath }, null, absPath)
      return
    }

    if (prepared.binary) {
      // Drop the runtime's own binary echoes (uploads, binary moves) by exact bytes.
      if (this.suppression.consumeWrite(relPath, prepared.binary)) {
        this.log.debug({ relPath }, 'Skipped internally-generated binary write')
        return
      }
      const hash = hashRaw(prepared.binary)
      if (await this.tryApplyMove(relPath, absPath, hash, 'binary')) return
      this.currentRelPath = relPath
      try {
        await this.applyChange({ type, path: relPath, binaryContent: prepared.binary }, null, absPath)
      } finally {
        this.currentRelPath = null
      }
      this.fileHashes.set(relPath, hash)
      return
    }

    // Text (.md/.yaml): drop the runtime's own echoes by exact-byte match.
    if (
      (relPath.endsWith('.md') || relPath.endsWith('.yaml')) &&
      this.suppression.consumeWrite(relPath, prepared.text)
    ) {
      this.log.debug({ relPath }, 'Skipped internally-generated write')
      return
    }
    const rawHash = hashRaw(prepared.text)
    const cls = this.classForPath(relPath)
    if (cls && (await this.tryApplyMove(relPath, absPath, rawHash, cls))) return

    // Frontmatter split off `.md` before it enters the editor (round-trip guard);
    // registered against the resulting node id after the change applies.
    let mdFrontmatter: string | null = null
    let change: FileChange
    if (relPath.endsWith('.md')) {
      const split = splitFrontmatter(prepared.text)
      mdFrontmatter = split.frontmatter
      change = { type, path: relPath, content: split.body }
    } else {
      change = { type, path: relPath, content: prepared.text }
    }
    await this.applyChange(change, mdFrontmatter, absPath)
    this.fileHashes.set(relPath, rawHash)
  }

  /** Run a single syncChange and reconcile its metadata; register frontmatter on success. */
  private async applyChange(change: FileChange, mdFrontmatter: string | null, absPath: string): Promise<void> {
    if (!this.syncer || !this.metadataManager) return
    const result = await this.syncer.syncChange(change)
    if (!result.success) {
      this.log.warn(
        { relPath: change.path, action: result.action, error: 'error' in result ? result.error : undefined },
        'Sync failed'
      )
      return
    }
    if (mdFrontmatter !== null && result.nodeId) {
      this.frontmatter.set(result.nodeId, mdFrontmatter)
    }
    if (result.action !== 'no_op') {
      this.log.info(
        { relPath: change.path, action: result.action, nodeId: result.nodeId },
        'Applied folder change to yDoc'
      )
    }
    await this.metadataManager.handleSyncResult(absPath, result)
  }

  /**
   * Content-hash move pairing: an unmapped new file whose bytes match a still-
   * pending (deferred) delete of the same class is the SAME file moved/renamed.
   * Convert it to a rename so the node id/edges survive instead of minting a new
   * node and orphaning the old one. Returns true when it handled the change.
   */
  private async tryApplyMove(newRel: string, newAbs: string, hash: string, cls: NodeFileClass): Promise<boolean> {
    if (this.pathMapper?.getMapping(newRel)) return false // already a known node → normal update
    let match: string | undefined
    for (const [oldRel, pending] of this.pendingDeletes) {
      if (oldRel === newRel) continue
      if (pending.cls !== cls || pending.hash !== hash) continue
      if (fs.existsSync(path.join(this.folder, oldRel))) continue // old file still there — not a move
      match = oldRel
      break
    }
    if (!match || !this.syncer || !this.metadataManager) return false
    this.cancelPendingDelete(match)
    const result = await this.syncer.syncRename(match, newRel, false)
    if (!result.success || result.action === 'no_op') {
      this.log.warn({ oldPath: match, newPath: newRel }, 'Move pairing failed; falling back to create')
      return false
    }
    this.log.info({ oldPath: match, newPath: newRel, action: result.action }, 'Paired content-hash move → rename')
    await this.metadataManager.handleSyncResult(newAbs, result)
    this.fileHashes.delete(match)
    this.fileHashes.set(newRel, hash)
    return true
  }

  private async handleRename(oldAbs: string, newAbs: string, isDirectory: boolean): Promise<void> {
    if (!this.syncer || !this.metadataManager) return
    const oldRel = this.toPosixRel(oldAbs)
    const newRel = this.toPosixRel(newAbs)
    if (!oldRel || !newRel) return
    this.cancelPendingDelete(oldRel)
    this.cancelPendingDelete(newRel)
    try {
      const result: SyncResult = await this.syncer.syncRename(oldRel, newRel, isDirectory)
      if (result.success && result.action !== 'no_op') {
        this.log.info({ oldRel, newRel, action: result.action }, 'Applied rename to yDoc')
        const h = this.fileHashes.get(oldRel)
        this.fileHashes.delete(oldRel)
        if (h) this.fileHashes.set(newRel, h)
        await this.metadataManager.handleSyncResult(newAbs, result)
      }
    } catch (error) {
      this.log.warn({ oldRel, newRel, error: String(error) }, 'Rename failed')
    }
  }

  // ---- deferred-delete machinery (editor atomic-save identity guard) ----
  private isNodeBackingFile(relPath: string): boolean {
    const ext = path.extname(relPath).toLowerCase()
    if (BINARY_EXT.has(ext)) return true
    return NODE_FILE_SUFFIXES.some((s) => relPath.endsWith(s))
  }

  private classForPath(relPath: string): NodeFileClass | null {
    if (relPath.endsWith('.sticky.yaml')) return 'sticky'
    if (relPath.endsWith('.text.yaml')) return 'text'
    if (relPath.endsWith('.url.yaml')) return 'url'
    if (relPath.endsWith('.md')) return 'markdown'
    const ext = path.extname(relPath).toLowerCase()
    return BINARY_EXT.has(ext) ? 'binary' : null
  }

  private scheduleDeferredDelete(relPath: string): void {
    const existing = this.pendingDeletes.get(relPath)
    if (existing) clearTimeout(existing.timer)
    const cls = this.classForPath(relPath) ?? nodeFileClass('')
    const hash = this.fileHashes.get(relPath)
    const timer = setTimeout(() => {
      void this.enqueue(() => this.applyDeferredDelete(relPath))
    }, DELETE_DEFER_MS)
    this.pendingDeletes.set(relPath, { timer, hash, cls })
  }

  private cancelPendingDelete(relPath: string): void {
    const pending = this.pendingDeletes.get(relPath)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingDeletes.delete(relPath)
    }
  }

  private async applyDeferredDelete(relPath: string): Promise<void> {
    const pending = this.pendingDeletes.get(relPath)
    if (!pending) return // cancelled by a recreate
    this.pendingDeletes.delete(relPath)
    const abs = path.join(this.folder, relPath)
    if (fs.existsSync(abs)) {
      // Recreated within the window (atomic save) — a create/update already
      // refreshed the node in place; keep its id, drop the stale delete.
      this.log.debug({ relPath }, 'Deferred delete skipped — file present again (atomic save)')
      return
    }
    await this.applyChange({ type: 'delete', path: relPath }, null, abs)
    this.fileHashes.delete(relPath)
  }

  private async prepareContent(
    absPath: string,
    relPath: string
  ): Promise<'skip' | 'dir' | { text: string; binary?: undefined } | { binary: Buffer; text?: undefined }> {
    if (await isDirectory(absPath)) return 'dir'
    const ext = path.extname(relPath).toLowerCase()
    if (BINARY_EXT.has(ext)) return { binary: await readFileBinary(absPath) }
    if (relPath.endsWith('.md') || relPath.endsWith('.yaml')) {
      const text = await readFileContent(absPath)
      if (text === undefined) return 'skip'
      return { text }
    }
    return 'skip'
  }

  // ---- suppressed sidecar writes (folder→yDoc structural refresh) ----
  private async writeSuppressedMetadata(
    canvasDir: string,
    canvasPath: string,
    metadata: CanvasMetadata,
    createDir: boolean
  ): Promise<void> {
    const relMetaPath = canvasPath.length === 0 ? 'metadata.yaml' : `${canvasPath}/metadata.yaml`
    this.suppression.registerWrite(relMetaPath, serializeMetadata(metadata))
    const result = await writeMetadataYaml(canvasDir, metadata, { createDir })
    if (result.skipped) {
      this.log.warn({ canvasDir, canvasPath }, 'Skipped metadata.yaml write: canvas directory does not exist')
    }
  }

  // ---- tree helpers for MetadataManager ----
  private findCanvasById(id: string): CanvasItem | undefined {
    const walk = (canvas: CanvasItem | undefined): CanvasItem | undefined => {
      if (!canvas) return undefined
      if (canvas.id === id) return canvas
      for (const item of canvas.items) {
        if (item.kind === 'canvas') {
          const found = walk(item)
          if (found) return found
        }
      }
      return undefined
    }
    return walk(this.connection?.proxy.root)
  }

  private listCanvasIds(): string[] {
    const ids: string[] = []
    const walk = (canvas: CanvasItem | undefined): void => {
      if (!canvas) return
      ids.push(canvas.id)
      for (const item of canvas.items) if (item.kind === 'canvas') walk(item)
    }
    walk(this.connection?.proxy.root)
    return ids
  }

  private toPosixRel(absPath: string): string {
    return path.relative(this.folder, absPath).split(path.sep).join('/')
  }

  // ---- uploads (POST /workspaces/:id/files) ----
  /**
   * Persist an uploaded binary into its target canvas directory on disk and
   * return where it landed. The write is suppression-tagged so the watcher drops
   * its own create echo — the renderer creates the node itself, so exactly one
   * node ends up backing the file. Runs on the shared queue (so the PathMapper it
   * reads is not mid-realign, and so a concurrent flush can't interleave).
   */
  handleUpload(request: UploadRequest): Promise<UploadResult> {
    return this.enqueue(async () => {
      const dirRel = this.resolveCanvasDir(request.canvasId)
      const dirAbs = dirRel.length === 0 ? this.folder : path.join(this.folder, dirRel)
      await fsp.mkdir(dirAbs, { recursive: true })

      // De-dupe against everything already in the directory (files AND dirs), not
      // just node files — an upload must never clobber an unrelated on-disk file.
      const existingLower = new Set<string>()
      for (const name of await fsp.readdir(dirAbs)) existingLower.add(name.toLowerCase())
      const finalName = dedupeFilename(request.filename, existingLower)
      const relPath = dirRel.length === 0 ? finalName : `${dirRel}/${finalName}`
      const mimeType = mimeTypeForUpload(finalName, request.mimeType)

      // Register the write BEFORE it lands so the watcher recognises its own echo.
      this.suppression.registerWrite(relPath, request.buffer)
      await fsp.writeFile(path.join(dirAbs, finalName), request.buffer)
      this.fileHashes.set(relPath, hashRaw(request.buffer))
      this.log.info({ relPath, size: request.buffer.length }, 'Stored uploaded file')

      return { storagePath: relPath, mimeType, size: request.buffer.length, filename: finalName }
    })
  }

  // ---- note-content save (PUT /workspaces/:id/notes/:nodeId/content — A1) ----
  /**
   * Save a user edit of a note's body to disk: atomic, suppressed, conflict-
   * guarded. Runs on the shared queue like `handleUpload` — never interleaves
   * with a watcher-driven folder→yDoc apply or a flusher reconcile.
   */
  handleNoteSave(request: NoteSaveRequest): Promise<NoteSaveResult> {
    return this.enqueue(() => this.doNoteSave(request))
  }

  handleNoteBaseline(nodeId: string): Promise<NoteBaselineResult> {
    return this.enqueue(async () => {
      let relPath = this.pathMapper?.getPathForNode(nodeId)
      if (!relPath) {
        // A renderer-created node can reach autosave immediately after its Yjs
        // transaction, before the next structural flush has rebuilt mappings.
        this.realign()
        relPath = this.pathMapper?.getPathForNode(nodeId)
      }
      if (!relPath) return { status: 404, error: 'Unknown node id' }
      if (!relPath.endsWith('.md') && !relPath.endsWith('.sticky.yaml')) {
        return { status: 422, error: 'Not a note-content file' }
      }
      // Missing from this map means the tracked workspace snapshot had no file
      // at this path. Do not hash the live file here: if one appeared after the
      // snapshot, the first guarded save must conflict rather than bless it.
      return { status: 200, hash: this.fileHashes.get(relPath) ?? null, relPath }
    })
  }

  private async doNoteSave({ nodeId, body, baseHash, force }: NoteSaveRequest): Promise<NoteSaveResult> {
    const rel = this.pathMapper?.getPathForNode(nodeId)
    if (!rel) return { status: 404, error: 'Unknown node id' }
    if (!rel.endsWith('.md') && !rel.endsWith('.sticky.yaml')) {
      return { status: 422, error: 'Not a note-content file' }
    }

    const bytes = rel.endsWith('.sticky.yaml')
      ? buildStickyYaml(body, this.stickyNodeData(nodeId))
      : joinFrontmatter(this.frontmatter.get(nodeId), body)

    const abs = path.join(this.folder, rel)
    let diskBytes: string | undefined
    try {
      diskBytes = await fsp.readFile(abs, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      diskBytes = undefined // ENOENT → treat as create, no conflict to guard against
    }

    if (baseHash !== undefined && !force) {
      const diskHash = diskBytes === undefined ? null : hashRaw(diskBytes)
      if (diskHash !== baseHash) return { status: 409, diskHash }
    }

    if (diskBytes === bytes) return { status: 200, hash: hashRaw(bytes), relPath: rel }

    await this.writeNoteContentAtomic(rel, bytes)
    return { status: 200, hash: hashRaw(bytes), relPath: rel }
  }

  /** Look up a sticky node's color/fontFamily in the live tree (same shape `FolderFlusher.buildContent` reads). */
  private stickyNodeData(nodeId: string): { color?: string; fontFamily?: string } {
    return (this.findNodeById(nodeId)?.xynode.data ?? {}) as { color?: string; fontFamily?: string }
  }

  private findNodeById(id: string): NodeItem | undefined {
    const walk = (canvas: CanvasItem | undefined): NodeItem | undefined => {
      if (!canvas) return undefined
      for (const item of canvas.items) {
        if (item.kind === 'node' && item.id === id) return item
        if (item.kind === 'canvas') {
          const found = walk(item)
          if (found) return found
        }
      }
      return undefined
    }
    return walk(this.connection?.proxy.root)
  }

  /** Write `bytes` to `rel` atomically — see `writeFileAtomic` for the pattern. */
  private async writeNoteContentAtomic(rel: string, bytes: string): Promise<void> {
    await writeFileAtomic(this.folder, rel, bytes, this.suppression)
    this.fileHashes.set(rel, hashRaw(bytes))
  }

  /** Resolve a canvas id to its folder-relative directory ('' = root). */
  private resolveCanvasDir(canvasId: string): string {
    const live = this.pathMapper?.getPathForCanvas(canvasId)
    if (live !== undefined) return live
    // The canvas may have been created moments ago and not yet re-aligned; fall
    // back to the on-disk sidecar index, then to the root.
    const idx = buildDiskIndex(this.folder, this.rootCanvasId)
    return idx.canvasIdToDir.get(canvasId) ?? ''
  }

  async stop(): Promise<void> {
    for (const pending of this.pendingDeletes.values()) clearTimeout(pending.timer)
    this.pendingDeletes.clear()
    const errors: unknown[] = []
    try {
      await this.folderFlusher?.stop()
    } catch (error) {
      errors.push(error)
    }
    const watcherResults = await Promise.allSettled([this.immediateWatcher?.stop(), this.settledWatcher?.stop()])
    for (const result of watcherResults) if (result.status === 'rejected') errors.push(result.reason)
    try {
      this.connection?.disconnect()
    } catch (error) {
      errors.push(error)
    }
    this.connection = null
    this.log.info('Sync orchestrator stopped')
    if (errors.length > 0) throw new AggregateError(errors, 'Sync orchestrator stopped with cleanup errors')
  }
}

/** SHA-256 of raw file content (text or binary), used for move pairing. */
function hashRaw(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
