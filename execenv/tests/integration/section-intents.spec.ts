import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { type CanvasItem, type NodeItem, type WorkspaceConnection } from 'shared'
import { readMetadataYaml } from '../../src/filesystem.js'
import { SyncManager } from '../../src/sync-manager.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  delay,
  resetWorkspaceToEmpty,
  testLogger,
  cleanupConnections,
} from '../helpers/index.js'

const PLACEMENT_ROOT = '/tmp/kanwas-placement'

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

function getCanvasByName(root: CanvasItem, name: string): CanvasItem | null {
  return root.items.find((item): item is CanvasItem => item.kind === 'canvas' && item.name === name) ?? null
}

function getNodeByName(canvas: CanvasItem, name: string): NodeItem | null {
  return canvas.items.find((item): item is NodeItem => item.kind === 'node' && item.name === name) ?? null
}

async function writeSectionIntent(relativePath: string, section: Record<string, unknown>): Promise<string> {
  const placementPath = path.join(PLACEMENT_ROOT, `${relativePath}.json`)
  await fs.mkdir(path.dirname(placementPath), { recursive: true })
  await fs.writeFile(placementPath, JSON.stringify({ section }), 'utf-8')
  return placementPath
}

describe('Section Intents', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  let syncManager: SyncManager | null = null
  let placementCleanupPath: string | null = null
  const activeConnections: WorkspaceConnection[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-section-intents-'))

    syncManager = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })

    await syncManager.initialize()
  })

  afterEach(async () => {
    syncManager?.shutdown()
    syncManager = null
    cleanupConnections(activeConnections)

    if (placementCleanupPath) {
      await fs.rm(placementCleanupPath, { recursive: true, force: true })
      placementCleanupPath = null
    }

    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('persists section create/join intents into canonical canvas state and metadata.yaml', async () => {
    const manager = syncManager
    if (!manager) {
      throw new Error('Expected SyncManager to be initialized')
    }

    const canvasDirName = `section-intents-${Date.now()}`
    const canvasDir = path.join(workspacePath, canvasDirName)
    placementCleanupPath = path.join(PLACEMENT_ROOT, canvasDirName)

    await fs.mkdir(canvasDir, { recursive: true })
    await manager.handleFileChange('create', canvasDir)

    const canvas = await waitForCondition(
      () => getCanvasByName(getSyncManagerConnection(manager).proxy.root as CanvasItem, canvasDirName),
      (value) => value !== null
    )

    expect(canvas).not.toBeNull()

    const overviewRelativePath = path.join(canvasDirName, 'demo-overview.md')
    const overviewPath = path.join(workspacePath, overviewRelativePath)
    await writeSectionIntent(overviewRelativePath, {
      mode: 'create',
      title: 'Overview',
      layout: 'horizontal',
      x: 120,
      y: 240,
    })
    await fs.writeFile(overviewPath, '# Demo overview\n')
    await manager.handleFileChange('create', overviewPath)

    const overviewState = await waitForCondition(
      () => {
        const currentCanvas = getCanvasByName(getSyncManagerConnection(manager).proxy.root as CanvasItem, canvasDirName)
        const overviewNode = currentCanvas ? getNodeByName(currentCanvas, 'demo-overview') : null
        return { currentCanvas, overviewNode }
      },
      (value) =>
        value.currentCanvas !== null && value.overviewNode !== null && (value.currentCanvas.sections?.length ?? 0) === 1
    )

    const overviewCanvas = overviewState.currentCanvas as CanvasItem
    const overviewNode = overviewState.overviewNode as NodeItem
    const overviewSection = overviewCanvas.sections?.[0]

    expect(overviewSection).toBeDefined()
    expect(overviewSection?.title).toBe('Overview')
    expect(overviewSection?.layout).toBe('horizontal')
    expect(overviewSection?.position).toEqual({ x: 120, y: 240 })
    expect(overviewSection?.memberIds).toEqual([overviewNode.id])
    expect((overviewNode.xynode.data as { sectionId?: string }).sectionId).toBe(overviewSection?.id)

    const snapshotRelativePath = path.join(canvasDirName, 'demo-snapshot.md')
    const snapshotPath = path.join(workspacePath, snapshotRelativePath)
    await writeSectionIntent(snapshotRelativePath, { mode: 'join', title: 'Overview' })
    await fs.writeFile(snapshotPath, '# Demo snapshot\n')
    await manager.handleFileChange('create', snapshotPath)

    const joinedState = await waitForCondition(
      () => {
        const currentCanvas = getCanvasByName(getSyncManagerConnection(manager).proxy.root as CanvasItem, canvasDirName)
        const overview = currentCanvas ? getNodeByName(currentCanvas, 'demo-overview') : null
        const snapshot = currentCanvas ? getNodeByName(currentCanvas, 'demo-snapshot') : null
        return { currentCanvas, overview, snapshot }
      },
      (value) => {
        const section = value.currentCanvas?.sections?.find((candidate) => candidate.title === 'Overview')
        return (
          value.currentCanvas !== null &&
          value.overview !== null &&
          value.snapshot !== null &&
          section !== undefined &&
          section.memberIds.length === 2
        )
      }
    )

    const joinedCanvas = joinedState.currentCanvas as CanvasItem
    const joinedOverviewNode = joinedState.overview as NodeItem
    const joinedSnapshotNode = joinedState.snapshot as NodeItem
    const joinedSection = joinedCanvas.sections?.find((candidate) => candidate.title === 'Overview')

    expect(joinedSection).toBeDefined()
    expect(joinedSection?.memberIds).toEqual([joinedOverviewNode.id, joinedSnapshotNode.id])
    expect((joinedOverviewNode.xynode.data as { sectionId?: string }).sectionId).toBe(joinedSection?.id)
    expect((joinedSnapshotNode.xynode.data as { sectionId?: string }).sectionId).toBe(joinedSection?.id)

    await delay(500)

    const metadata = await readMetadataYaml(canvasDir)
    expect(metadata).toBeDefined()
    expect(metadata?.sections).toBeDefined()
    expect(metadata?.sections).toHaveLength(1)
    expect(metadata?.sections?.[0]).toMatchObject({
      title: 'Overview',
      layout: 'horizontal',
      position: { x: 120, y: 240 },
      memberIds: [joinedOverviewNode.id, joinedSnapshotNode.id],
    })

    const overviewMetadataNode = metadata?.nodes.find((node) => node.name === 'demo-overview')
    const snapshotMetadataNode = metadata?.nodes.find((node) => node.name === 'demo-snapshot')

    expect(overviewMetadataNode?.sectionId).toBe(joinedSection?.id)
    expect(snapshotMetadataNode?.sectionId).toBe(joinedSection?.id)
  }, 20000)
})
