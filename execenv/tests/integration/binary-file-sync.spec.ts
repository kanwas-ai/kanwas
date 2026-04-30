/**
 * Binary file sync integration tests.
 *
 * Tests real file upload and download flows through the backend API.
 * Unlike unit tests that use no-op mocks, these tests actually:
 * - Upload files to the backend storage
 * - Download files via signed URLs
 * - Verify the full round-trip works
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

import { workspaceToFilesystem } from 'shared/server'
import {
  type WorkspaceConnection,
  type CanvasItem,
  type NodeItem,
  type ImageNodeData,
  type AudioNodeData,
  type FileNodeData,
  IMAGE_NODE_LAYOUT,
  AUDIO_NODE_LAYOUT,
  FILE_NODE_LAYOUT,
} from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'

import { writeFSNode, clearDirectory } from '../../src/filesystem.js'
import { uploadFile } from '../../src/api.js'
import { SyncManager } from '../../src/sync-manager.js'

import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  cleanupConnections,
  createTestSyncer,
  delay,
  initializeApiForTests,
  createRealFileUploader,
  createRealFileReader,
  createRealFileFetcher,
  createFakeImageBuffer,
  createFakeMP3Buffer,
  createFakePDFBuffer,
  resetWorkspaceToEmpty,
  testLogger,
} from '../helpers/index.js'

describe('Binary File Sync Integration', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeConnections: WorkspaceConnection[] = []
  const activeSyncManagers: SyncManager[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
    initializeApiForTests(testEnv)
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-binary-test-'))
    console.error(`Created temp workspace: ${workspacePath}`)
  })

  afterEach(async () => {
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

  it('should upload image from filesystem to backend and create ImageNode in yDoc', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-upload-${Date.now()}`
    const canvasName = 'upload-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem (creates canvas directory)
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Write a test image to filesystem (simulating agent creating image)
    const testImageBuffer = createFakeImageBuffer(2048)
    const canvasDir = path.join(workspacePath, canvasName)
    const imagePath = path.join(canvasDir, 'test-image.png')
    await fs.writeFile(imagePath, testImageBuffer)

    console.error(`Wrote test image to: ${imagePath}`)

    // Sync the file creation
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/test-image.png`,
    })

    console.error(`Sync result: ${JSON.stringify(result)}`)

    // Verify upload succeeded
    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')
    expect(result.nodeId).toBeDefined()

    // Verify ImageNode was created in yDoc
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    expect(updatedCanvas).toBeDefined()

    const imageNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'image'
    )
    expect(imageNode).toBeDefined()
    expect(imageNode!.xynode.type).toBe('image')

    const imageData = imageNode!.xynode.data as ImageNodeData
    expect(imageData.storagePath).toContain('files/')
    expect(imageData.mimeType).toBe('image/png')
    expect(imageData.size).toBe(2048)

    console.error(`Created image node: ${JSON.stringify(imageNode)}`)
  })

  it('should download image from backend when hydrating filesystem', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-download-${Date.now()}`
    const canvasName = 'download-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Upload an image to backend first (to have something to download)
    const testImageBuffer = createFakeImageBuffer(1024)
    const uploadResult = await uploadFile(
      testEnv.workspaceId,
      testImageBuffer,
      canvasId,
      'download-test.png',
      'image/png'
    )

    console.error(`Uploaded image: ${JSON.stringify(uploadResult)}`)

    // Create ImageNode in yDoc manually - must push via proxy, not local variable
    const nodeId = crypto.randomUUID()
    const imageNode: NodeItem = {
      kind: 'node',
      id: nodeId,
      name: 'download-test',
      xynode: {
        id: nodeId,
        type: 'image',
        position: { x: 100, y: 100 },
        data: {
          storagePath: uploadResult.storagePath,
          mimeType: 'image/png',
          size: testImageBuffer.length,
        } as ImageNodeData,
        measured: IMAGE_NODE_LAYOUT.DEFAULT_MEASURED,
      },
    }
    // Push via proxy to ensure yDoc sync
    const proxyCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    if (!proxyCanvas) throw new Error('Canvas not found in proxy')
    proxyCanvas.items.push(imageNode)

    await delay(500)

    // Hydrate filesystem with REAL file fetcher
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc, {
      fileFetcher: createRealFileFetcher(),
    })

    // Write to disk
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify binary file was downloaded
    const downloadedFilePath = path.join(workspacePath, canvasName, 'download-test.png')
    const downloadedBuffer = await fs.readFile(downloadedFilePath)

    console.error(`Downloaded file size: ${downloadedBuffer.length}`)

    expect(downloadedBuffer.length).toBe(testImageBuffer.length)
    expect(downloadedBuffer[0]).toBe(0x89) // PNG magic byte
    expect(downloadedBuffer[1]).toBe(0x50) // 'P'
    expect(downloadedBuffer[2]).toBe(0x4e) // 'N'
    expect(downloadedBuffer[3]).toBe(0x47) // 'G'
  })

  it('should complete full round-trip: upload → yDoc sync → re-hydrate → download', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-roundtrip-${Date.now()}`
    const canvasName = 'round-trip-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Step 1: Hydrate filesystem (creates canvas directory)
    let fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Step 2: Write test image to filesystem (simulating agent creating image)
    const originalImageBuffer = createFakeImageBuffer(4096)
    // Add some unique data to make it identifiable
    originalImageBuffer[100] = 0xde
    originalImageBuffer[101] = 0xad
    originalImageBuffer[102] = 0xbe
    originalImageBuffer[103] = 0xef

    const canvasDir = path.join(workspacePath, canvasName)
    const imagePath = path.join(canvasDir, 'roundtrip-image.png')
    await fs.writeFile(imagePath, originalImageBuffer)

    console.error(`Step 2: Wrote original image (${originalImageBuffer.length} bytes)`)

    // Step 3: Sync to yDoc (upload to backend)
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/roundtrip-image.png`,
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')

    console.error(`Step 3: Synced to yDoc, node ID: ${result.nodeId}`)

    // Verify node exists in yDoc
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    const imageNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'image'
    )
    expect(imageNode).toBeDefined()

    const storagePath = (imageNode!.xynode.data as ImageNodeData).storagePath
    console.error(`Step 3: Image stored at: ${storagePath}`)

    // Step 4: Clear filesystem
    await clearDirectory(workspacePath)
    console.error(`Step 4: Cleared filesystem`)

    // Step 5: Re-hydrate filesystem with real file fetcher (download from backend)
    fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc, {
      fileFetcher: createRealFileFetcher(),
    })

    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    console.error(`Step 5: Re-hydrated filesystem`)

    // Step 6: Verify downloaded file matches original
    const downloadedFilePath = path.join(workspacePath, canvasName, 'roundtrip-image.png')
    const downloadedBuffer = await fs.readFile(downloadedFilePath)

    console.error(`Step 6: Downloaded file size: ${downloadedBuffer.length}`)

    expect(downloadedBuffer.length).toBe(originalImageBuffer.length)

    // Verify PNG magic bytes
    expect(downloadedBuffer[0]).toBe(0x89)
    expect(downloadedBuffer[1]).toBe(0x50)
    expect(downloadedBuffer[2]).toBe(0x4e)
    expect(downloadedBuffer[3]).toBe(0x47)

    // Verify our unique marker bytes
    expect(downloadedBuffer[100]).toBe(0xde)
    expect(downloadedBuffer[101]).toBe(0xad)
    expect(downloadedBuffer[102]).toBe(0xbe)
    expect(downloadedBuffer[103]).toBe(0xef)

    console.error(`Step 6: Round-trip complete - file content matches!`)
  })

  it('should upload audio (.mp3) from filesystem to backend and create AudioNode in yDoc', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-audio-${Date.now()}`
    const canvasName = 'audio-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem (creates canvas directory)
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Write a test MP3 to filesystem (simulating agent creating audio)
    const testAudioBuffer = createFakeMP3Buffer(2048)
    const canvasDir = path.join(workspacePath, canvasName)
    const audioPath = path.join(canvasDir, 'test-audio.mp3')
    await fs.writeFile(audioPath, testAudioBuffer)

    console.error(`Wrote test MP3 to: ${audioPath}`)

    // Sync the file creation
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/test-audio.mp3`,
    })

    console.error(`Sync result: ${JSON.stringify(result)}`)

    // Verify upload succeeded
    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')
    expect(result.nodeId).toBeDefined()

    // Verify AudioNode was created in yDoc
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    expect(updatedCanvas).toBeDefined()

    const audioNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'audio'
    )
    expect(audioNode).toBeDefined()
    expect(audioNode!.xynode.type).toBe('audio')

    const audioData = audioNode!.xynode.data as AudioNodeData
    expect(audioData.storagePath).toContain('files/')
    expect(audioData.mimeType).toBe('audio/mpeg')
    expect(audioData.size).toBe(2048)
    expect(audioData.originalFilename).toBe('test-audio.mp3')

    // Filesystem-created audio nodes leave size unresolved until the frontend measures them.
    expect(audioNode!.xynode.measured).toBeUndefined()

    console.error(`Created audio node: ${JSON.stringify(audioNode)}`)
  })

  it('should upload document (.pdf) from filesystem to backend and create FileNode in yDoc', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-pdf-${Date.now()}`
    const canvasName = 'pdf-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem (creates canvas directory)
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Write a test PDF to filesystem (simulating agent creating document)
    const testPDFBuffer = createFakePDFBuffer(1024)
    const canvasDir = path.join(workspacePath, canvasName)
    const pdfPath = path.join(canvasDir, 'test-document.pdf')
    await fs.writeFile(pdfPath, testPDFBuffer)

    console.error(`Wrote test PDF to: ${pdfPath}`)

    // Sync the file creation
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/test-document.pdf`,
    })

    console.error(`Sync result: ${JSON.stringify(result)}`)

    // Verify upload succeeded
    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')
    expect(result.nodeId).toBeDefined()

    // Verify FileNode was created in yDoc
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    expect(updatedCanvas).toBeDefined()

    const fileNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'file'
    )
    expect(fileNode).toBeDefined()
    expect(fileNode!.xynode.type).toBe('file')

    const fileData = fileNode!.xynode.data as FileNodeData
    expect(fileData.storagePath).toContain('files/')
    expect(fileData.mimeType).toBe('application/pdf')
    expect(fileData.size).toBe(1024)
    expect(fileData.originalFilename).toBe('test-document.pdf')

    // Filesystem-created file nodes leave size unresolved until the frontend measures them.
    expect(fileNode!.xynode.measured).toBeUndefined()

    console.error(`Created file node: ${JSON.stringify(fileNode)}`)
  })

  it('should include contentHash on created image node', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-hash-${Date.now()}`
    const canvasName = 'hash-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Write a test image to filesystem
    const testImageBuffer = createFakeImageBuffer(1024)
    const canvasDir = path.join(workspacePath, canvasName)
    const imagePath = path.join(canvasDir, 'hash-test.png')
    await fs.writeFile(imagePath, testImageBuffer)

    // Sync the file creation
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/hash-test.png`,
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')

    // Verify ImageNode has contentHash
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    const imageNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'image'
    )

    expect(imageNode).toBeDefined()
    const imageData = imageNode!.xynode.data as ImageNodeData
    expect(imageData.contentHash).toBeDefined()
    expect(imageData.contentHash).toHaveLength(64) // SHA-256 hex string

    console.error(`Image contentHash: ${imageData.contentHash}`)
  })

  it('should update FileNode (CSV) with new storagePath and contentHash when file is modified', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-csv-update-${Date.now()}`
    const canvasName = 'csv-update-test-canvas'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Create syncer with REAL file handlers
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createRealFileUploader(testEnv.workspaceId),
      fileReader: createRealFileReader(workspacePath),
    })

    // Step 1: Create initial CSV file
    const initialCsv = Buffer.from('name,value\ntest,123\n', 'utf-8')
    const canvasDir = path.join(workspacePath, canvasName)
    const csvPath = path.join(canvasDir, 'data.csv')
    await fs.writeFile(csvPath, initialCsv)

    console.error(`Step 1: Created initial CSV at ${csvPath}`)

    // Sync the file creation
    const createResult = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/data.csv`,
    })

    expect(createResult.success).toBe(true)
    expect(createResult.action).toBe('created_node')

    console.error(`Step 1: Create result: ${JSON.stringify(createResult)}`)

    // Get original node data
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    expect(updatedCanvas).toBeDefined()

    const fileNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'file'
    )
    expect(fileNode).toBeDefined()

    const originalData = fileNode!.xynode.data as FileNodeData
    const originalStoragePath = originalData.storagePath
    const originalContentHash = originalData.contentHash

    expect(originalContentHash).toBeDefined()
    expect(originalContentHash).toHaveLength(64)

    console.error(`Step 1: Original storagePath: ${originalStoragePath}`)
    console.error(`Step 1: Original contentHash: ${originalContentHash}`)

    // Step 2: Update CSV file with new content
    const updatedCsv = Buffer.from('name,value\ntest,123\nfoo,456\nbar,789\n', 'utf-8')
    await fs.writeFile(csvPath, updatedCsv)

    console.error(`Step 2: Updated CSV with new content`)

    // Sync the file update
    const updateResult = await syncer.syncChange({
      type: 'update',
      path: `${canvasName}/data.csv`,
    })

    expect(updateResult.success).toBe(true)
    expect(updateResult.action).toBe('updated_binary_content')

    console.error(`Step 2: Update result: ${JSON.stringify(updateResult)}`)

    // Verify node data was updated
    const newData = fileNode!.xynode.data as FileNodeData
    const newContentHash = newData.contentHash

    // Note: storagePath may or may not change depending on backend implementation
    // The critical assertion is that contentHash changes for different content
    expect(newContentHash).not.toBe(originalContentHash)
    expect(newContentHash).toHaveLength(64)
    expect(newData.size).toBe(updatedCsv.length)

    console.error(`Step 2: New contentHash: ${newContentHash}`)
    console.error(`Step 2: FileNode update complete!`)
  })

  it('should sync CSV file created at workspace root via SyncManager', async () => {
    // This test uses SyncManager directly to catch path handling bugs
    // The bug: SyncManager.fileReader didn't join workspacePath with relative path

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

    // Create CSV file at workspace root (simulates agent creating file)
    const csvPath = path.join(workspacePath, 'random-data.csv')
    await fs.writeFile(csvPath, 'name,value\ntest,123\n')

    // Sync through SyncManager (this is where the bug manifests)
    const result = await syncManager.handleFileChange('create', csvPath)

    // Before fix: ENOENT error because it tried to read 'random-data.csv'
    // instead of '/workspace/random-data.csv'
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)
    expect(result!.action).toBe('created_node')

    // Verify node was created in yDoc
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    const fileNode = connection.proxy.root?.items?.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'file'
    )
    expect(fileNode).toBeDefined()
    expect(fileNode!.name).toBe('random-data')
  })
})
