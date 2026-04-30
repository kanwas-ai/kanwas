/**
 * Duplicate Nodes Bug Reproduction Test
 *
 * ============================================================================
 * BUG DESCRIPTION
 * ============================================================================
 *
 * When files are moved or renamed in the workspace, duplicate nodes can be
 * created with the same name in metadata.yaml.
 *
 * ROOT CAUSE: Race Condition in Concurrent Event Handlers
 *
 * The FileWatcher in watcher.ts fires event handlers but does NOT await them:
 *
 *   private handleChange(event: FileChangeEvent): void {
 *     this.options.onFileChange(event).catch(...)  // NOT AWAITED!
 *   }
 *
 * When multiple events fire in quick succession, handlers run CONCURRENTLY.
 * This causes a read-modify-write race on metadata.yaml:
 *
 * 1. Handler A reads: [{id: "abc", name: "foo"}]
 * 2. Handler B reads: [{id: "abc", name: "foo"}] (SAME STALE DATA!)
 * 3. Handler A removes "abc" and writes: []
 * 4. Handler B pushes "xyz" to its STALE COPY and writes:
 *    [{id: "abc"}, {id: "xyz"}]
 * 5. Result: DUPLICATE! Last writer wins with stale data containing old entry.
 *
 * ============================================================================
 * TEST STRATEGY
 * ============================================================================
 *
 * We test the race condition by calling handleFileChange concurrently,
 * simulating what happens when the watcher fires multiple events without
 * awaiting. This bypasses chokidar's awaitWriteFinish coalescing.
 *
 * ============================================================================
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { readMetadataYaml, writeMetadataYaml, type CanvasMetadata } from '../../src/filesystem.js'
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
} from '../helpers/index.js'

describe('Duplicate Nodes Bug - Race Condition', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeSyncManagers: SyncManager[] = []
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
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-duplicate-test-'))
    console.error(`Created temp workspace: ${workspacePath}`)
  })

  afterEach(async () => {
    // Stop all watchers first
    for (const watcher of activeWatchers) {
      await watcher.stop()
    }
    activeWatchers.length = 0

    // Shutdown all sync managers
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

  async function waitForCondition<T>(
    predicate: () => Promise<T | null | undefined> | T | null | undefined,
    timeoutMs = 4000,
    intervalMs = 100
  ): Promise<T> {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const result = await predicate()
      if (result) {
        return result
      }
      await delay(intervalMs)
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`)
  }

  /**
   * CORE BUG TEST: Race condition when delete and create happen concurrently
   *
   * This simulates the scenario where:
   * 1. A file exists on disk with a corresponding node in metadata.yaml
   * 2. The file is deleted AND a new file with the same name is created
   * 3. Both events are processed CONCURRENTLY (without awaiting)
   *
   * BUG BEHAVIOR (without handler serialization):
   * - Delete handler reads metadata, removes node, writes
   * - Create handler reads STALE metadata (before delete wrote), adds node, writes
   * - Create handler's write includes both old entry (from stale read) and new entry
   * - Result: DUPLICATE entries in metadata.yaml
   *
   * EXPECTED BEHAVIOR (with handler serialization):
   * - Handlers run sequentially, each sees the result of the previous
   * - No duplicates possible
   */
  it('should NOT create duplicate entries when delete+create race (simulating watcher behavior)', async () => {
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

    // Step 1: Create a canvas directory with an existing file/node
    const canvasDir = path.join(workspacePath, 'Race-Test')
    await fs.mkdir(canvasDir, { recursive: true })

    // Create initial canvas metadata (empty, we'll add the file via syncer)
    const initialMetadata: CanvasMetadata = {
      id: `canvas-race-${Date.now()}`,
      name: 'Race-Test',
      xynode: { position: { x: 0, y: 0 } },
      nodes: [],
      edges: [],
    }
    await writeMetadataYaml(canvasDir, initialMetadata)

    // Register canvas in yDoc
    await syncManager.handleFileChange('create', canvasDir)
    await delay(300)

    // Create the initial file and sync it (this adds it to yDoc AND metadata.yaml)
    const filePath = path.join(canvasDir, 'racing-file.md')
    await fs.writeFile(filePath, '# Racing File\n\nOriginal content')
    await syncManager.handleFileChange('create', filePath)
    await delay(300)

    // Step 2: Verify initial state - one node exists in both yDoc and metadata.yaml
    let metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(1)
    expect(metadata!.nodes[0].name).toBe('racing-file')
    const originalNodeId = metadata!.nodes[0].id
    console.error(`Before race - nodes: ${JSON.stringify(metadata?.nodes.map((n) => ({ name: n.name, id: n.id })))}`)

    // Step 3: Simulate the race condition
    // This is exactly what happens when FileWatcher fires delete and create events
    // without awaiting - both handlers run concurrently
    //
    // We'll:
    // 1. Delete the existing file
    // 2. Create a new file with the same name
    // 3. Call BOTH handlers concurrently (NOT awaiting either one first)
    //
    // This simulates:
    //   handleChange({ type: 'delete', path: filePath }).catch(...)  // NOT AWAITED
    //   handleChange({ type: 'create', path: filePath }).catch(...)  // NOT AWAITED

    // Delete the file on disk
    await fs.unlink(filePath)

    // Create new file with same name
    await fs.writeFile(filePath, '# Racing File\n\nNew content after recreate')

    // Fire BOTH handlers concurrently - THIS IS THE BUG!
    // The watcher does NOT await, so both handlers read/write metadata.yaml concurrently
    const deletePromise = syncManager.handleFileChange('delete', filePath)
    const createPromise = syncManager.handleFileChange('create', filePath)

    // Wait for both to complete
    await Promise.all([deletePromise, createPromise])

    // Small delay for any async writes to complete
    await delay(200)

    // Step 4: Check for duplicates - THIS IS THE BUG!
    metadata = await readMetadataYaml(canvasDir)
    console.error(`After race - nodes: ${JSON.stringify(metadata?.nodes.map((n) => ({ name: n.name, id: n.id })))}`)

    const entriesWithSameName = metadata!.nodes.filter((n) => n.name === 'racing-file')

    // BUG: Without handler serialization, there may be 2 entries
    // (original restored by create handler's stale read + new entry)
    //
    // FIX: With handler serialization, there should only be 1 entry
    // (delete runs first, then create adds the new one)
    expect(entriesWithSameName.length).toBe(1)
    expect(metadata!.nodes.length).toBe(1)
  }, 30000) // 30 second timeout

  /**
   * Test concurrent file creations with different names
   * This should work correctly even without serialization
   */
  it('should correctly track multiple concurrent file creations with different names', async () => {
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

    // Create canvas with metadata
    const canvasDir = path.join(workspacePath, 'Concurrent-Create-Test')
    await fs.mkdir(canvasDir, { recursive: true })

    const initialMetadata: CanvasMetadata = {
      id: `canvas-concurrent-${Date.now()}`,
      name: 'Concurrent-Create-Test',
      xynode: { position: { x: 0, y: 0 } },
      nodes: [],
      edges: [],
    }
    await writeMetadataYaml(canvasDir, initialMetadata)
    await syncManager.handleFileChange('create', canvasDir)
    await delay(300)

    // Create three files on disk
    const file1 = path.join(canvasDir, 'file-one.md')
    const file2 = path.join(canvasDir, 'file-two.md')
    const file3 = path.join(canvasDir, 'file-three.md')

    await fs.writeFile(file1, '# File One')
    await fs.writeFile(file2, '# File Two')
    await fs.writeFile(file3, '# File Three')

    // Fire all three handlers concurrently (simulating rapid file creation)
    await Promise.all([
      syncManager.handleFileChange('create', file1),
      syncManager.handleFileChange('create', file2),
      syncManager.handleFileChange('create', file3),
    ])

    await delay(200)

    // Verify all three nodes exist (no duplicates, no missing)
    const metadata = await readMetadataYaml(canvasDir)
    console.error(`Concurrent create - nodes: ${JSON.stringify(metadata?.nodes.map((n) => n.name))}`)

    // With proper serialization, all three should be tracked
    // Without serialization, some may be lost due to concurrent writes
    expect(metadata!.nodes.length).toBe(3)
    const names = metadata!.nodes.map((n) => n.name).sort()
    expect(names).toEqual(['file-one', 'file-three', 'file-two'])
  }, 30000)

  /**
   * Test that file deletion properly removes entries from metadata.
   */
  it('should correctly remove node when file is deleted', async () => {
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

    const canvasDir = path.join(workspacePath, 'Delete-Test')
    await fs.mkdir(canvasDir, { recursive: true })

    const initialMetadata: CanvasMetadata = {
      id: `canvas-delete-${Date.now()}`,
      name: 'Delete-Test',
      xynode: { position: { x: 0, y: 0 } },
      nodes: [],
      edges: [],
    }
    await writeMetadataYaml(canvasDir, initialMetadata)
    await syncManager.handleFileChange('create', canvasDir)
    await delay(300)

    // Create a file
    const filePath = path.join(canvasDir, 'to-be-deleted.md')
    await fs.writeFile(filePath, '# To Be Deleted')
    await syncManager.handleFileChange('create', filePath)
    await delay(200)

    // Verify file was tracked
    let metadata = await readMetadataYaml(canvasDir)
    expect(metadata!.nodes.length).toBe(1)
    expect(metadata!.nodes[0].name).toBe('to-be-deleted')

    // Delete the file
    await fs.unlink(filePath)
    await syncManager.handleFileChange('delete', filePath)
    await delay(200)

    // Verify node was removed
    metadata = await readMetadataYaml(canvasDir)
    console.error(`After delete - nodes: ${JSON.stringify(metadata?.nodes.map((n) => n.name))}`)
    expect(metadata!.nodes.length).toBe(0)
  }, 30000)

  /**
   * Test with actual FileWatcher to verify end-to-end serialization
   */
  it('should handle rapid file operations through FileWatcher without duplicates', async () => {
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

    const canvasDir = path.join(workspacePath, 'Watcher-Test')
    await fs.mkdir(canvasDir, { recursive: true })

    const initialMetadata: CanvasMetadata = {
      id: `canvas-watcher-${Date.now()}`,
      name: 'Watcher-Test',
      xynode: { position: { x: 0, y: 0 } },
      nodes: [],
      edges: [],
    }
    await writeMetadataYaml(canvasDir, initialMetadata)
    await syncManager.handleFileChange('create', canvasDir)
    await delay(300)

    // Start FileWatcher
    const watcher = new FileWatcher({
      watchPath: workspacePath,
      onFileChange: async (event: FileChangeEvent) => {
        const relativePath = path.relative(workspacePath, event.path)
        if (relativePath === '.ready' || relativePath.startsWith('.ready')) return
        if (relativePath.endsWith('metadata.yaml')) return

        console.error(`[FileWatcher] ${event.type}: ${relativePath}`)
        await syncManager.handleFileChange(event.type, event.path)
      },
      onReady: () => console.error('[FileWatcher] Ready'),
      onError: (err) => console.error('[FileWatcher] Error:', err),
    })
    activeWatchers.push(watcher)
    watcher.start()
    await delay(1000) // Wait for watcher to be ready

    // Rapid file operations: create, then delete, then recreate
    const filePath = path.join(canvasDir, 'rapid-ops.md')

    // Create file
    await fs.writeFile(filePath, '# First Version')

    // Verify created
    let metadata = await waitForCondition(async () => {
      const currentMetadata = await readMetadataYaml(canvasDir)
      return currentMetadata && currentMetadata.nodes.length === 1 ? currentMetadata : null
    })
    expect(metadata!.nodes.length).toBe(1)

    // Delete and immediately recreate (the problematic scenario)
    await fs.unlink(filePath)
    await fs.writeFile(filePath, '# Second Version')

    // Wait for watcher to process (awaitWriteFinish will coalesce to update)
    await delay(1500)

    // Check final state
    metadata = await readMetadataYaml(canvasDir)
    console.error(
      `After rapid ops - nodes: ${JSON.stringify(metadata?.nodes.map((n) => ({ name: n.name, id: n.id })))}`
    )

    // Should have exactly 1 node, not duplicates
    const entriesWithSameName = metadata!.nodes.filter((n) => n.name === 'rapid-ops')
    expect(entriesWithSameName.length).toBe(1)
    expect(metadata!.nodes.length).toBe(1)
  }, 30000)
})
