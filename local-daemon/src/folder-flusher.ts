// The yDoc→folder flusher — the core novel work of this mission.
//
// After a debounced UI edit, reconcile the desired yDoc tree to disk so the
// folder becomes the true source of truth: note bodies → `.md`/`.sticky.yaml`,
// structure (positions/edges/groups/sections + node renames/moves/creates/deletes)
// → `metadata.yaml` + file operations. Every write is suppression-tagged so the
// daemon's own watcher ignores the echo; genuine external changes still flow.
//
// Design notes:
//   - COARSE per the plan: on a structural (root) change it re-reconciles the
//     whole workspace, but writes are idempotent (metadata.yaml skips when
//     byte-identical) so untouched files are never rewritten — the
//     non-destructive checksum guarantee holds.
//   - CONTENT OWNERSHIP (Mission A4.1): the flusher never rewrites an EXISTING
//     note's content file — that is exclusively SyncOrchestrator.handleNoteSave's
//     job (the user-edit autosave path, Mission A1). The flusher writes note
//     content exactly once per node: a brand-new node's initial (empty/trivial)
//     file, so adopt.ts's prune-nodes-without-files boot invariant holds. Every
//     other node-file touch here is a byte-exact move.
//   - RENAME/MOVE preserves bytes: a note file move copies whatever bytes are
//     CURRENTLY on disk verbatim (frontmatter included, even if they diverged
//     from the yDoc's fragment) to the new path — no markdown round-trip, so
//     frontmatter and any un-ingested external edit both stay intact.
//   - DELETES go to `.kanwas/trash/<stamp>/…`, never hard-delete.
//   - IDENTITY: the current on-disk id→path map (DiskIndex, from metadata.yaml)
//     lets a UI rename become a file move (id stable, edges preserved) instead of
//     an orphan + duplicate. After each structural flush the orchestrator's
//     PathMapper is realigned to disk so later external edits map correctly.
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'yaml'
import * as Y from 'yjs'
import type { Logger } from 'pino'
import { makeUniqueName, sanitizeFilename } from 'shared'
import type { CanvasItem, NodeItem } from 'shared'
import { ContentConverter } from 'shared/server'
import { writeFileAtomic } from './atomic-write.js'
import { buildCanvasMetadata } from './canvas-metadata.js'
import { buildDiskIndex, type DiskIndex } from './disk-index.js'
import { serializeMetadata } from './filesystem.js'
import { joinFrontmatter } from './frontmatter.js'
import type { FrontmatterRegistry } from './frontmatter-registry.js'
import { KANWAS_DIR } from './identity.js'
import type { SuppressionRegistry } from './suppression.js'

const SKIP_LIST_DIRS = new Set(['.git', 'node_modules', '.DS_Store', KANWAS_DIR])
const CONTENT_EXT: Record<string, string> = { blockNote: '.md', stickyNote: '.sticky.yaml' }
const BINARY_TYPES = new Set(['image', 'file', 'audio'])

/** The live yDoc view the flusher reconciles from. Injected so it is testable. */
export interface FlusherSource {
  /** Current root canvas of the live tree. */
  root(): CanvasItem | undefined
  /** BlockNote fragment for a note/sticky node id, or undefined if absent. */
  noteFragment(nodeId: string): Y.XmlFragment | undefined
  /** Rebuild the disk-aligned PathMapper after structural disk changes. */
  realign(): void
  /** Run a task serialized against the watcher event handlers (no interleave). */
  enqueue<T>(task: () => Promise<T>): Promise<T>
  /** Record the sha256 hex of the bytes now on disk (and in the yDoc) for `rel`. Used by moves/uploads. */
  recordSyncedHash(rel: string, hash: string): void
  /** Drop the tracked synced hash for `rel` (file moved/removed). */
  removeSyncedHash(rel: string): void
}

export interface FolderFlusherOptions {
  folder: string
  rootCanvasId: string
  source: FlusherSource
  suppression: SuppressionRegistry
  frontmatter: FrontmatterRegistry
  logger: Logger
  /** Debounce window for coalescing bursts of saves into one flush. */
  debounceMs?: number
  /** Upper bound on how long dirty state can go unflushed during continuous edits. */
  maxWaitMs?: number
}

interface PlannedNode {
  node: NodeItem
  rel: string
  isBinary: boolean
  existingRel?: string
}

interface DesiredLayout {
  canvasOrder: Array<{ canvasId: string; rel: string; canvas: CanvasItem }>
  nodeFiles: Map<string, PlannedNode>
  nodeIds: Set<string>
  canvasIds: Set<string>
}

export class FolderFlusher {
  private readonly folder: string
  private readonly rootCanvasId: string
  private readonly source: FlusherSource
  private readonly suppression: SuppressionRegistry
  private readonly frontmatter: FrontmatterRegistry
  private readonly log: Logger
  private readonly debounceMs: number
  private readonly maxWaitMs: number
  private readonly contentConverter = new ContentConverter()

  private armed = false
  private rootDirty = false
  /** Note ids touched since the last flush. No longer drives content writes for
   *  existing nodes (Mission A4.1) — kept as a signal for scheduling/diagnostics. */
  private dirtyNotes = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  /** Timestamp of the first schedule since the last completed flush (maxWait clock). */
  private pendingSince: number | null = null
  private running: Promise<void> | null = null
  private pendingWhileRunning = false
  /** Consecutive "fragment not ready" defers per node id, for a brand-new node's
   *  initial write only (buildContent → undefined). */
  private readonly fragmentRetryCounts = new Map<string, number>()
  /** Diagnostics: bounded-write assertions in the echo-storm test read this. */
  fileWriteCount = 0

  constructor(options: FolderFlusherOptions) {
    this.folder = options.folder
    this.rootCanvasId = options.rootCanvasId
    this.source = options.source
    this.suppression = options.suppression
    this.frontmatter = options.frontmatter
    this.log = options.logger.child({ component: 'FolderFlusher' })
    this.debounceMs = options.debounceMs ?? 600
    this.maxWaitMs = options.maxWaitMs ?? 2500
  }

  /** Enable disk writes. Before arming, save events are ignored (boot/seed phase). */
  arm(): void {
    this.armed = true
  }

  // ---- signals from the FolderStore (the room's debounced persistence seam) ----
  rootChanged(): void {
    this.rootDirty = true
    this.scheduleFlush()
  }

  noteChanged(noteId: string): void {
    this.dirtyNotes.add(noteId)
    this.scheduleFlush()
  }

  noteDeleted(_noteId: string): void {
    // The node is already gone from the tree; a structural reconcile trashes its file.
    this.rootDirty = true
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (!this.armed) return
    const now = Date.now()
    if (this.pendingSince === null) this.pendingSince = now
    if (this.flushTimer) clearTimeout(this.flushTimer)
    // Trailing debounce, but capped so continuous edits still flush at least every
    // maxWaitMs — otherwise a never-idle stream of edits could defer the write
    // indefinitely and leave disk arbitrarily stale.
    const delay = Math.min(this.debounceMs, Math.max(0, this.pendingSince + this.maxWaitMs - now))
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.runFlush()
    }, delay)
  }

  private runFlush(): Promise<void> {
    if (this.running) {
      this.pendingWhileRunning = true
      return this.running
    }
    this.running = this.doFlush().finally(() => {
      this.running = null
      if (this.pendingWhileRunning) {
        this.pendingWhileRunning = false
        this.scheduleFlush()
      }
    })
    return this.running
  }

  /** Force a synchronous flush (tests, shutdown). Bypasses the debounce. */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.runFlush()
  }

  async stop(): Promise<void> {
    // Run a pending debounced flush to completion rather than discarding it —
    // flushNow() does exactly that (clear timer, run now).
    if (this.flushTimer) {
      await this.flushNow()
    }
    if (this.running) await this.running
  }

  private async doFlush(): Promise<void> {
    const rootDirty = this.rootDirty
    const dirtyNotes = this.dirtyNotes
    this.rootDirty = false
    this.dirtyNotes = new Set()
    this.pendingSince = null

    try {
      await this.source.enqueue(() => this.reconcile(rootDirty))
    } catch (error) {
      this.log.error({ error: String(error) }, 'Flush failed')
      // Restore the dirty state this attempt was working from (union — a newly
      // dirtied note/root flag that arrived after the snapshot must not be
      // clobbered) so the next flush retries the work that failed.
      if (rootDirty) this.rootDirty = true
      for (const noteId of dirtyNotes) this.dirtyNotes.add(noteId)
      this.scheduleFlush()
    }
  }

  private async reconcile(rootDirty: boolean): Promise<void> {
    const root = this.source.root()
    if (!root) return

    let diskIndex = buildDiskIndex(this.folder, this.rootCanvasId)

    // 0. Propagate UI canvas renames to directory names (byte-preserving move,
    //    echoes suppressed). A renamed canvas keeps its id, so its directory can be
    //    moved rather than orphaned; rebuild the index afterwards so the steps below
    //    see the new paths and never mistake the dir move for a per-node move.
    if (rootDirty) {
      const renamed = await this.reconcileCanvasDirRenames(root, diskIndex)
      if (renamed) diskIndex = buildDiskIndex(this.folder, this.rootCanvasId)
    }

    const desired = this.planLayout(root, diskIndex)
    const trashStamp = new Date().toISOString().replace(/[:.]/g, '-')

    // 1. Directories + metadata.yaml (idempotent; only changed sidecars write).
    if (rootDirty) {
      for (const { rel, canvas } of desired.canvasOrder) {
        const dirAbs = rel.length === 0 ? this.folder : path.join(this.folder, rel)
        await fsp.mkdir(dirAbs, { recursive: true })
        const metadataText = serializeMetadata(buildCanvasMetadata(canvas))
        const relMeta = rel.length === 0 ? 'metadata.yaml' : `${rel}/metadata.yaml`
        await this.writeTextIfChanged(relMeta, metadataText)
      }
    }

    // 2. Node files: initial-content writes for new nodes + byte-exact moves.
    for (const planned of desired.nodeFiles.values()) {
      await this.reconcileNodeFile(planned)
    }

    // 3. Deletions → trash (never hard-delete).
    if (rootDirty) {
      await this.trashRemoved(diskIndex, desired, trashStamp)
    }

    // 4. Realign the orchestrator PathMapper to the new on-disk layout.
    if (rootDirty) this.source.realign()
  }

  // ---- canvas directory renames (UI rename → folder) ----------------------
  /**
   * Rename canvas directories so they follow UI renames, making the folder the
   * source of truth for canvas names. Walks the tree top-down so a renamed
   * ancestor moves before its descendants (which ride along with the parent's
   * move — never moved twice). A canvas is renamed only when its sanitized name
   * diverges from its current directory basename, so adopted directories whose
   * name already sanitizes to the canvas name (e.g. `README/`) are left untouched.
   * Returns true if any directory was moved.
   */
  private async reconcileCanvasDirRenames(root: CanvasItem, diskIndex: DiskIndex): Promise<boolean> {
    let didRename = false

    const walk = async (canvas: CanvasItem, rel: string): Promise<void> => {
      const reserved = new Set<string>()
      const pendingRenames: Array<{ child: CanvasItem; currentBasename: string }> = []

      const childCanvases = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')
      // Pass 1: descend into unchanged canvases and reserve their basenames so a
      // rename in pass 2 dedups against siblings that keep their directory.
      for (const child of childCanvases) {
        const existingDir = diskIndex.canvasIdToDir.get(child.id)
        if (existingDir === undefined || existingDir.length === 0) continue // new canvas → planLayout mkdirs it
        const currentBasename = existingDir.split('/').pop() ?? existingDir
        if (sanitizeFilename(currentBasename) === sanitizeFilename(child.name)) {
          reserved.add(currentBasename.toLowerCase())
          await walk(child, rel.length === 0 ? currentBasename : `${rel}/${currentBasename}`)
        } else {
          pendingRenames.push({ child, currentBasename })
        }
      }

      // Pass 2: move renamed directories (deduped against reserved names), then
      // descend into their NEW location.
      for (const { child, currentBasename } of pendingRenames) {
        const targetBasename = makeUniqueName(sanitizeFilename(child.name), reserved)
        const fromRel = rel.length === 0 ? currentBasename : `${rel}/${currentBasename}`
        const toRel = rel.length === 0 ? targetBasename : `${rel}/${targetBasename}`
        const moved = await this.renameCanvasDir(fromRel, toRel)
        if (moved) didRename = true
        await walk(child, moved ? toRel : fromRel)
      }
    }

    await walk(root, '')
    return didRename
  }

  /**
   * Move a canvas directory `fromRel` → `toRel`, preserving bytes. The OS rename
   * fires add/unlink echoes for every entry in the subtree; suppress them (writes
   * by content, deletes by path) so the daemon does not re-ingest its own move.
   * The new directory's own `addDir` is neutralized by the syncer's idempotent
   * create (the path already maps to this canvas). Returns true if it moved.
   */
  private async renameCanvasDir(fromRel: string, toRel: string): Promise<boolean> {
    if (fromRel === toRel) return false
    const fromAbs = path.join(this.folder, fromRel)
    const toAbs = path.join(this.folder, toRel)
    if (!fs.existsSync(fromAbs)) return false
    if (fs.existsSync(toAbs)) {
      this.log.warn({ fromRel, toRel }, 'Canvas directory rename target already exists; skipping')
      return false
    }

    for (const oldFileRel of listFilesRecursive(fromAbs, fromRel)) {
      const newFileRel = `${toRel}${oldFileRel.slice(fromRel.length)}`
      this.suppression.registerDelete(oldFileRel)
      try {
        this.suppression.registerWrite(newFileRel, await fsp.readFile(path.join(this.folder, oldFileRel)))
      } catch {
        /* entry vanished mid-scan; its echo resolves to a harmless no-op */
      }
    }
    this.suppression.registerDelete(fromRel)

    try {
      await this.ensureDir(toRel)
      await fsp.rename(fromAbs, toAbs)
    } catch (error) {
      this.log.warn({ fromRel, toRel, error: String(error) }, 'Canvas directory rename failed')
      return false
    }
    this.log.info({ fromRel, toRel }, 'Renamed canvas directory')
    return true
  }

  // ---- per-node reconcile -------------------------------------------------
  private async reconcileNodeFile(planned: PlannedNode): Promise<void> {
    const { node, rel, existingRel, isBinary } = planned
    const moved = existingRel !== undefined && existingRel !== rel

    if (isBinary) {
      // A UI rename of a binary node moves its file to match the new name (bytes
      // preserved). storagePath was already updated in planLayout, so metadata is
      // consistent. Never re-encode binary bytes otherwise.
      if (moved) await this.moveBinaryByteExact(existingRel!, rel)
      return
    }

    if (existingRel !== undefined) {
      // Existing node: content is owned exclusively by the editor's autosave path
      // (SyncOrchestrator.handleNoteSave, Mission A1) — the flusher never rewrites
      // it, regardless of note-content dirtiness. A UI rename/move still moves
      // whatever bytes are CURRENTLY on disk, byte-exactly (frontmatter intact,
      // and any un-ingested external edit intact too).
      if (moved) await this.moveByteExact(existingRel!, rel)
      return
    }

    // New node: write its initial content once (a just-created note's fragment is
    // empty/trivial), so adopt.ts's prune-nodes-without-files boot invariant holds.
    const content = await this.buildContent(node)
    if (content === undefined) {
      // Fragment not available yet (create race) — defer to the next flush, with a
      // bounded retry count so a node that never gets a fragment doesn't spin
      // forever (and doesn't silently vanish across a restart — adopt.ts prunes
      // nodes without backing files).
      const attempts = (this.fragmentRetryCounts.get(node.id) ?? 0) + 1
      if (attempts >= 20) {
        this.log.warn({ nodeId: node.id, rel }, 'giving up flushing note content; fragment never became available')
        this.fragmentRetryCounts.delete(node.id)
        return
      }
      this.fragmentRetryCounts.set(node.id, attempts)
      this.dirtyNotes.add(node.id)
      this.scheduleFlush()
      return
    }
    this.fragmentRetryCounts.delete(node.id)

    await this.writeInitialNodeContent(rel, content, node.id)
  }

  /**
   * Write a brand-new node's initial content, atomically. Idempotent (a retried
   * flush after a prior error may find the bytes already on disk) but otherwise
   * unconditional: a new node has never been synced before, so there is nothing
   * for the bytes to have diverged from.
   */
  private async writeInitialNodeContent(rel: string, content: string, nodeId: string): Promise<void> {
    const abs = path.join(this.folder, rel)
    let diskBytes: string | undefined
    try {
      diskBytes = await fsp.readFile(abs, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      diskBytes = undefined
    }

    if (diskBytes === content) {
      this.source.recordSyncedHash(rel, hashRaw(content))
      return
    }

    await writeFileAtomic(this.folder, rel, content, this.suppression)
    this.fileWriteCount++
    this.source.recordSyncedHash(rel, hashRaw(content))
    this.log.debug({ nodeId, rel }, 'Wrote initial content for new node')
  }

  private async buildContent(node: NodeItem): Promise<string | undefined> {
    const type = node.xynode.type
    if (type === 'blockNote') {
      const body = await this.noteMarkdown(node.id)
      if (body === undefined) return undefined
      return joinFrontmatter(this.frontmatter.get(node.id), body)
    }
    if (type === 'stickyNote') {
      const body = await this.noteMarkdown(node.id)
      const data = (node.xynode.data ?? {}) as { color?: string; fontFamily?: string }
      return buildStickyYaml(body ?? '', data)
    }
    return undefined
  }

  private async noteMarkdown(nodeId: string): Promise<string | undefined> {
    const fragment = this.source.noteFragment(nodeId)
    if (!fragment) return undefined
    try {
      return await this.contentConverter.fragmentToMarkdown(fragment)
    } catch (error) {
      this.log.warn({ nodeId, error: String(error) }, 'Failed to convert fragment to markdown')
      return undefined
    }
  }

  // ---- desired layout planning -------------------------------------------
  private planLayout(root: CanvasItem, diskIndex: DiskIndex): DesiredLayout {
    const desired: DesiredLayout = {
      canvasOrder: [],
      nodeFiles: new Map(),
      nodeIds: new Set(),
      canvasIds: new Set(),
    }

    const walk = (canvas: CanvasItem, rel: string): void => {
      desired.canvasIds.add(canvas.id)
      desired.canvasOrder.push({ canvasId: canvas.id, rel, canvas })

      const usedNames = new Set<string>()
      const fileNodes = canvas.items.filter(
        (item): item is NodeItem =>
          item.kind === 'node' &&
          (item.xynode.type === 'blockNote' || item.xynode.type === 'stickyNote' || BINARY_TYPES.has(item.xynode.type))
      )

      // Pass 1: keep the real filename for nodes whose name is unchanged.
      const deferred: NodeItem[] = []
      const binaryDeferred: Array<{ node: NodeItem; existingRel: string; ext: string }> = []
      for (const node of fileNodes) {
        desired.nodeIds.add(node.id)
        const existingRel = diskIndex.nodeIdToFile.get(node.id)
        const isBinary = BINARY_TYPES.has(node.xynode.type)
        if (isBinary) {
          // A binary with no on-disk file yet (just uploaded, not in a sidecar) is
          // left for the frontend's own write — nothing to reconcile.
          if (!existingRel) continue
          const base = existingRel.split('/').pop()!
          const dot = base.lastIndexOf('.')
          const ext = dot > 0 ? base.slice(dot) : ''
          const stem = ext ? base.slice(0, base.length - ext.length) : base
          if (sanitizeFilename(stem) === sanitizeFilename(node.name)) {
            usedNames.add(base.toLowerCase())
            desired.nodeFiles.set(node.id, { node, rel: existingRel, isBinary: true, existingRel })
          } else {
            // UI renamed the binary node → move its file to match (Pass 2).
            binaryDeferred.push({ node, existingRel, ext })
          }
          continue
        }
        const ext = CONTENT_EXT[node.xynode.type]
        if (existingRel) {
          const base = existingRel.split('/').pop()!
          const stem = base.slice(0, base.length - ext.length)
          if (base.toLowerCase().endsWith(ext) && sanitizeFilename(stem) === sanitizeFilename(node.name)) {
            usedNames.add(base.toLowerCase())
            desired.nodeFiles.set(node.id, { node, rel: existingRel, isBinary: false, existingRel })
            continue
          }
        }
        deferred.push(node)
      }

      // Pass 2: assign new / renamed content filenames with dedup.
      for (const node of deferred) {
        const ext = CONTENT_EXT[node.xynode.type]
        const unique = makeUniqueName(sanitizeFilename(node.name), usedNames, ext)
        const filename = `${unique}${ext}`
        const rel2 = rel.length === 0 ? filename : `${rel}/${filename}`
        desired.nodeFiles.set(node.id, {
          node,
          rel: rel2,
          isBinary: false,
          existingRel: diskIndex.nodeIdToFile.get(node.id),
        })
      }

      // Pass 2 (binary renames): move the backing file to match the new node name,
      // keeping the original extension. storagePath is updated NOW (planLayout runs
      // before any write) so this same flush emits a consistent metadata.yaml —
      // metadata (step 1) and the file move (step 2) both reflect the new path.
      for (const { node, existingRel, ext } of binaryDeferred) {
        const unique = makeUniqueName(sanitizeFilename(node.name), usedNames, ext)
        const filename = `${unique}${ext}`
        const rel2 = rel.length === 0 ? filename : `${rel}/${filename}`
        const data = node.xynode.data as Record<string, unknown>
        data.storagePath = rel2
        desired.nodeFiles.set(node.id, { node, rel: rel2, isBinary: true, existingRel })
      }

      // text / link nodes are metadata-only, but their ids must count as desired.
      for (const item of canvas.items) {
        if (item.kind === 'node') desired.nodeIds.add(item.id)
      }

      // Child canvases: reuse an existing dir (no rename) or make a unique new one.
      const childCanvases = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')
      for (const child of childCanvases) {
        const existingDir = diskIndex.canvasIdToDir.get(child.id)
        let childRel: string
        if (existingDir !== undefined && existingDir.length > 0) {
          childRel = existingDir
          usedNames.add((existingDir.split('/').pop() ?? existingDir).toLowerCase())
        } else {
          const unique = makeUniqueName(sanitizeFilename(child.name), usedNames)
          childRel = rel.length === 0 ? unique : `${rel}/${unique}`
        }
        walk(child, childRel)
      }
    }

    walk(root, '')
    return desired
  }

  // ---- trash --------------------------------------------------------------
  private async trashRemoved(diskIndex: DiskIndex, desired: DesiredLayout, stamp: string): Promise<void> {
    // Top-most removed canvas dirs (a removed dir carries its descendants).
    const removedDirs: string[] = []
    for (const [canvasId, rel] of diskIndex.canvasIdToDir) {
      if (rel.length === 0 || canvasId === this.rootCanvasId) continue
      if (desired.canvasIds.has(canvasId)) continue
      removedDirs.push(rel)
    }
    const topDirs = removedDirs.filter((d) => !removedDirs.some((o) => o !== d && isUnder(d, o)))

    for (const dir of topDirs) {
      await this.trashDir(dir, stamp)
    }

    for (const [nodeId, rel] of diskIndex.nodeIdToFile) {
      if (desired.nodeIds.has(nodeId)) continue
      if (topDirs.some((d) => isUnder(rel, d))) continue // already went with its dir
      await this.trashFile(rel, stamp)
    }
  }

  private async trashDir(rel: string, stamp: string): Promise<void> {
    const abs = path.join(this.folder, rel)
    // Suppress the unlink echoes for every watched file under the dir.
    for (const fileRel of listFilesRecursive(abs, rel)) {
      this.suppression.registerDelete(fileRel)
      this.source.removeSyncedHash(fileRel)
    }
    this.suppression.registerDelete(rel)
    await this.moveToTrash(abs, rel, stamp)
    this.log.info({ rel }, 'Trashed removed canvas directory')
  }

  private async trashFile(rel: string, stamp: string): Promise<void> {
    this.suppression.registerDelete(rel)
    this.source.removeSyncedHash(rel)
    await this.moveToTrash(path.join(this.folder, rel), rel, stamp)
    this.log.info({ rel }, 'Trashed removed node file')
  }

  private async moveToTrash(srcAbs: string, rel: string, stamp: string): Promise<void> {
    if (!fs.existsSync(srcAbs)) return
    const dest = path.join(this.folder, KANWAS_DIR, 'trash', stamp, rel)
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.rename(srcAbs, dest).catch(async (error) => {
      this.log.warn({ rel, error: String(error) }, 'Trash move failed')
    })
  }

  // ---- low-level suppressed writes ---------------------------------------
  private async ensureDir(rel: string): Promise<void> {
    const dirRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    const dirAbs = dirRel.length === 0 ? this.folder : path.join(this.folder, dirRel)
    await fsp.mkdir(dirAbs, { recursive: true })
  }

  /** Write text only if the on-disk bytes differ; suppress the resulting echo. */
  private async writeTextIfChanged(rel: string, content: string): Promise<boolean> {
    const abs = path.join(this.folder, rel)
    try {
      if ((await fsp.readFile(abs, 'utf-8')) === content) return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.suppression.registerWrite(rel, content)
    await fsp.writeFile(abs, content, 'utf-8')
    this.fileWriteCount++
    return true
  }

  /** Copy a node file to a new path preserving exact bytes, then remove the old. */
  private async moveByteExact(oldRel: string, newRel: string): Promise<void> {
    const oldAbs = path.join(this.folder, oldRel)
    let bytes: string
    try {
      bytes = await fsp.readFile(oldAbs, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    await this.ensureDir(newRel)
    this.suppression.registerWrite(newRel, bytes)
    await fsp.writeFile(path.join(this.folder, newRel), bytes, 'utf-8')
    this.fileWriteCount++
    this.source.recordSyncedHash(newRel, hashRaw(bytes))
    await this.removeSuppressed(oldRel)
    this.log.info({ oldRel, newRel }, 'Renamed/moved node file')
  }

  /** Move a binary file to a new path preserving exact bytes, then remove the old. */
  private async moveBinaryByteExact(oldRel: string, newRel: string): Promise<void> {
    const oldAbs = path.join(this.folder, oldRel)
    let bytes: Buffer
    try {
      bytes = await fsp.readFile(oldAbs)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    await this.ensureDir(newRel)
    this.suppression.registerWrite(newRel, bytes)
    await fsp.writeFile(path.join(this.folder, newRel), bytes)
    this.fileWriteCount++
    this.source.recordSyncedHash(newRel, hashRaw(bytes))
    await this.removeSuppressed(oldRel)
    this.log.info({ oldRel, newRel }, 'Renamed/moved binary file')
  }

  private async removeSuppressed(rel: string): Promise<void> {
    this.suppression.registerDelete(rel)
    this.source.removeSyncedHash(rel)
    await fsp.rm(path.join(this.folder, rel), { force: true })
  }
}

/** SHA-256 hex of raw file content (text or binary) — mirrors SyncOrchestrator's hashRaw. */
function hashRaw(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Compose a `.sticky.yaml` file body from a note body and the node's color/
 * fontFamily. Shared between the flusher's own reserialization and
 * `SyncOrchestrator.handleNoteSave` (A1) so the two write paths never diverge.
 */
export function buildStickyYaml(content: string, data: { color?: string; fontFamily?: string }): string {
  const obj: Record<string, unknown> = { content }
  if (data.color) obj.color = data.color
  if (data.fontFamily) obj.fontFamily = data.fontFamily
  return yaml.stringify(obj)
}

function isUnder(rel: string, dir: string): boolean {
  return rel === dir || rel.startsWith(`${dir}/`)
}

function listFilesRecursive(absDir: string, relDir: string): string[] {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_LIST_DIRS.has(e.name)) continue
    const childRel = relDir.length === 0 ? e.name : `${relDir}/${e.name}`
    if (e.isDirectory()) out.push(...listFilesRecursive(path.join(absDir, e.name), childRel))
    else out.push(childRel)
  }
  return out
}
