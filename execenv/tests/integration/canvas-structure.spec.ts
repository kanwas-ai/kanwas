/**
 * Canvas structure sync tests.
 *
 * Tests for creating canvases and nested canvas structures.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { type WorkspaceConnection, type CanvasItem } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { workspaceToFilesystem, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

import { writeFSNode, clearDirectory } from '../../src/filesystem.js'
import { FileWatcher, type FileChangeEvent } from '../../src/watcher.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  trackWatcher,
  cleanupConnections,
  cleanupWatchers,
  createTestSyncer,
  delay,
  resetWorkspaceToEmpty,
} from '../helpers/index.js'

describe('Canvas Structure Sync', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
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
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
      console.error(`Deleted temp workspace: ${workspacePath}`)
    } catch (err) {
      console.error(`Failed to delete temp workspace: ${err}`)
    }
  })

  it('should connect to Yjs server and create empty canvas', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    expect(connection.provider.synced).toBe(true)

    // Create empty canvas
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvasId = `canvas-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }

    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Convert workspace to filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)

    // Write to disk
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify canvas directory exists
    const canvasDir = path.join(workspacePath, 'test-canvas')
    expect(
      await fs
        .access(canvasDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    // Verify metadata.yaml exists
    const metadataFile = path.join(canvasDir, 'metadata.yaml')
    expect(
      await fs
        .access(metadataFile)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)
  })

  it('should create canvas via FileWatcher', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    // Set up syncer
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Track sync results
    let createResult: { canvasId?: string } | null = null

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          console.error(`[FileWatcher] ${event.type}: ${event.path}`)

          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
            return
          }

          let content: string | undefined
          if (event.type !== 'delete' && !event.isDirectory) {
            try {
              content = await fs.readFile(event.path, 'utf-8')
            } catch {
              // File may have been deleted
            }
          }

          const result = await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })

          if (result.action === 'created_canvas') {
            createResult = { canvasId: result.canvasId }
          }
        },
        onReady: () => console.error('[FileWatcher] Ready'),
        onError: (err) => console.error('[FileWatcher] Error:', err),
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    // Create a canvas directory (no c- prefix)
    const canvasName = `New Canvas ${Date.now()}`
    const canvasDirName = canvasName.replace(/ /g, '-')
    const newCanvasPath = path.join(workspacePath, canvasDirName)
    await fs.mkdir(newCanvasPath, { recursive: true })

    // Sync the creation
    const result = await syncer.syncChange({
      type: 'create',
      path: canvasDirName,
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('created_canvas')
    expect(result.canvasId).toBeDefined()

    // Verify canvas was added to workspace
    const newCanvas = connection.proxy.root?.items?.find(
      (item) => item.kind === 'canvas' && item.id === result.canvasId
    ) as CanvasItem
    expect(newCanvas).toBeDefined()
    expect(newCanvas.name).toBe(canvasDirName.toLowerCase())
  })
})

describe('Nested Canvas Structure Sync', () => {
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

  it('should handle nested canvas structure', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create nested structure: Projects > Design-Canvas
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvasId = `canvas-nested-${Date.now()}`
    const parentCanvasId = `canvas-parent-${Date.now()}`

    const parentCanvas: CanvasItem = {
      kind: 'canvas',
      id: parentCanvasId,
      name: 'Projects',
      xynode: { id: parentCanvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'canvas',
          id: canvasId,
          name: 'Design Canvas',
          xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
          edges: [],
          items: [],
        },
      ],
    }
    connection.proxy.root.items.push(parentCanvas)

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify canvas structure exists (no c- prefix)
    const parentDir = path.join(workspacePath, 'projects')
    const canvasDir = path.join(parentDir, 'design-canvas')

    expect(
      await fs
        .access(parentDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)
    expect(
      await fs
        .access(canvasDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)
  })
})
