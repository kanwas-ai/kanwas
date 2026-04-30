import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { type CanvasItem, type WorkspaceConnection } from 'shared'
import { LiveStateServer } from '../../src/live-state-server.js'
import { SyncManager } from '../../src/sync-manager.js'
import {
  cleanupConnections,
  delay,
  resetWorkspaceToEmpty,
  setupTestEnvironment,
  testLogger,
  type TestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
} from '../helpers/index.js'

function getSyncManagerConnection(syncManager: SyncManager): WorkspaceConnection {
  const connection = (syncManager as unknown as { connection: WorkspaceConnection | null }).connection
  if (!connection) {
    throw new Error('Expected SyncManager to hold an active workspace connection')
  }

  return connection
}

function getCanvasByName(root: CanvasItem, name: string): CanvasItem | null {
  return root.items.find((item): item is CanvasItem => item.kind === 'canvas' && item.name === name) ?? null
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

describe('LiveStateServer integration', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  let syncManager: SyncManager | null = null
  let liveStateServer: LiveStateServer | null = null
  const activeConnections: WorkspaceConnection[] = []
  const port = 43129

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-live-state-server-'))

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

    liveStateServer = new LiveStateServer(syncManager, testLogger, port)
    await liveStateServer.start()
  })

  afterEach(async () => {
    await liveStateServer?.stop()
    liveStateServer = null
    syncManager?.shutdown()
    syncManager = null
    cleanupConnections(activeConnections)
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('returns false before a section exists and true after create sync adds it', async () => {
    const manager = syncManager
    if (!manager) {
      throw new Error('Expected SyncManager to be initialized')
    }

    const canvasDirName = `live-state-${Date.now()}`
    const canvasDir = path.join(workspacePath, canvasDirName)

    await fs.mkdir(canvasDir, { recursive: true })
    await manager.handleFileChange('create', canvasDir)

    await waitForCondition(
      () => getCanvasByName(getSyncManagerConnection(manager).proxy.root as CanvasItem, canvasDirName),
      (value) => value !== null
    )

    const beforeResponse = await fetch(`http://127.0.0.1:${port}/sections/wait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relativePath: `${canvasDirName}/notes.md`, title: 'Overview', timeoutMs: 0 }),
    })

    expect(beforeResponse.status).toBe(200)
    await expect(beforeResponse.json()).resolves.toEqual({ ok: true, exists: false })

    const notePath = path.join(canvasDir, 'notes.md')
    const placementPath = path.join('/tmp/kanwas-placement', canvasDirName, 'notes.md.json')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(
      placementPath,
      JSON.stringify({
        section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 },
      })
    )
    await fs.writeFile(notePath, '# Overview\n', 'utf-8')
    await manager.handleFileChange('create', notePath)

    await waitForCondition(
      () => getCanvasByName(getSyncManagerConnection(manager).proxy.root as CanvasItem, canvasDirName)?.sections,
      (value) => (value?.length ?? 0) === 1
    )

    const afterResponse = await fetch(`http://127.0.0.1:${port}/sections/wait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relativePath: `${canvasDirName}/notes.md`, title: 'Overview', timeoutMs: 0 }),
    })

    expect(afterResponse.status).toBe(200)
    await expect(afterResponse.json()).resolves.toEqual({ ok: true, exists: true })
  }, 20000)
})
