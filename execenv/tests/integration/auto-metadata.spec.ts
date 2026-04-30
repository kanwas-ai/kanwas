/**
 * Auto-metadata management tests.
 *
 * Tests for SyncManager's automatic metadata.yaml creation and updates.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import * as yaml from 'yaml'
import { type CanvasItem, type NodeItem, type WorkspaceConnection } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { readMetadataYaml } from '../../src/filesystem.js'
import { SyncManager } from '../../src/sync-manager.js'
import { FileWatcher, type FileChangeEvent } from '../../src/watcher.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  delay,
  resetWorkspaceToEmpty,
  testLogger,
  trackConnection,
  cleanupConnections,
  trackWatcher,
  cleanupWatchers,
} from '../helpers/index.js'

interface CanvasSnapshot {
  id: string
  name: string
  edgeIds: string[]
  childCanvasIds: string[]
  childCanvasNames: string[]
  nodeIds: string[]
  nodeNames: string[]
}

interface NestedCanvasState {
  parentCanvas: CanvasItem
  childCanvas: CanvasItem
  childNodeIds: string[]
  childNodeNames: string[]
  parentSnapshot: CanvasSnapshot
  childSnapshot: CanvasSnapshot
}

function findCanvasByNamePath(root: CanvasItem, names: string[]): CanvasItem | null {
  let current: CanvasItem | null = root
  for (const name of names) {
    current = current.items.find((item): item is CanvasItem => item.kind === 'canvas' && item.name === name) ?? null
    if (!current) {
      return null
    }
  }
  return current
}

function assertCanvasTreeHasItems(canvas: CanvasItem, pathSegments: string[] = ['root']): void {
  expect(Array.isArray(canvas.items), `Canvas at ${pathSegments.join(' > ')} is missing items[]`).toBe(true)
  expect(Array.isArray(canvas.edges), `Canvas at ${pathSegments.join(' > ')} is missing edges[]`).toBe(true)

  for (const item of canvas.items) {
    if (item.kind === 'canvas') {
      assertCanvasTreeHasItems(item, [...pathSegments, item.name || item.id])
    }
  }
}

function getSyncManagerConnection(syncManager: SyncManager): WorkspaceConnection {
  const connection = (syncManager as unknown as { connection: WorkspaceConnection | null }).connection
  if (!connection) {
    throw new Error('Expected SyncManager to hold an active workspace connection')
  }

  return connection
}

async function waitForCondition<T>(
  getValue: () => T,
  isComplete: (value: T) => boolean,
  timeoutMs = 8000,
  intervalMs = 100
): Promise<T> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = getValue()
    if (isComplete(value)) {
      return value
    }

    await delay(intervalMs)
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`)
}

function snapshotCanvas(canvas: CanvasItem): CanvasSnapshot {
  const childCanvases = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')
  const childNodes = canvas.items.filter((item): item is NodeItem => item.kind === 'node')

  return {
    id: canvas.id,
    name: canvas.name,
    edgeIds: canvas.edges.map((edge) => edge.id),
    childCanvasIds: childCanvases.map((item) => item.id),
    childCanvasNames: childCanvases.map((item) => item.name),
    nodeIds: childNodes.map((item) => item.id),
    nodeNames: childNodes.map((item) => item.name),
  }
}

function assertUniqueIds(ids: string[], label: string): void {
  expect(new Set(ids).size, `${label} should not contain duplicate ids`).toBe(ids.length)
}

async function createSyncManager(
  testEnv: TestEnvironment,
  workspacePath: string,
  activeSyncManagers: SyncManager[]
): Promise<SyncManager> {
  const syncManager = new SyncManager({
    workspaceId: testEnv.workspaceId,
    yjsServerHost: testEnv.yjsServerHost,
    workspacePath,
    backendUrl: testEnv.backendUrl,
    authToken: testEnv.authToken,
    userId: 'test-user',
    logger: testLogger,
  })

  activeSyncManagers.push(syncManager)
  await syncManager.initialize()
  return syncManager
}

async function createNestedCanvasSkeleton(syncManager: SyncManager, workspacePath: string) {
  const projectsDir = path.join(workspacePath, 'projects')
  const repositioningDir = path.join(projectsDir, 'kanwas-repositioning')
  const usecasesDir = path.join(repositioningDir, 'kanwas-video-usecases')

  await fs.mkdir(projectsDir, { recursive: true })
  await syncManager.handleFileChange('create', projectsDir)
  await waitForCondition(
    () => findCanvasByNamePath(getSyncManagerConnection(syncManager).proxy.root as CanvasItem, ['projects']),
    (canvas) => canvas !== null
  )

  await fs.mkdir(repositioningDir, { recursive: true })
  await syncManager.handleFileChange('create', repositioningDir)
  await waitForCondition(
    () =>
      findCanvasByNamePath(getSyncManagerConnection(syncManager).proxy.root as CanvasItem, [
        'projects',
        'kanwas-repositioning',
      ]),
    (canvas) => canvas !== null
  )

  await fs.mkdir(usecasesDir, { recursive: true })
  await syncManager.handleFileChange('create', usecasesDir)
  await waitForCondition(
    () =>
      findCanvasByNamePath(getSyncManagerConnection(syncManager).proxy.root as CanvasItem, [
        'projects',
        'kanwas-repositioning',
        'kanwas-video-usecases',
      ]),
    (canvas) => canvas !== null
  )

  return { projectsDir, repositioningDir, usecasesDir }
}

function getNestedCanvasState(root: CanvasItem): NestedCanvasState {
  const parentCanvas = findCanvasByNamePath(root, ['projects', 'kanwas-repositioning'])
  const childCanvas = findCanvasByNamePath(root, ['projects', 'kanwas-repositioning', 'kanwas-video-usecases'])

  expect(parentCanvas).toBeDefined()
  expect(childCanvas).toBeDefined()

  assertCanvasTreeHasItems(root)

  const childNodes = (childCanvas as CanvasItem).items.filter((item): item is NodeItem => item.kind === 'node')
  const childNodeIds = childNodes.map((item) => item.id)
  const childNodeNames = childNodes.map((item) => item.name)
  assertUniqueIds(childNodeIds, 'Child canvas nodes')

  return {
    parentCanvas: parentCanvas as CanvasItem,
    childCanvas: childCanvas as CanvasItem,
    childNodeIds,
    childNodeNames,
    parentSnapshot: snapshotCanvas(parentCanvas as CanvasItem),
    childSnapshot: snapshotCanvas(childCanvas as CanvasItem),
  }
}

async function waitForNestedCanvasState(
  syncManager: SyncManager,
  expectedNodeNames: string[]
): Promise<NestedCanvasState> {
  const expectedSortedNames = [...expectedNodeNames].sort()

  return waitForCondition(
    () => getNestedCanvasState(getSyncManagerConnection(syncManager).proxy.root as CanvasItem),
    (state) => [...state.childNodeNames].sort().join('\u0000') === expectedSortedNames.join('\u0000')
  )
}

function expectNestedCanvasState(state: NestedCanvasState, expectedNodeNames: string[]) {
  expect(state.parentSnapshot.childCanvasIds).toHaveLength(1)
  expect(state.parentSnapshot.childCanvasIds[0]).toBe(state.childCanvas.id)
  expect(state.parentSnapshot.childCanvasNames).toEqual(['kanwas-video-usecases'])
  expect([...state.childNodeNames].sort()).toEqual([...expectedNodeNames].sort())
  expect(state.childSnapshot.nodeIds).toEqual(state.childNodeIds)
  expect(state.childSnapshot.nodeNames).toEqual(state.childNodeNames)
}

function getExpectedNodeNamesFromFiles(filenames: string[]): string[] {
  return filenames.map((filename) => filename.replace(/\.md$/, ''))
}

async function startWorkspaceWatcher(
  workspacePath: string,
  syncManager: SyncManager,
  activeWatchers: FileWatcher[]
): Promise<void> {
  let ready = false

  const watcher = trackWatcher(
    new FileWatcher({
      watchPath: workspacePath,
      onFileChange: async (event: FileChangeEvent) => {
        const relativePath = path.relative(workspacePath, event.path)
        if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
          return
        }

        await syncManager.handleFileChange(event.type, event.path)
      },
      onReady: () => {
        ready = true
      },
      onError: (err) => console.error('[Auto-Metadata watcher] Error:', err),
      logger: testLogger,
    }),
    activeWatchers
  )

  watcher.start()
  await waitForCondition(
    () => ready,
    (isReady) => isReady,
    5000,
    50
  )
}

describe('Auto-Metadata Management', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeSyncManagers: SyncManager[] = []
  const activeConnections: WorkspaceConnection[] = []
  const activeWatchers: FileWatcher[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-test-'))
    console.error(`Created temp workspace: ${workspacePath}`)
  })

  afterEach(async () => {
    await cleanupWatchers(activeWatchers)

    // Shutdown all sync managers
    for (const manager of activeSyncManagers) {
      manager.shutdown()
    }
    activeSyncManagers.length = 0
    cleanupConnections(activeConnections)
    activeConnections.length = 0

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to delete temp workspace: ${err}`)
    }
  })

  it('should auto-create metadata.yaml when canvas directory is created', async () => {
    // Initialize SyncManager with required backendUrl and authToken
    const syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager)
    await syncManager.initialize()

    // Create a canvas directory
    const canvasDir = path.join(workspacePath, 'auto-test')
    await fs.mkdir(canvasDir, { recursive: true })

    // Trigger the file change handler (simulating watcher event)
    await syncManager.handleFileChange('create', canvasDir)

    // Wait for async operations
    await delay(500)

    // Verify metadata.yaml was auto-created
    const metadata = await readMetadataYaml(canvasDir)
    expect(metadata).toBeDefined()
    expect(metadata!.name).toBe('auto-test')
    expect(metadata!.id).toBeDefined()
    expect(metadata!.id.length).toBeGreaterThan(0)
    expect(metadata!.nodes).toEqual([])
    expect(metadata!.edges).toEqual([])
  })

  it('should auto-add node to metadata.yaml when .md file is created', async () => {
    // Initialize SyncManager
    const syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager)
    await syncManager.initialize()

    // Create canvas directory and trigger auto-metadata
    const canvasDir = path.join(workspacePath, 'node-test')
    await fs.mkdir(canvasDir, { recursive: true })
    await syncManager.handleFileChange('create', canvasDir)
    await delay(500)

    // Create first .md file
    const note1Path = path.join(canvasDir, 'first-note.md')
    await fs.writeFile(note1Path, '# First Note\n\nContent here.')
    await syncManager.handleFileChange('create', note1Path)
    await delay(500)

    // Verify node was added to metadata
    let metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(1)
    expect(metadata!.nodes[0].name).toBe('first-note')
    expect(metadata!.nodes[0].xynode.position).toEqual({ x: 0, y: 0 })

    // Create second .md file - should be positioned horizontally
    const note2Path = path.join(canvasDir, 'second-note.md')
    await fs.writeFile(note2Path, '# Second Note')
    await syncManager.handleFileChange('create', note2Path)
    await delay(500)

    // Verify second node was added; filesystem-created nodes remain unresolved for frontend placement.
    metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(2)
    const secondNode = metadata!.nodes.find((n) => n.name === 'second-note')
    expect(secondNode).toBeDefined()
    expect(secondNode!.xynode.position).toEqual({ x: 0, y: 0 })
  })

  it('should auto-remove node from metadata.yaml when .md file is deleted', async () => {
    // Initialize SyncManager
    const syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager)
    await syncManager.initialize()

    // Create canvas with a node
    const canvasDir = path.join(workspacePath, 'delete-node-test')
    await fs.mkdir(canvasDir, { recursive: true })
    await syncManager.handleFileChange('create', canvasDir)
    await delay(500)

    // Add a node
    const notePath = path.join(canvasDir, 'to-delete.md')
    await fs.writeFile(notePath, '# To Delete')
    await syncManager.handleFileChange('create', notePath)
    await delay(500)

    // Verify node exists
    let metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(1)

    // Delete the file
    await fs.unlink(notePath)
    await syncManager.handleFileChange('delete', notePath)
    await delay(500)

    // Verify node was removed from metadata
    metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(0)
  })

  it('should auto-clean edges when node is deleted', async () => {
    // Initialize SyncManager
    const syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager)
    await syncManager.initialize()

    // Create canvas with two nodes
    const canvasDir = path.join(workspacePath, 'edge-test')
    await fs.mkdir(canvasDir, { recursive: true })
    await syncManager.handleFileChange('create', canvasDir)
    await delay(500)

    const note1Path = path.join(canvasDir, 'node-a.md')
    const note2Path = path.join(canvasDir, 'node-b.md')
    await fs.writeFile(note1Path, '# Node A')
    await fs.writeFile(note2Path, '# Node B')
    await syncManager.handleFileChange('create', note1Path)
    await syncManager.handleFileChange('create', note2Path)
    await delay(500)

    // Manually add an edge between the nodes
    let metadata = await readMetadataYaml(canvasDir)
    const nodeAId = metadata!.nodes.find((n) => n.name === 'node-a')!.id
    const nodeBId = metadata!.nodes.find((n) => n.name === 'node-b')!.id
    metadata!.edges = [{ id: 'edge-1', source: nodeAId, target: nodeBId }]
    await fs.writeFile(path.join(canvasDir, 'metadata.yaml'), yaml.stringify(metadata))

    // Verify edge exists
    metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.edges.length).toBe(1)

    // Delete node-a
    await fs.unlink(note1Path)
    await syncManager.handleFileChange('delete', note1Path)
    await delay(500)

    // Verify edge was cleaned up
    metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(1)
    expect(metadata!.edges.length).toBe(0)
  })

  it('recreates a nested canvas as an empty shell until descendant events replay', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)

    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    const { repositioningDir, usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)
    const overviewPath = path.join(usecasesDir, 'overview.md')

    await fs.writeFile(overviewPath, '# Overview')
    await syncManager.handleFileChange('create', overviewPath)
    await delay(1000)

    const rootBeforeDelete = connection.proxy.root as CanvasItem
    const positionedCanvas = findCanvasByNamePath(rootBeforeDelete, [
      'projects',
      'kanwas-repositioning',
      'kanwas-video-usecases',
    ])
    expect(positionedCanvas).toBeDefined()
    expect(positionedCanvas?.items.filter((item) => item.kind === 'node')).toHaveLength(1)

    await fs.rm(repositioningDir, { recursive: true, force: true })
    await syncManager.handleFileChange('delete', repositioningDir)
    await delay(1000)

    await fs.mkdir(repositioningDir, { recursive: true })
    await syncManager.handleFileChange('create', repositioningDir)
    await delay(1000)

    const rootAfterRecreate = connection.proxy.root as CanvasItem
    const recreatedCanvas = findCanvasByNamePath(rootAfterRecreate, ['projects', 'kanwas-repositioning'])
    const missingGrandchild = findCanvasByNamePath(rootAfterRecreate, [
      'projects',
      'kanwas-repositioning',
      'kanwas-video-usecases',
    ])

    expect(recreatedCanvas).toBeDefined()
    expect(recreatedCanvas?.items).toEqual([])
    expect(missingGrandchild).toBeNull()

    await fs.mkdir(usecasesDir, { recursive: true })
    await syncManager.handleFileChange('create', usecasesDir)
    await delay(500)

    await fs.writeFile(overviewPath, '# Overview restored')
    await syncManager.handleFileChange('create', overviewPath)
    await delay(1000)

    const rootAfterReplay = connection.proxy.root as CanvasItem
    const restoredCanvas = findCanvasByNamePath(rootAfterReplay, [
      'projects',
      'kanwas-repositioning',
      'kanwas-video-usecases',
    ])

    expect(restoredCanvas).toBeDefined()
    expect(restoredCanvas?.items.filter((item) => item.kind === 'node')).toHaveLength(1)
  }, 20000)

  it('preserves the nested child canvas during a direct create-event burst', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)

    const before = await waitForNestedCanvasState(syncManager, [])
    expectNestedCanvasState(before, [])
    const childCanvasIdBefore = before.childCanvas.id
    const parentSnapshotBefore = before.parentSnapshot

    const filenames = [
      'overview.md',
      'day-01-claude-code-threat-board.md',
      'day-02-the-meeting-builds-itself.md',
      'day-03-roadmap-board-before-the-meeting.md',
      'day-04-ai-catches-the-contradiction.md',
      'day-05-research-wall-to-patterns.md',
      'day-06-prd-from-the-actual-context.md',
      'day-07-the-board-that-stays-alive.md',
    ]

    for (const [index, filename] of filenames.entries()) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nIncident-shaped nested write ${index + 1}.`)
      await syncManager.handleFileChange('create', filePath)
    }

    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)
    const after = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(after, expectedNodeNames)
    expect(after.childCanvas.id).toBe(childCanvasIdBefore)
    expect(after.parentSnapshot.id).toBe(parentSnapshotBefore.id)
    expect(after.parentSnapshot.edgeIds).toEqual(parentSnapshotBefore.edgeIds)
    expect(after.parentSnapshot.childCanvasIds).toEqual(parentSnapshotBefore.childCanvasIds)
    expect(after.parentSnapshot.childCanvasNames).toEqual(parentSnapshotBefore.childCanvasNames)
  }, 20000)

  it('serializes multiple direct create requests without losing nested child canvas state', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)

    const before = await waitForNestedCanvasState(syncManager, [])
    const childCanvasIdBefore = before.childCanvas.id

    const filenames = [
      'overview.md',
      'day-08-investor-war-room.md',
      'day-09-enterprise-deal-decision-room.md',
      'day-10-launch-room-mixed-signals.md',
      'day-11-competitive-teardown-with-live-embeds.md',
    ]

    await Promise.all(
      filenames.map(async (filename, index) => {
        const filePath = path.join(usecasesDir, filename)
        await fs.writeFile(filePath, `# ${filename}\n\nConcurrent nested write ${index + 1}.`)
        return syncManager.handleFileChange('create', filePath)
      })
    )

    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)
    const after = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(after, expectedNodeNames)
    expect(after.childCanvas.id).toBe(childCanvasIdBefore)
  }, 20000)

  it('preserves nested child canvas state during direct create followed by update events', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)

    const filenames = ['overview.md', 'day-12-code-shipped-now-brief-the-team.md', 'day-13-board-meeting-prep.md']
    const before = await waitForNestedCanvasState(syncManager, [])

    for (const filename of filenames) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nFirst pass.`)
      await syncManager.handleFileChange('create', filePath)
      await fs.writeFile(filePath, `# ${filename}\n\nSecond pass after immediate update.`)
      await syncManager.handleFileChange('update', filePath)
    }

    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)
    const after = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(after, expectedNodeNames)
    expect(after.childCanvas.id).toBe(before.childCanvas.id)
    expect(after.parentSnapshot.childCanvasIds).toEqual(before.parentSnapshot.childCanvasIds)
  }, 20000)

  it('preserves nested child canvas after reconnect following settled direct writes', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)

    const filenames = ['overview.md', 'day-01.md', 'day-02.md', 'day-03.md', 'day-04.md', 'day-05.md', 'day-06.md']
    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)

    for (const filename of filenames) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nReconnect regression.`)
      await syncManager.handleFileChange('create', filePath)
    }

    const beforeReconnect = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(beforeReconnect, expectedNodeNames)

    syncManager.shutdown()
    activeSyncManagers.pop()
    await delay(1000)

    const reconnectedManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)

    const afterReconnect = await waitForNestedCanvasState(reconnectedManager, expectedNodeNames)
    expectNestedCanvasState(afterReconnect, expectedNodeNames)
    expect(afterReconnect.parentSnapshot.childCanvasIds).toEqual(beforeReconnect.parentSnapshot.childCanvasIds)
    expect(afterReconnect.childCanvas.id).toBe(beforeReconnect.childCanvas.id)
    expect(afterReconnect.childCanvas.name).toBe('kanwas-video-usecases')
  }, 25000)

  it('keeps unaffected parent structure stable when only child files change via direct events', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)

    const before = await waitForNestedCanvasState(syncManager, [])
    const rootBefore = getSyncManagerConnection(syncManager).proxy.root as CanvasItem
    const projectsBefore = findCanvasByNamePath(rootBefore, ['projects']) as CanvasItem
    const projectsSnapshotBefore = snapshotCanvas(projectsBefore)
    const repositioningSnapshotBefore = before.parentSnapshot
    const childSnapshotBefore = before.childSnapshot

    const filenames = ['overview.md', 'day-14-spawn-a-room-for-any-hard-question.md']
    for (const filename of filenames) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nChild-only write.`)
      await syncManager.handleFileChange('create', filePath)
    }

    const after = await waitForNestedCanvasState(syncManager, getExpectedNodeNamesFromFiles(filenames))
    const rootAfter = getSyncManagerConnection(syncManager).proxy.root as CanvasItem
    const projectsAfter = findCanvasByNamePath(rootAfter, ['projects']) as CanvasItem
    const projectsSnapshotAfter = snapshotCanvas(projectsAfter)

    assertCanvasTreeHasItems(rootAfter)
    expect(projectsSnapshotAfter.id).toBe(projectsSnapshotBefore.id)
    expect(projectsSnapshotAfter.edgeIds).toEqual(projectsSnapshotBefore.edgeIds)
    expect(projectsSnapshotAfter.childCanvasIds).toEqual(projectsSnapshotBefore.childCanvasIds)
    expect(after.parentSnapshot.id).toBe(repositioningSnapshotBefore.id)
    expect(after.parentSnapshot.edgeIds).toEqual(repositioningSnapshotBefore.edgeIds)
    expect(after.parentSnapshot.childCanvasIds).toEqual(repositioningSnapshotBefore.childCanvasIds)
    expect(after.parentSnapshot.childCanvasNames).toEqual(repositioningSnapshotBefore.childCanvasNames)
    expect(after.childCanvas.id).toBe(childSnapshotBefore.id)
    expect(after.childSnapshot.edgeIds).toEqual(childSnapshotBefore.edgeIds)
    expect(after.childSnapshot.childCanvasIds).toEqual(childSnapshotBefore.childCanvasIds)
    expect(after.childSnapshot.childCanvasNames).toEqual(childSnapshotBefore.childCanvasNames)
  }, 20000)

  it('preserves nested child canvas during watcher-driven burst file creation', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)
    await startWorkspaceWatcher(workspacePath, syncManager, activeWatchers)

    const before = await waitForNestedCanvasState(syncManager, [])
    const childCanvasIdBefore = before.childCanvas.id

    const filenames = ['overview.md', 'watcher-day-01.md', 'watcher-day-02.md', 'watcher-day-03.md']

    for (const [index, filename] of filenames.entries()) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nWatcher nested write ${index + 1}.`)
    }

    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)
    const after = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(after, expectedNodeNames)
    expect(after.childCanvas.id).toBe(childCanvasIdBefore)
  }, 25000)

  it('preserves nested child canvas during watcher-driven create and immediate rewrite', async () => {
    const syncManager = await createSyncManager(testEnv, workspacePath, activeSyncManagers)
    const { usecasesDir } = await createNestedCanvasSkeleton(syncManager, workspacePath)
    await startWorkspaceWatcher(workspacePath, syncManager, activeWatchers)

    const filenames = ['overview.md', 'watcher-hot-edit.md']
    for (const filename of filenames) {
      const filePath = path.join(usecasesDir, filename)
      await fs.writeFile(filePath, `# ${filename}\n\nFirst watcher pass.`)
      await fs.writeFile(filePath, `# ${filename}\n\nSecond watcher pass.`)
    }

    const expectedNodeNames = getExpectedNodeNamesFromFiles(filenames)
    const after = await waitForNestedCanvasState(syncManager, expectedNodeNames)
    expectNestedCanvasState(after, expectedNodeNames)
  }, 20000)
})
