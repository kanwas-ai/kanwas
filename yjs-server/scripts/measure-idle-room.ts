import path from 'node:path'
import process from 'node:process'
import * as Y from 'yjs'
import { NoopBackendNotifier } from '../src/backend-notifier.js'
import { logger } from '../src/logger.js'
import { WorkspaceRoom } from '../src/room.js'
import { findWorkspaceNotesMap } from '../src/room-types.js'
import { FileDocumentStore } from '../src/storage.js'

interface CliOptions {
  count: number
  dataDir: string
  workspaceId: string
}

interface MemorySnapshot {
  arrayBuffers: number
  external: number
  heapUsed: number
  rss: number
}

interface RoomInternals {
  loadAllNoteIds: () => Promise<string[]>
  rootState: {
    doc: Y.Doc
  }
}

function parseArgs(argv: string[]): CliOptions {
  let workspaceId: string | null = null
  let dataDir = '.yjs-server-data'
  let count = 1

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--workspace-id') {
      workspaceId = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (arg === '--data-dir') {
      dataDir = argv[index + 1] ?? dataDir
      index += 1
      continue
    }

    if (arg === '--count') {
      count = Number.parseInt(argv[index + 1] ?? '1', 10)
      index += 1
      continue
    }
  }

  if (!workspaceId) {
    throw new Error('Missing required --workspace-id <id> argument')
  }

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Expected --count to be a positive integer')
  }

  return {
    count,
    dataDir: path.resolve(dataDir),
    workspaceId,
  }
}

function snapshotMemory(): MemorySnapshot {
  const usage = process.memoryUsage()
  return {
    arrayBuffers: usage.arrayBuffers,
    external: usage.external,
    heapUsed: usage.heapUsed,
    rss: usage.rss,
  }
}

function diffMemory(after: MemorySnapshot, before: MemorySnapshot): MemorySnapshot {
  return {
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    external: after.external - before.external,
    heapUsed: after.heapUsed - before.heapUsed,
    rss: after.rss - before.rss,
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

async function collectStoredSizes(store: FileDocumentStore, workspaceId: string, noteIds: string[]) {
  const rootBytes = (await store.loadRoot(workspaceId))?.byteLength ?? 0
  let totalNoteBytes = 0

  for (const noteId of noteIds) {
    totalNoteBytes += (await store.loadNote(workspaceId, noteId))?.byteLength ?? 0
  }

  return {
    rootBytes,
    totalNoteBytes,
    totalStoredBytes: rootBytes + totalNoteBytes,
  }
}

function forceGc(): void {
  if (typeof global.gc !== 'function') {
    throw new Error('This script must be run with node --expose-gc')
  }

  for (let index = 0; index < 3; index += 1) {
    global.gc()
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const store = new FileDocumentStore(options.dataDir, logger)

  forceGc()
  const baseline = snapshotMemory()

  const rooms: WorkspaceRoom[] = []
  for (let index = 0; index < options.count; index += 1) {
    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 1_000,
      store,
      workspaceId: options.workspaceId,
    })

    await room.initialize()
    await (room as unknown as RoomInternals).loadAllNoteIds()
    rooms.push(room)
  }

  forceGc()
  const afterLoad = snapshotMemory()

  const rootDoc = (rooms[0] as unknown as RoomInternals).rootState.doc
  const noteIds = Array.from(findWorkspaceNotesMap(rootDoc)?.keys() ?? []).sort()
  const storedSizes = await collectStoredSizes(store, options.workspaceId, noteIds)
  const delta = diffMemory(afterLoad, baseline)

  const result = {
    count: options.count,
    workspaceId: options.workspaceId,
    dataDir: options.dataDir,
    noteCount: noteIds.length,
    rootEncodedBytesInMemory: Y.encodeStateAsUpdateV2(rootDoc).byteLength,
    ...storedSizes,
    baseline,
    afterLoad,
    delta,
  }

  console.log(JSON.stringify(result, null, 2))
  console.log('')
  console.log(`Idle room retained rss delta: ${formatBytes(delta.rss)}`)
  console.log(`Idle room retained heapUsed delta: ${formatBytes(delta.heapUsed)}`)
  console.log(`Per-room rss delta: ${formatBytes(delta.rss / options.count)}`)
  console.log(`Per-room heapUsed delta: ${formatBytes(delta.heapUsed / options.count)}`)
  console.log(`Stored root bytes: ${formatBytes(storedSizes.rootBytes)}`)
  console.log(`Stored note bytes: ${formatBytes(storedSizes.totalNoteBytes)}`)
  console.log(`Stored total bytes: ${formatBytes(storedSizes.totalStoredBytes)}`)

  await Promise.all(rooms.map((room) => room.flushAndDestroy()))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(message)
  process.exitCode = 1
})
