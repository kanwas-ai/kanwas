/**
 * Nested canvas sync tests.
 *
 * Tests for complex scenarios like nested canvases and rapid file creation.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { type WorkspaceConnection, type CanvasItem, type NodeItem } from 'shared'

import { readMetadataYaml } from '../../src/filesystem.js'
import { FileWatcher, type FileChangeEvent } from '../../src/watcher.js'
import { SyncManager } from '../../src/sync-manager.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  trackWatcher,
  cleanupConnections,
  cleanupWatchers,
  delay,
  resetWorkspaceToEmpty,
  testLogger,
} from '../helpers/index.js'

function getSyncManagerConnection(syncManager: SyncManager): WorkspaceConnection {
  const connection = (syncManager as unknown as { connection: WorkspaceConnection | null }).connection
  if (!connection) {
    throw new Error('Expected SyncManager to hold an active workspace connection')
  }

  return connection
}

describe('Nested Canvas Sync', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeConnections: WorkspaceConnection[] = []
  const activeWatchers: FileWatcher[] = []
  const activeSyncManagers: SyncManager[] = []

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

    for (const manager of activeSyncManagers) {
      manager.shutdown()
    }
    activeSyncManagers.length = 0

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to delete temp workspace: ${err}`)
    }
  })

  it('should sync parent canvas before child canvas when created with mkdir -p', async () => {
    // This reproduces the issue: mkdir -p /workspace/projects/product-ideas
    // creates both directories almost simultaneously, but the canvas sync fails
    // because the parent canvas hasn't been synced to yDoc yet.

    const parentCanvasName = `projects-${Date.now()}`
    const childCanvasName = `product-ideas-${Date.now()}`

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

    // Simulate mkdir -p: create nested canvas directories
    const parentCanvasPath = path.join(workspacePath, parentCanvasName)
    const childCanvasPath = path.join(parentCanvasPath, childCanvasName)

    // Create both directories (simulating mkdir -p behavior)
    await fs.mkdir(childCanvasPath, { recursive: true })

    // Now sync them in order - parent first, then child
    await syncManager.handleFileChange('create', parentCanvasPath)
    await delay(200) // Small delay to let yDoc sync
    await syncManager.handleFileChange('create', childCanvasPath)
    await delay(500)

    // Verify canvas was created inside the parent canvas in yDoc
    // Connect to workspace to check
    const connection = getSyncManagerConnection(syncManager)

    // Find the parent canvas
    const parentCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === parentCanvasName
    ) as CanvasItem | undefined

    expect(parentCanvas).toBeDefined()
    const childCanvases = parentCanvas!.items.filter((i): i is CanvasItem => i.kind === 'canvas')
    expect(childCanvases.length).toBe(1)
    expect(childCanvases[0].kind).toBe('canvas')
    expect(childCanvases[0].name).toBe(childCanvasName)
  })

  it('should handle rapid file creation in canvas (simulating agent writes)', async () => {
    // This reproduces the issue: agent creates canvas + multiple files quickly
    // Files might disappear because sync doesn't complete before next operation

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

    // Create canvas directory
    const canvasDir = path.join(workspacePath, 'rapid-test')
    await fs.mkdir(canvasDir, { recursive: true })
    await syncManager.handleFileChange('create', canvasDir)
    await delay(500) // Wait for auto-metadata

    // Rapidly create multiple files (simulating agent behavior)
    const files = ['note1.md', 'note2.md', 'note3.md', 'note4.md']
    for (const file of files) {
      const filePath = path.join(canvasDir, file)
      await fs.writeFile(filePath, `# ${file}\n\nContent for ${file}`)
      // Immediately trigger sync (simulating watcher)
      await syncManager.handleFileChange('create', filePath)
    }

    await delay(1000) // Wait for all syncs

    // Verify all files exist in filesystem
    for (const file of files) {
      const filePath = path.join(canvasDir, file)
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    }

    // Verify all nodes were added to metadata
    const metadata = await readMetadataYaml(canvasDir)
    expect(metadata).toBeDefined()
    expect(metadata!.nodes.length).toBe(4)

    // Verify all nodes exist in yDoc
    const connection = getSyncManagerConnection(syncManager)

    const canvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'rapid-test'
    ) as CanvasItem | undefined

    expect(canvas).toBeDefined()
    const rapidNodes = canvas!.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(rapidNodes.length).toBe(4)
  })

  it('should persist files after filesystem re-hydration from yDoc', { timeout: 15000 }, async () => {
    // This is the core issue: agent creates files, they sync to yDoc,
    // then when re-hydration happens (clearDirectory + write from yDoc),
    // the files should still be there.

    // Step 1: First SyncManager creates files
    const syncManager1 = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager1)
    await syncManager1.initialize()

    // Create canvas with files
    const canvasDir = path.join(workspacePath, 'persist-test')
    await fs.mkdir(canvasDir, { recursive: true })
    await syncManager1.handleFileChange('create', canvasDir)
    await delay(500)

    // Create files
    const filePath = path.join(canvasDir, 'important-note.md')
    await fs.writeFile(filePath, '# Important Note\n\nThis should persist!')
    await syncManager1.handleFileChange('create', filePath)
    await delay(2000) // Wait for note docs to flush through the Yjs server

    // Shutdown first manager
    syncManager1.shutdown()
    activeSyncManagers.length = 0
    await delay(2000)

    // Step 2: Create new SyncManager (simulates sandbox restart)
    // This will re-hydrate filesystem from yDoc
    const syncManager2 = new SyncManager({
      workspaceId: testEnv.workspaceId,
      yjsServerHost: testEnv.yjsServerHost,
      workspacePath,
      backendUrl: testEnv.backendUrl,
      authToken: testEnv.authToken,
      userId: 'test-user',
      logger: testLogger,
    })
    activeSyncManagers.push(syncManager2)
    await syncManager2.initialize() // This calls clearDirectory + writes from yDoc

    // Verify file still exists after re-hydration
    const fileExists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)

    // Verify content is correct
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toContain('Important Note')
    expect(content).toContain('This should persist')
  })

  it('should create nested canvas via watcher events', { timeout: 15000 }, async () => {
    // Set up a full watcher + sync manager scenario
    // Note: This test uses watchers with delays, so needs longer timeout

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

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) return
          await syncManager.handleFileChange(event.type, event.path)
        },
        onReady: () => console.error('[Test] Watcher ready'),
        onError: (err) => console.error('[Test] Watcher error:', err),
      }),
      activeWatchers
    )
    watcher.start()
    await delay(1000) // Wait for watcher to be ready

    // Create nested canvas structure like agent would
    const parentCanvasPath = path.join(workspacePath, 'my-project')
    const childCanvasPath = path.join(parentCanvasPath, 'design-docs')

    await fs.mkdir(childCanvasPath, { recursive: true })
    await delay(2000) // Wait for watcher to detect and sync

    // Create files in child canvas
    const mdPath = path.join(childCanvasPath, 'overview.md')
    await fs.writeFile(mdPath, '# Design Overview\n\nProject design documentation.')
    await delay(2000) // Wait for watcher to detect and sync

    // Verify structure in yDoc
    const connection = getSyncManagerConnection(syncManager)

    // Find parent canvas
    const parentCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'my-project'
    ) as CanvasItem | undefined
    expect(parentCanvas).toBeDefined()

    // Find child canvas inside parent canvas
    const childCanvas = parentCanvas?.items.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'design-docs'
    ) as CanvasItem | undefined
    expect(childCanvas).toBeDefined()

    // Find node inside child canvas
    const childNodes = childCanvas!.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(childNodes.length).toBe(1)
    expect(childNodes[0].name).toBe('overview')
  })

  it('should not lose files when created immediately after canvas', async () => {
    // This tests the scenario where agent creates:
    // 1. mkdir Canvas/
    // 2. echo > Canvas/note.md (immediately)
    // The file should not be lost.

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

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) return
          await syncManager.handleFileChange(event.type, event.path)
        },
        onReady: () => {},
        onError: (err) => console.error('[Test] Error:', err),
      }),
      activeWatchers
    )
    watcher.start()
    await delay(1000)

    // Create canvas directory AND file almost simultaneously
    const canvasDir = path.join(workspacePath, 'immediate-test')
    const noteFile = path.join(canvasDir, 'quick-note.md')

    await fs.mkdir(canvasDir, { recursive: true })
    // Immediately create file (no wait)
    await fs.writeFile(noteFile, '# Quick Note\n\nCreated immediately after canvas.')

    // Wait for watcher to process both events
    await delay(3000)

    // Verify file exists
    const fileExists = await fs
      .access(noteFile)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)

    // Verify in yDoc
    const connection = getSyncManagerConnection(syncManager)

    const canvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'immediate-test'
    ) as CanvasItem | undefined

    expect(canvas).toBeDefined()
    const immediateNodes = canvas!.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(immediateNodes.length).toBe(1)
    expect(immediateNodes[0].name).toBe('quick-note')
  })
})
