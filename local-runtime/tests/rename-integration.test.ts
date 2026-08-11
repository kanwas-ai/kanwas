// Mission A4.2 — git-mv ghost-sidecar regression.
//
// Exercises the ACTUAL defect: `git mv thinking workbench` while the runtime is
// running left a resurrected `thinking/metadata.yaml` with a FRESH canvas id and
// empty nodes. Root cause: a stale watcher event for a path under the old
// directory (queued behind the real directory-rename detection) minted a canvas
// via `ensureParentCanvas`, and the sidecar write `mkdir`'d the dead directory.
//
// This test boots the SAME disk-facing pieces `SyncOrchestrator.start()` wires up
// (pathMapper, FilesystemSyncer with `directoryExists`, MetadataManager, and REAL
// FileWatcher instances) WITHOUT a live yjs socket — mirroring the private-field
// injection pattern in sync-orchestrator-note-save.test.ts — then performs a real
// `fs.renameSync` and lets the REAL chokidar watchers detect it, so the test
// exercises the genuine event-ordering races the bug depends on, not a mocked
// approximation of them.
//
// Coverage note: this does NOT boot a live yjs socket or a FolderFlusher (not
// needed — the defect and its fix are entirely in the disk→yDoc direction). It
// DOES exercise real chokidar timing, real `fs.rename`, and the production
// `SyncOrchestrator`/`FilesystemSyncer`/`MetadataManager` code paths verbatim.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
import { PathMapper } from 'shared'
import type { CanvasItem, CanvasMetadata, WorkspaceDocument } from 'shared'
import { ContentConverter, FilesystemSyncer } from 'shared/server'
import { adoptFolder } from '../src/adopt.js'
import { rebuildDiskAlignedMappings } from '../src/disk-align.js'
import { readFileBinary } from '../src/filesystem.js'
import { FrontmatterRegistry } from '../src/frontmatter-registry.js'
import { createLogger } from '../src/logger.js'
import { MetadataManager } from '../src/metadata-manager.js'
import { SuppressionRegistry } from '../src/suppression.js'
import { SyncOrchestrator } from '../src/sync-orchestrator.js'
import { FileWatcher, type WatchEvent, type WatcherOptions } from '../src/watcher.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeFolder(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-rename-'))
  tmpDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

function readMeta(dir: string): Record<string, unknown> {
  return yaml.parse(fs.readFileSync(path.join(dir, 'metadata.yaml'), 'utf-8')) as Record<string, unknown>
}

function findCanvases(root: CanvasItem | undefined, predicate: (c: CanvasItem) => boolean): CanvasItem[] {
  if (!root) return []
  const out: CanvasItem[] = []
  if (predicate(root)) out.push(root)
  for (const item of root.items) {
    if (item.kind === 'canvas') out.push(...findCanvases(item, predicate))
  }
  return out
}

/** Start a FileWatcher and resolve once chokidar reports it's ready (initial scan done). */
function startWatcherReady(options: Omit<WatcherOptions, 'onReady'>): Promise<FileWatcher> {
  return new Promise((resolve) => {
    const watcher = new FileWatcher({ ...options, onReady: () => resolve(watcher) })
    watcher.start()
  })
}

interface Harness {
  orchestrator: SyncOrchestrator
  proxy: WorkspaceDocument
  watchers: FileWatcher[]
}

/**
 * Boot the disk-facing pieces `SyncOrchestrator.start()` wires up (pathMapper,
 * FilesystemSyncer, MetadataManager, watchers) WITHOUT a live yjs socket. Private
 * fields are injected via `Object.assign`, same escape hatch
 * sync-orchestrator-note-save.test.ts uses for `handleNoteSave`-only tests; here
 * we additionally start REAL watchers so `onWatchEvent` runs off genuine fs events.
 */
async function bootOrchestrator(folder: string): Promise<Harness> {
  const frontmatter = new FrontmatterRegistry()
  const suppression = new SuppressionRegistry()
  const adopted = await adoptFolder({ folder, rootId: 'root', logger, frontmatter })

  const pathMapper = new PathMapper()
  rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder)
  const contentConverter = new ContentConverter()

  const orchestrator = new SyncOrchestrator({
    folder,
    workspaceId: 'ws-test',
    rootCanvasId: 'root',
    yjsHost: 'localhost:0', // unused: start() is never called
    secret: 'test-secret',
    logger,
    suppression,
    frontmatter,
    seededEmpty: false,
  })

  const syncer = new FilesystemSyncer({
    proxy: adopted.proxy,
    yDoc: adopted.yDoc,
    contentStore: adopted.contentStore,
    pathMapper,
    contentConverter,
    fileUploader: async () => {
      throw new Error('fileUploader not expected in this test')
    },
    fileReader: (rel) => readFileBinary(path.join(folder, rel)),
    autoCreateCanvases: true,
    // The A4.2 fix under test: refuse to mint a canvas for a directory a stale
    // event references but that no longer exists on disk.
    directoryExists: (rel) => fs.existsSync(path.join(folder, rel)),
  })

  const findCanvasById = (id: string): CanvasItem | undefined => {
    const walk = (c: CanvasItem | undefined): CanvasItem | undefined => {
      if (!c) return undefined
      if (c.id === id) return c
      for (const item of c.items) {
        if (item.kind === 'canvas') {
          const found = walk(item)
          if (found) return found
        }
      }
      return undefined
    }
    return walk(adopted.proxy.root)
  }
  const listCanvasIds = (): string[] => {
    const ids: string[] = []
    const walk = (c: CanvasItem | undefined): void => {
      if (!c) return
      ids.push(c.id)
      for (const item of c.items) if (item.kind === 'canvas') walk(item)
    }
    walk(adopted.proxy.root)
    return ids
  }

  Object.assign(orchestrator as unknown as Record<string, unknown>, {
    pathMapper,
    connection: { proxy: adopted.proxy },
    syncer,
  })

  const metadataManager = new MetadataManager({
    logger,
    workspacePath: folder,
    findCanvasById,
    getCanvasPathById: (id) => pathMapper.getPathForCanvas(id),
    listCanvasIds,
    // The other A4.2 fix under test: the private writeSuppressedMetadata now
    // threads `createDir` through to the no-mkdir-by-default writeMetadataYaml.
    writeMetadata: (canvasDir, canvasPath, metadata, createDir) =>
      (
        orchestrator as unknown as {
          writeSuppressedMetadata: (
            canvasDir: string,
            canvasPath: string,
            metadata: CanvasMetadata,
            createDir: boolean
          ) => Promise<void>
        }
      ).writeSuppressedMetadata(canvasDir, canvasPath, metadata, createDir),
  })
  Object.assign(orchestrator as unknown as Record<string, unknown>, { metadataManager })

  // Materialize sidecars for canvases that lack one — same as start() step 3.
  await metadataManager.materializeMissing(async (canvasPath) => {
    const dir = canvasPath.length === 0 ? folder : path.join(folder, canvasPath)
    return fs.existsSync(path.join(dir, 'metadata.yaml'))
  })

  // Start REAL watchers wired to the orchestrator's private onWatchEvent — same
  // as start() step 4, minus the yjs socket.
  const orchestratorInternals = orchestrator as unknown as { onWatchEvent: (e: WatchEvent) => Promise<void> }
  const dispatch = (e: WatchEvent): Promise<void> => orchestratorInternals.onWatchEvent(e)

  const [immediateWatcher, settledWatcher] = await Promise.all([
    startWatcherReady({
      watchPath: folder,
      content: 'text',
      logger,
      awaitWriteFinish: false,
      onFileChange: dispatch,
      onError: () => {},
    }),
    startWatcherReady({
      watchPath: folder,
      content: 'binary',
      logger,
      onFileChange: dispatch,
      onError: () => {},
    }),
  ])

  return { orchestrator, proxy: adopted.proxy, watchers: [immediateWatcher, settledWatcher] }
}

describe('git-mv ghost-sidecar regression (A4.2)', () => {
  it('renaming a canvas directory on disk (git mv) leaves no ghost at the old path and preserves canvas/node identity', async () => {
    const folder = makeFolder({
      'thinking/topic-a.md': '# Topic A\n\nSome thinking about A.\n',
      'thinking/topic-b.md': '# Topic B\n\nSome thinking about B.\n',
    })

    const { proxy, watchers } = await bootOrchestrator(folder)

    const originalMeta = readMeta(path.join(folder, 'thinking'))
    const originalCanvasId = originalMeta.id as string
    const originalNodeIds = (originalMeta.nodes as Array<{ id: string; name: string }>).map((n) => n.id).sort()
    expect(originalNodeIds).toHaveLength(2)

    try {
      // Equivalent to `git mv thinking workbench` — same rename() syscall.
      fs.renameSync(path.join(folder, 'thinking'), path.join(folder, 'workbench'))

      // Settle: let chokidar detect + pair the directory rename, any stale
      // nested-file events resolve, and the DELETE_DEFER_MS / RENAME_WINDOW_MS
      // windows lapse.
      await new Promise((resolve) => setTimeout(resolve, 2500))

      // Old path fully gone — no resurrected directory, no ghost sidecar. This
      // is the core defect: `writeMetadataYaml` used to `mkdir` it back.
      expect(fs.existsSync(path.join(folder, 'thinking'))).toBe(false)

      // New path holds the ORIGINAL canvas id (renamed, not recreated) and the
      // same node ids.
      const newMeta = readMeta(path.join(folder, 'workbench'))
      expect(newMeta.id).toBe(originalCanvasId)
      expect((newMeta.nodes as Array<{ id: string }>).map((n) => n.id).sort()).toEqual(originalNodeIds)

      // Exactly one canvas named "workbench" in the live tree — no ghost
      // duplicate minted from a stale `ensureParentCanvas` mint.
      const workbenchCanvases = findCanvases(proxy.root, (c) => c.name === 'workbench')
      expect(workbenchCanvases).toHaveLength(1)
      expect(workbenchCanvases[0]!.id).toBe(originalCanvasId)

      // No stray "thinking" canvas survives in the live tree either.
      expect(findCanvases(proxy.root, (c) => c.name === 'thinking')).toHaveLength(0)
    } finally {
      await Promise.all(watchers.map((w) => w.stop()))
    }
  }, 15_000)
})
