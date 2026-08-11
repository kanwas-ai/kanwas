// Per-folder mount: extracts the folder→workspace bring-up sequence that used to
// run inline in index.ts (identity, template seed, adoption, live sync, flusher
// arm+bind) into a reusable unit. MountManager (mount-manager.ts) uses this to
// host many folders in one process (Phase 2); for now index.ts calls it once.
//
// Each mount owns its OWN SuppressionRegistry and FrontmatterRegistry — they are
// per-folder state (echo-cancellation keys are relative paths, frontmatter keys
// are node ids, both only unique WITHIN a folder), so a runtime hosting several
// mounts must never share them across workspaces.
import fs from 'node:fs'
import type { Logger } from 'pino'
import type { RoomManager } from '@kanwas/yjs-core'
import { assertValidWorkspaceRoot } from 'shared/canvas-tree'
import { createWorkspaceSnapshotBundle } from 'shared/server'
import { adoptFolder } from './adopt.js'
import { FolderStore } from './folder-store.js'
import { FrontmatterRegistry } from './frontmatter-registry.js'
import { loadOrCreateWorkspaceIdentity } from './identity.js'
import { seedWorkspaceTemplateIfEmpty } from './seed-template.js'
import { SuppressionRegistry } from './suppression.js'
import { SyncOrchestrator } from './sync-orchestrator.js'
import type { UploadHandler } from './upload.js'

export interface MountOptions {
  /** Folder to serve as a workspace. */
  folder: string
  /** The embedded Yjs core's room manager — seeds the room in-process (no HTTP round-trip). */
  roomManager: RoomManager
  /** The runtime-wide FolderStore; the mount binds its flusher into it, keyed by workspaceId. */
  store: FolderStore
  /** Per-run HMAC secret shared with the REST minter and the socket verifier. */
  secret: string
  /** Same-origin URL the watcher client uses for the embedded Yjs socket. */
  yjsOrigin: string
  yjsSocketPath: string
  templatesDir: string
  logger: Logger
}

export interface Mount {
  folder: string
  workspaceId: string
  /** Hyphen-stripped workspace id the renderer routes to. */
  workspaceUrlId: string
  orchestrator: SyncOrchestrator
  handleUpload: UploadHandler
  /** Stop the orchestrator and unbind its flusher from the store. */
  stop(): Promise<void>
}

/**
 * Bring a single folder up as a live Kanwas workspace: stable identity, template
 * seed (empty folders only), non-destructive adoption into the room, then live
 * folder↔yDoc sync with the flusher armed and bound. Mirrors steps 1b–3b of the
 * old inline index.ts sequence exactly — this is an extraction, not a rewrite.
 */
export async function mountFolder(options: MountOptions): Promise<Mount> {
  const { folder, roomManager, store, secret, yjsOrigin, yjsSocketPath, templatesDir, logger } = options
  const log = logger.child({ component: 'Mount', folder })

  // Brand-new folder is allowed: create it (empty → seeded).
  fs.mkdirSync(folder, { recursive: true })

  const identity = loadOrCreateWorkspaceIdentity(folder)
  log.info({ workspaceId: identity.workspaceId }, 'Mounting folder')

  // Per-mount state: echo-cancellation (both sync directions) and the node-id →
  // frontmatter registry (split off on read, re-prepended on flush).
  const suppression = new SuppressionRegistry()
  const frontmatter = new FrontmatterRegistry()

  // 1. Brand-new (empty) workspace → drop the AGENTS.md guide so a user's CLI
  //    agent finds instructions. Gated on emptiness, so an existing folder is
  //    never injected with a file. Runs BEFORE adoption, so the file adopts as a
  //    normal node on first boot (and persists across restarts).
  await seedWorkspaceTemplateIfEmpty(folder, logger, templatesDir)

  // 2. Adopt the folder into a fresh, disposable yDoc (NON-DESTRUCTIVE) and seed
  //    the room with it via replaceDocument (in-process — no HTTP round-trip).
  //    The store is not yet armed for this workspace, so the seed's own saves
  //    buffer bytes without rewriting the folder they were just read from.
  const adopted = await adoptFolder({ folder, rootId: identity.rootId, logger, frontmatter })
  assertValidWorkspaceRoot(adopted.yDoc.getMap('state').get('root'))
  const bundle = createWorkspaceSnapshotBundle(adopted.yDoc)
  try {
    await roomManager.replaceDocument(identity.workspaceId, bundle, { reason: 'runtime-adopt' })
  } catch (error) {
    await roomManager.closeRoom(identity.workspaceId).catch((cleanupError) => {
      log.error({ error: String(cleanupError) }, 'Could not close a room after adoption failed')
    })
    store.unbindFlusher(identity.workspaceId)
    throw error
  } finally {
    adopted.yDoc.destroy() // the offline adoption doc is disposable
  }
  log.info(
    { canvases: adopted.canvasCount, nodes: adopted.nodeCount, notes: Object.keys(bundle.notes).length },
    'Seeded room from folder'
  )

  // 3. Live folder↔yDoc sync (watcher client + chokidar) + the yDoc→folder flusher.
  const orchestrator = new SyncOrchestrator({
    folder,
    workspaceId: identity.workspaceId,
    rootCanvasId: identity.rootId,
    yjsHost: yjsOrigin,
    yjsSocketPath,
    secret,
    logger,
    suppression,
    frontmatter,
    seededEmpty: adopted.seededEmpty,
    recoveredCanvasIds: adopted.recoveredCanvasIds,
  })
  try {
    await orchestrator.start()

    // 3b. Arm the flusher and bind it to the store under this workspace's id. From
    //     here on, UI edits (which arrive as debounced saveRoot/saveNote on the
    //     store) flush to this mount's folder.
    orchestrator.flusher.arm()
    store.bindFlusher(identity.workspaceId, orchestrator.flusher)
  } catch (error) {
    await orchestrator.stop().catch((cleanupError) => {
      log.error({ error: String(cleanupError) }, 'Could not stop a partially mounted synchronizer')
    })
    await roomManager.closeRoom(identity.workspaceId).catch((cleanupError) => {
      log.error({ error: String(cleanupError) }, 'Could not close a partially mounted room')
    })
    store.unbindFlusher(identity.workspaceId)
    throw error
  }

  return {
    folder,
    workspaceId: identity.workspaceId,
    workspaceUrlId: identity.workspaceUrlId,
    orchestrator,
    handleUpload: (request) => orchestrator.handleUpload(request),
    async stop() {
      try {
        await orchestrator.stop()
      } finally {
        store.unbindFlusher(identity.workspaceId)
      }
    },
  }
}
