/**
 * Two-connection sync tests.
 *
 * Tests for syncing between multiple connections and persistence across disconnects.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { type WorkspaceConnection, type CanvasItem } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'

import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  cleanupConnections,
  delay,
  resetWorkspaceToEmpty,
} from '../helpers/index.js'

describe('Two-Connection Sync', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
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
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-test-'))
  })

  afterEach(async () => {
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should sync canvas creation between two connections', async () => {
    // First connection
    const conn1 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    if (!conn1.proxy.root) {
      conn1.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvasId = `canvas-sync-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Synced Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    conn1.proxy.root.items.push(canvas)

    await delay(500)

    // Second connection
    const conn2 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Verify conn2 sees the canvas
    const canvasInConn2 = conn2.proxy.root?.items?.find(
      (item) => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    expect(canvasInConn2).toBeDefined()
    expect(canvasInConn2.name).toBe('Synced Canvas')
  })
})

describe('Persistence Across Connections', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
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
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-test-'))
  })

  afterEach(async () => {
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should persist changes across disconnect/reconnect', async () => {
    const uniqueId = `persist-${Date.now()}`

    // First connection: create data
    const conn1 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    if (!conn1.proxy.root) {
      conn1.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: uniqueId,
      name: 'Persistent Canvas',
      xynode: { id: uniqueId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    conn1.proxy.root.items.push(canvas)

    // Wait for sync
    await delay(500)

    // Disconnect
    conn1.disconnect()
    activeConnections.length = 0

    // Wait a bit
    await delay(300)

    // Second connection: verify data persisted
    const conn2 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    const persistedCanvas = conn2.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === uniqueId
    ) as CanvasItem
    expect(persistedCanvas).toBeDefined()
    expect(persistedCanvas.name).toBe('Persistent Canvas')
  })
})
