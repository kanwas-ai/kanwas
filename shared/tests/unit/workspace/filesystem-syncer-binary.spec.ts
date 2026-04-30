import { describe, it, expect, afterEach } from 'vitest'
import { FilesystemSyncer } from '../../../src/workspace/filesystem-syncer.js'
import { PathMapper } from '../../../src/workspace/path-mapper.js'
import { ContentConverter } from '../../../src/workspace/content-converter.js'
import { createTestWorkspace } from '../../helpers/workspace-factory.js'
import {
  createMockFileUploader,
  createMockFileReader,
  createFakeImageBuffer,
  createFailingFileUploader,
  createFailingFileReader,
  createFakeMP3Buffer,
  createFakeWAVBuffer,
  createFakeOGGBuffer,
  createFakePDFBuffer,
  createFakeCSVBuffer,
  createFakeTXTBuffer,
} from '../../helpers/mock-file-handlers.js'
import type { CanvasItem, NodeItem, ImageNodeData, AudioNodeData, FileNodeData } from '../../../src/types.js'
import { calculateImageDisplaySize } from '../../../src/constants.js'

// ============================================================================
// TEST SETUP HELPERS
// ============================================================================

interface TestSyncerSetup {
  syncer: FilesystemSyncer
  proxy: ReturnType<typeof createTestWorkspace>['proxy']
  yDoc: ReturnType<typeof createTestWorkspace>['yDoc']
  pathMapper: PathMapper
  dispose: () => void
  uploadCalls: Array<{
    buffer: Buffer
    canvasId: string
    filename: string
    mimeType: string
  }>
  readCalls: string[]
  fileMap: Map<string, Buffer>
}

/**
 * Creates a syncer with binary file support (uploader + reader)
 */
function createSyncerWithBinarySupport(options?: { auditActor?: string; now?: () => string }): TestSyncerSetup {
  const { proxy, yDoc, dispose } = createTestWorkspace()
  const pathMapper = new PathMapper()
  const contentConverter = new ContentConverter()
  pathMapper.buildFromWorkspace(proxy)

  const { uploader, calls: uploadCalls } = createMockFileUploader()
  const fileMap = new Map<string, Buffer>()
  const { reader, calls: readCalls } = createMockFileReader(fileMap)

  const syncer = new FilesystemSyncer({
    proxy,
    yDoc,
    pathMapper,
    contentConverter,
    fileUploader: uploader,
    fileReader: reader,
    ...(options?.auditActor ? { auditActor: options.auditActor } : {}),
    ...(options?.now ? { now: options.now } : {}),
  })

  return { syncer, proxy, yDoc, pathMapper, dispose, uploadCalls, readCalls, fileMap }
}

/**
 * Helper to create a canvas via the syncer (proper proxy integration)
 */
async function createTestCanvas(setup: TestSyncerSetup, path: string): Promise<CanvasItem> {
  const result = await setup.syncer.syncChange({ type: 'create', path })
  if (!result.success || !result.canvasId) {
    throw new Error(`Failed to create canvas at ${path}: ${result.error}`)
  }

  const findCanvas = (items: Array<CanvasItem | NodeItem>, id: string): CanvasItem | undefined => {
    for (const item of items) {
      if (item.kind === 'canvas') {
        if (item.id === id) return item
        const found = findCanvas(item.items, id)
        if (found) return found
      }
    }
    return undefined
  }

  const proxiedCanvas = findCanvas(setup.proxy.root.items, result.canvasId)
  if (!proxiedCanvas) {
    throw new Error(`Canvas created but not found in proxy: ${result.canvasId}`)
  }
  return proxiedCanvas
}

// ============================================================================
// TESTS
// ============================================================================

describe('FilesystemSyncer - Binary Files', () => {
  const disposeCallbacks: Array<() => void> = []

  afterEach(() => {
    disposeCallbacks.forEach((dispose) => dispose())
    disposeCallbacks.length = 0
  })

  // ==========================================================================
  // createBinaryNode()
  // ==========================================================================

  describe('createBinaryNode', () => {
    it('should create PNG image node', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Add file to mock file reader (valid PNG with default 100x75 dimensions)
      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/photo.png', imageBuffer)

      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/photo.png',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')
      expect(result.nodeId).toBeDefined()

      // Verify node was created
      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('image')
      expect(node!.xynode.position).toEqual({ x: 0, y: 0 })
      const displaySize = calculateImageDisplaySize(100, 75)
      expect(node!.xynode.width).toBe(displaySize.width)
      expect(node!.xynode.height).toBe(displaySize.height)
      expect(node!.xynode.measured).toEqual(displaySize)
      expect(node!.xynode.data).toMatchObject({ width: 100, height: 75 })
    })

    it('should create JPEG image node', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/photo.jpg', imageBuffer)

      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/photo.jpg',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      // Verify mime type via upload call
      expect(setup.uploadCalls.length).toBe(1)
      expect(setup.uploadCalls[0].mimeType).toBe('image/jpeg')
    })

    it('should call fileReader with correct path', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/diagram.png', imageBuffer)

      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/diagram.png',
      })

      expect(setup.readCalls).toContain('Test-Canvas/diagram.png')
    })

    it('should call fileUploader with buffer, canvasId, filename, mimeType', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/screenshot.png', imageBuffer)

      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/screenshot.png',
      })

      expect(setup.uploadCalls.length).toBe(1)
      const uploadCall = setup.uploadCalls[0]
      expect(uploadCall.buffer).toBe(imageBuffer)
      expect(uploadCall.canvasId).toBe(canvas.id)
      expect(uploadCall.filename).toBe('screenshot.png')
      expect(uploadCall.mimeType).toBe('image/png')
    })

    it('should store storagePath, mimeType, size in node data', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/logo.png', imageBuffer)

      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/logo.png',
      })

      expect(result.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()

      const data = node!.xynode.data as ImageNodeData
      expect(data.storagePath).toContain('logo.png')
      expect(data.mimeType).toBe('image/png')
      expect(data.size).toBe(imageBuffer.length)
    })

    it('should strip file extension from node name', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/my-image.png', imageBuffer)

      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/my-image.png',
      })

      expect(result.success).toBe(true)
      expect(result.node?.name).toBe('my-image')
    })

    it('should return error on file read failure', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const pathMapper = new PathMapper()
      const contentConverter = new ContentConverter()
      pathMapper.buildFromWorkspace(proxy)

      const { uploader } = createMockFileUploader()
      const failingReader = createFailingFileReader('File not found')

      const syncer = new FilesystemSyncer({
        proxy,
        yDoc,
        pathMapper,
        contentConverter,
        fileUploader: uploader,
        fileReader: failingReader,
      })

      // Create canvas first
      const createResult = await syncer.syncChange({ type: 'create', path: 'Test-Canvas' })
      expect(createResult.success).toBe(true)

      const result = await syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/missing.png',
      })

      expect(result.success).toBe(false)
      expect(result.action).toBe('error')
      expect(result.error).toContain('Failed to read binary file')
    })

    it('should return error on upload failure', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const pathMapper = new PathMapper()
      const contentConverter = new ContentConverter()
      pathMapper.buildFromWorkspace(proxy)

      const failingUploader = createFailingFileUploader('Storage unavailable')
      const fileMap = new Map<string, Buffer>()
      const { reader } = createMockFileReader(fileMap)

      const syncer = new FilesystemSyncer({
        proxy,
        yDoc,
        pathMapper,
        contentConverter,
        fileUploader: failingUploader,
        fileReader: reader,
      })

      // Create canvas first
      const createResult = await syncer.syncChange({ type: 'create', path: 'Test-Canvas' })
      expect(createResult.success).toBe(true)

      // Add file to mock reader
      fileMap.set('Test-Canvas/image.png', createFakeImageBuffer())

      const result = await syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/image.png',
      })

      expect(result.success).toBe(false)
      expect(result.action).toBe('error')
      expect(result.error).toContain('Failed to upload binary file')
    })

    it('should treat create on mapped path as binary update', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/image.png', imageBuffer)

      // Create node first time
      const result1 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/image.png',
      })
      expect(result1.success).toBe(true)
      expect(result1.action).toBe('created_node')

      // Try to create again - should be no_op
      const result2 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/image.png',
      })
      expect(result2.success).toBe(true)
      expect(result2.action).toBe('updated_binary_content')
      expect(result2.nodeId).toBe(result1.nodeId)
    })
  })

  // ==========================================================================
  // deleteBinaryNode()
  // ==========================================================================

  describe('deleteBinaryNode', () => {
    it('should remove node from canvas', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create node
      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/to-delete.png', imageBuffer)

      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/to-delete.png',
      })
      expect(createResult.success).toBe(true)
      expect(canvas.items.some((i) => i.id === createResult.nodeId)).toBe(true)

      // Delete node
      const deleteResult = await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/to-delete.png',
      })

      expect(deleteResult.success).toBe(true)
      expect(deleteResult.action).toBe('deleted_node')
      expect(canvas.items.some((i) => i.id === createResult.nodeId)).toBe(false)
    })

    it('should remove edges referencing node', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create image node
      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/image.png', imageBuffer)
      const imageResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/image.png',
      })
      expect(imageResult.success).toBe(true)

      // Create markdown node
      const mdResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/note.md',
        content: '# Note',
      })
      expect(mdResult.success).toBe(true)

      // Add edge between nodes
      canvas.edges.push({
        id: 'edge-1',
        source: imageResult.nodeId!,
        target: mdResult.nodeId!,
      })
      expect(canvas.edges.length).toBe(1)

      // Delete image node
      const deleteResult = await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/image.png',
      })

      expect(deleteResult.success).toBe(true)
      expect(canvas.edges.length).toBe(0)
    })

    it('should update path mapper', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create node
      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/tracked.png', imageBuffer)
      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/tracked.png',
      })

      // Verify path mapper has the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.png')).toBeDefined()

      // Delete node
      await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/tracked.png',
      })

      // Path mapper should no longer have the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.png')).toBeUndefined()
    })

    it('should return no_op for unknown path', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      const result = await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/nonexistent.png',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('no_op')
    })
  })

  // ==========================================================================
  // getBinaryFileInfo()
  // ==========================================================================

  describe('getBinaryFileInfo (via syncChange routing)', () => {
    it('should route .png files to binary handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/test.png', createFakeImageBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/test.png',
      })

      expect(result.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('image/png')
    })

    it('should route .jpg files to binary handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/test.jpg', createFakeImageBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/test.jpg',
      })

      expect(result.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('image/jpeg')
    })

    it('should route .jpeg files to binary handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/test.jpeg', createFakeImageBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/test.jpeg',
      })

      expect(result.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('image/jpeg')
    })

    it('should route .gif and .webp files to binary handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/anim.gif', createFakeImageBuffer())
      const result1 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/anim.gif',
      })
      expect(result1.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('image/gif')

      setup.fileMap.set('Test-Canvas/modern.webp', createFakeImageBuffer())
      const result2 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/modern.webp',
      })
      expect(result2.action).toBe('created_node')
      expect(setup.uploadCalls[1]?.mimeType).toBe('image/webp')
    })

    it('should route .pdf files to file handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/document.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/document.pdf',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('application/pdf')
    })

    it('should handle uppercase extensions', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/PHOTO.PNG', createFakeImageBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/PHOTO.PNG',
      })

      expect(result.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('image/png')
    })
  })

  // ==========================================================================
  // NESTED CANVAS BINARY FILES
  // ==========================================================================

  describe('binary files in nested canvases', () => {
    it('should create binary node in nested canvas', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Parent')
      const childCanvas = await createTestCanvas(setup, 'Parent/Child')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Parent/Child/nested-image.png', imageBuffer)

      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Parent/Child/nested-image.png',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      // Verify node was added to child canvas
      const node = childCanvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('image')
    })

    it('should use correct canvasId in upload call for nested canvas', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Parent')
      const childCanvas = await createTestCanvas(setup, 'Parent/Child')

      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Parent/Child/image.png', imageBuffer)

      await setup.syncer.syncChange({
        type: 'create',
        path: 'Parent/Child/image.png',
      })

      expect(setup.uploadCalls.length).toBe(1)
      expect(setup.uploadCalls[0].canvasId).toBe(childCanvas.id)
    })
  })

  // ==========================================================================
  // AUDIO FILE SYNC
  // ==========================================================================

  describe('Audio file sync', () => {
    it('should create audio node from .mp3 file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/song.mp3', createFakeMP3Buffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/song.mp3',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')
      expect(result.nodeId).toBeDefined()

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('audio')
    })

    it('should create audio node from .wav file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/recording.wav', createFakeWAVBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/recording.wav',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('audio')
      expect(setup.uploadCalls[0]?.mimeType).toBe('audio/wav')
    })

    it('should create audio node from .ogg file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/audio.ogg', createFakeOGGBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audio.ogg',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('audio')
      expect(setup.uploadCalls[0]?.mimeType).toBe('audio/ogg')
    })

    it('should preserve originalFilename in audio node data', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/my-podcast.mp3', createFakeMP3Buffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/my-podcast.mp3',
      })

      expect(result.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()

      const data = node!.xynode.data as AudioNodeData
      expect(data.originalFilename).toBe('my-podcast.mp3')
      expect(data.storagePath).toContain('my-podcast.mp3')
      expect(data.mimeType).toBe('audio/mpeg')
      expect(data.size).toBeGreaterThan(0)
    })

    it('creates audio nodes with measured dimensions unset', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/track.mp3', createFakeMP3Buffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/track.mp3',
      })

      expect(result.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.measured).toBeUndefined()
      expect(node!.xynode.initialWidth).toBeUndefined()
      expect(node!.xynode.initialHeight).toBeUndefined()
    })

    it('should route .m4a and .flac to audio handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      // Test .m4a
      setup.fileMap.set('Test-Canvas/audio.m4a', createFakeMP3Buffer()) // Using MP3 buffer, routing is by extension
      const result1 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audio.m4a',
      })
      expect(result1.success).toBe(true)
      expect(result1.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe('audio/mp4')

      // Test .flac
      setup.fileMap.set('Test-Canvas/audio.flac', createFakeMP3Buffer())
      const result2 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audio.flac',
      })
      expect(result2.success).toBe(true)
      expect(result2.action).toBe('created_node')
      expect(setup.uploadCalls[1]?.mimeType).toBe('audio/flac')
    })

    it('should delete audio node and clean edges', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create audio node
      setup.fileMap.set('Test-Canvas/audio.mp3', createFakeMP3Buffer())
      const audioResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audio.mp3',
      })
      expect(audioResult.success).toBe(true)

      // Create markdown node
      const mdResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/note.md',
        content: '# Note',
      })
      expect(mdResult.success).toBe(true)

      // Add edge between nodes
      canvas.edges.push({
        id: 'edge-1',
        source: audioResult.nodeId!,
        target: mdResult.nodeId!,
      })
      expect(canvas.edges.length).toBe(1)

      // Delete audio node
      const deleteResult = await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/audio.mp3',
      })

      expect(deleteResult.success).toBe(true)
      expect(deleteResult.action).toBe('deleted_node')
      expect(canvas.edges.length).toBe(0)
      expect(canvas.items.some((i) => i.id === audioResult.nodeId)).toBe(false)
    })

    it('should update path mapper on audio create/delete', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      // Create audio node
      setup.fileMap.set('Test-Canvas/tracked.mp3', createFakeMP3Buffer())
      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/tracked.mp3',
      })

      // Verify path mapper has the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.mp3')).toBeDefined()

      // Delete audio node
      await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/tracked.mp3',
      })

      // Path mapper should no longer have the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.mp3')).toBeUndefined()
    })

    it('should create audio node in nested canvas', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Parent')
      const childCanvas = await createTestCanvas(setup, 'Parent/Child')

      setup.fileMap.set('Parent/Child/nested-audio.mp3', createFakeMP3Buffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Parent/Child/nested-audio.mp3',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = childCanvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('audio')
    })

    it('should use correct canvasId in upload call for audio', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/upload-test.mp3', createFakeMP3Buffer())
      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/upload-test.mp3',
      })

      expect(setup.uploadCalls.length).toBe(1)
      expect(setup.uploadCalls[0].canvasId).toBe(canvas.id)
      expect(setup.uploadCalls[0].filename).toBe('upload-test.mp3')
      expect(setup.uploadCalls[0].mimeType).toBe('audio/mpeg')
    })
  })

  // ==========================================================================
  // FILE (DOCUMENT) SYNC
  // ==========================================================================

  describe('File sync (documents)', () => {
    it('should create file node from .pdf file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/document.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/document.pdf',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')
      expect(result.nodeId).toBeDefined()

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('file')
    })

    it('marks unsectioned binary-created nodes for frontend placement', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/document.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/document.pdf',
      })

      expect(result.success).toBe(true)
      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node?.xynode.data.pendingCanvasPlacement).toEqual({ source: 'filesystem', reason: 'created' })
    })

    it('should create file node from .csv file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/data.csv', createFakeCSVBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/data.csv',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('file')
      expect(setup.uploadCalls[0]?.mimeType).toBe('text/csv')
    })

    it('should create file node from .txt file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/readme.txt', createFakeTXTBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/readme.txt',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('file')
      expect(setup.uploadCalls[0]?.mimeType).toBe('text/plain')
    })

    it('should preserve originalFilename in file node data', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/my-report.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/my-report.pdf',
      })

      expect(result.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()

      const data = node!.xynode.data as FileNodeData
      expect(data.originalFilename).toBe('my-report.pdf')
      expect(data.storagePath).toContain('my-report.pdf')
      expect(data.mimeType).toBe('application/pdf')
      expect(data.size).toBeGreaterThan(0)
    })

    it('creates file nodes with measured dimensions unset', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/file.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/file.pdf',
      })

      expect(result.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.measured).toBeUndefined()
      expect(node!.xynode.initialWidth).toBeUndefined()
      expect(node!.xynode.initialHeight).toBeUndefined()
    })

    it('should route .docx and .xlsx to file handler', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      // Test .docx
      setup.fileMap.set('Test-Canvas/document.docx', createFakePDFBuffer()) // Using PDF buffer, routing is by extension
      const result1 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/document.docx',
      })
      expect(result1.success).toBe(true)
      expect(result1.action).toBe('created_node')
      expect(setup.uploadCalls[0]?.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )

      // Test .xlsx
      setup.fileMap.set('Test-Canvas/spreadsheet.xlsx', createFakePDFBuffer())
      const result2 = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/spreadsheet.xlsx',
      })
      expect(result2.success).toBe(true)
      expect(result2.action).toBe('created_node')
      expect(setup.uploadCalls[1]?.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    })

    it('should delete file node and clean edges', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create file node
      setup.fileMap.set('Test-Canvas/doc.pdf', createFakePDFBuffer())
      const fileResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/doc.pdf',
      })
      expect(fileResult.success).toBe(true)

      // Create markdown node
      const mdResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/note.md',
        content: '# Note',
      })
      expect(mdResult.success).toBe(true)

      // Add edge between nodes
      canvas.edges.push({
        id: 'edge-1',
        source: fileResult.nodeId!,
        target: mdResult.nodeId!,
      })
      expect(canvas.edges.length).toBe(1)

      // Delete file node
      const deleteResult = await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/doc.pdf',
      })

      expect(deleteResult.success).toBe(true)
      expect(deleteResult.action).toBe('deleted_node')
      expect(canvas.edges.length).toBe(0)
      expect(canvas.items.some((i) => i.id === fileResult.nodeId)).toBe(false)
    })

    it('should update path mapper on file create/delete', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      // Create file node
      setup.fileMap.set('Test-Canvas/tracked.pdf', createFakePDFBuffer())
      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/tracked.pdf',
      })

      // Verify path mapper has the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.pdf')).toBeDefined()

      // Delete file node
      await setup.syncer.syncChange({
        type: 'delete',
        path: 'Test-Canvas/tracked.pdf',
      })

      // Path mapper should no longer have the mapping
      expect(setup.pathMapper.getMapping('Test-Canvas/tracked.pdf')).toBeUndefined()
    })

    it('should create file node in nested canvas', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Parent')
      const childCanvas = await createTestCanvas(setup, 'Parent/Child')

      setup.fileMap.set('Parent/Child/nested-doc.pdf', createFakePDFBuffer())
      const result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Parent/Child/nested-doc.pdf',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('created_node')

      const node = childCanvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === result.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('file')
    })

    it('should use correct canvasId in upload call for file', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/upload-test.pdf', createFakePDFBuffer())
      await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/upload-test.pdf',
      })

      expect(setup.uploadCalls.length).toBe(1)
      expect(setup.uploadCalls[0].canvasId).toBe(canvas.id)
      expect(setup.uploadCalls[0].filename).toBe('upload-test.pdf')
      expect(setup.uploadCalls[0].mimeType).toBe('application/pdf')
    })
  })

  // ============================================================================
  // BINARY FILE UPDATES
  // ============================================================================

  describe('Binary file updates', () => {
    it('should stamp audit on create and preserve created audit on update', async () => {
      let now = '2026-02-18T00:00:00.000Z'
      const setup = createSyncerWithBinarySupport({ auditActor: 'agent:test-user', now: () => now })
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      setup.fileMap.set('Test-Canvas/audit.csv', createFakeCSVBuffer())
      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audit.csv',
      })

      expect(createResult.success).toBe(true)
      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node).toBeDefined()

      const createdData = node!.xynode.data as FileNodeData
      expect(createdData.audit?.createdAt).toBe('2026-02-18T00:00:00.000Z')
      expect(createdData.audit?.updatedAt).toBe('2026-02-18T00:00:00.000Z')
      expect(createdData.audit?.createdBy).toBe('agent:test-user')
      expect(createdData.audit?.updatedBy).toBe('agent:test-user')

      now = '2026-02-18T00:20:00.000Z'
      setup.fileMap.set('Test-Canvas/audit.csv', Buffer.from('a,b\n1,2\n', 'utf-8'))
      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/audit.csv',
      })

      expect(updateResult.success).toBe(true)
      expect(updateResult.action).toBe('updated_binary_content')

      const updatedData = node!.xynode.data as FileNodeData
      expect(updatedData.audit?.createdAt).toBe('2026-02-18T00:00:00.000Z')
      expect(updatedData.audit?.createdBy).toBe('agent:test-user')
      expect(updatedData.audit?.updatedAt).toBe('2026-02-18T00:20:00.000Z')
      expect(updatedData.audit?.updatedBy).toBe('agent:test-user')
    })

    it('should update FileNode with new storagePath and contentHash', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create initial CSV file
      const initialCsv = Buffer.from('name,value\ntest,123\n', 'utf-8')
      setup.fileMap.set('Test-Canvas/data.csv', initialCsv)
      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/data.csv',
      })

      expect(createResult.success).toBe(true)
      expect(createResult.action).toBe('created_node')

      const node1 = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node1).toBeDefined()
      expect(node1!.xynode.type).toBe('file')

      const data1 = node1!.xynode.data as FileNodeData
      const originalStoragePath = data1.storagePath
      const originalContentHash = data1.contentHash

      expect(originalContentHash).toBeDefined()
      expect(originalContentHash).toHaveLength(64) // SHA-256 hex

      // Update CSV with new content
      const updatedCsv = Buffer.from('name,value\ntest,123\nfoo,456\n', 'utf-8')
      setup.fileMap.set('Test-Canvas/data.csv', updatedCsv)
      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/data.csv',
      })

      expect(updateResult.success).toBe(true)
      expect(updateResult.action).toBe('updated_binary_content')
      expect(updateResult.nodeId).toBe(node1!.id)

      // Verify node data was updated
      const data2 = node1!.xynode.data as FileNodeData
      // Note: storagePath may or may not change depending on backend implementation
      // The critical assertion is that contentHash changes for different content
      expect(data2.contentHash).not.toBe(originalContentHash)
      expect(data2.contentHash).toHaveLength(64)
      expect(data2.size).toBe(updatedCsv.length)

      // Verify upload was called twice (once for create, once for update)
      expect(setup.uploadCalls.length).toBe(2)
    })

    it('should update ImageNode when binary content changes', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create image
      const imageBuffer = createFakeImageBuffer()
      setup.fileMap.set('Test-Canvas/photo.png', imageBuffer)
      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/photo.png',
      })

      expect(createResult.success).toBe(true)
      expect(createResult.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('image')

      const resizedDimensions = { width: 512, height: 420 }
      node!.xynode.width = resizedDimensions.width
      node!.xynode.height = resizedDimensions.height
      node!.xynode.measured = { ...resizedDimensions }

      const originalData = node!.xynode.data as ImageNodeData
      const originalContentHash = originalData.contentHash

      // Update image
      const newImageBuffer = createFakeImageBuffer(320, 160)
      setup.fileMap.set('Test-Canvas/photo.png', newImageBuffer)
      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/photo.png',
      })

      expect(updateResult.success).toBe(true)
      expect(updateResult.action).toBe('updated_binary_content')

      // Verify node data changed
      const currentData = node!.xynode.data as ImageNodeData
      expect(currentData.storagePath).toBeDefined()
      expect(currentData.contentHash).not.toBe(originalContentHash)
      expect(currentData.width).toBe(320)
      expect(currentData.height).toBe(160)
      expect(node!.xynode.width).toBe(resizedDimensions.width)
      expect(node!.xynode.height).toBe(resizedDimensions.height)
      expect(node!.xynode.measured).toEqual(resizedDimensions)
    })

    it('should update AudioNode when binary content changes', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create audio
      const audioBuffer = createFakeMP3Buffer()
      setup.fileMap.set('Test-Canvas/song.mp3', audioBuffer)
      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/song.mp3',
      })

      expect(createResult.success).toBe(true)
      expect(createResult.action).toBe('created_node')

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node).toBeDefined()
      expect(node!.xynode.type).toBe('audio')

      const originalData = node!.xynode.data as AudioNodeData
      const originalContentHash = originalData.contentHash

      // Update audio
      const newAudioBuffer = createFakeWAVBuffer() // Different buffer
      setup.fileMap.set('Test-Canvas/song.mp3', newAudioBuffer)
      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/song.mp3',
      })

      expect(updateResult.success).toBe(true)
      expect(updateResult.action).toBe('updated_binary_content')

      // Verify node data changed
      const currentData = node!.xynode.data as AudioNodeData
      expect(currentData.storagePath).toBeDefined()
      expect(currentData.contentHash).not.toBe(originalContentHash)
    })

    it('should include contentHash on all binary node CREATE', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create CSV
      setup.fileMap.set('Test-Canvas/data.csv', createFakeCSVBuffer())
      const csvResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/data.csv',
      })

      // Create PNG
      setup.fileMap.set('Test-Canvas/photo.png', createFakeImageBuffer())
      const pngResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/photo.png',
      })

      // Create MP3
      setup.fileMap.set('Test-Canvas/audio.mp3', createFakeMP3Buffer())
      const mp3Result = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/audio.mp3',
      })

      // Find all nodes
      const csvNode = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === csvResult.nodeId)
      const pngNode = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === pngResult.nodeId)
      const mp3Node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === mp3Result.nodeId)

      expect(csvNode).toBeDefined()
      expect(pngNode).toBeDefined()
      expect(mp3Node).toBeDefined()

      // Verify all have contentHash
      const csvData = csvNode!.xynode.data as FileNodeData
      const pngData = pngNode!.xynode.data as ImageNodeData
      const mp3Data = mp3Node!.xynode.data as AudioNodeData

      expect(csvData.contentHash).toBeDefined()
      expect(csvData.contentHash).toHaveLength(64)

      expect(pngData.contentHash).toBeDefined()
      expect(pngData.contentHash).toHaveLength(64)

      expect(mp3Data.contentHash).toBeDefined()
      expect(mp3Data.contentHash).toHaveLength(64)

      // Verify different content produces different hashes
      expect(csvData.contentHash).not.toBe(pngData.contentHash)
      expect(pngData.contentHash).not.toBe(mp3Data.contentHash)
    })

    it('should handle upload failure during FileNode update', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const pathMapper = new PathMapper()
      const contentConverter = new ContentConverter()
      pathMapper.buildFromWorkspace(proxy)

      // First syncer with working uploader for creation
      const { uploader: workingUploader } = createMockFileUploader()
      const fileMap = new Map<string, Buffer>()
      const { reader } = createMockFileReader(fileMap)

      const syncer1 = new FilesystemSyncer({
        proxy,
        yDoc,
        pathMapper,
        contentConverter,
        fileUploader: workingUploader,
        fileReader: reader,
      })

      // Create canvas and file
      const canvasResult = await syncer1.syncChange({ type: 'create', path: 'Test-Canvas' })
      expect(canvasResult.success).toBe(true)

      const initialCsv = Buffer.from('name,value\ntest,123\n', 'utf-8')
      fileMap.set('Test-Canvas/data.csv', initialCsv)
      const createResult = await syncer1.syncChange({
        type: 'create',
        path: 'Test-Canvas/data.csv',
      })

      expect(createResult.success).toBe(true)

      // Get original data
      const canvas = proxy.root.items.find(
        (i): i is CanvasItem => i.kind === 'canvas' && i.id === canvasResult.canvasId
      )
      expect(canvas).toBeDefined()
      const node = canvas!.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node).toBeDefined()

      const originalData = node!.xynode.data as FileNodeData
      const originalStoragePath = originalData.storagePath
      const originalContentHash = originalData.contentHash

      // Create second syncer with failing uploader
      const failingUploader = createFailingFileUploader('Network error')
      const syncer2 = new FilesystemSyncer({
        proxy,
        yDoc,
        pathMapper,
        contentConverter,
        fileUploader: failingUploader,
        fileReader: reader,
      })

      // Update file content and try to sync
      const updatedCsv = Buffer.from('name,value\ntest,123\nfoo,456\n', 'utf-8')
      fileMap.set('Test-Canvas/data.csv', updatedCsv)
      const updateResult = await syncer2.syncChange({
        type: 'update',
        path: 'Test-Canvas/data.csv',
      })

      expect(updateResult.success).toBe(false)
      expect(updateResult.action).toBe('error')
      expect(updateResult.error).toContain('Failed to upload')

      // Verify original node data is preserved
      const currentData = node!.xynode.data as FileNodeData
      expect(currentData.storagePath).toBe(originalStoragePath)
      expect(currentData.contentHash).toBe(originalContentHash)
    })

    it('should handle file read failure during FileNode update', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      const canvas = await createTestCanvas(setup, 'Test-Canvas')

      // Create initial CSV file
      const initialCsv = Buffer.from('name,value\ntest,123\n', 'utf-8')
      setup.fileMap.set('Test-Canvas/data.csv', initialCsv)
      const createResult = await setup.syncer.syncChange({
        type: 'create',
        path: 'Test-Canvas/data.csv',
      })

      expect(createResult.success).toBe(true)

      const node = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === createResult.nodeId)
      expect(node).toBeDefined()

      const originalData = node!.xynode.data as FileNodeData
      const originalStoragePath = originalData.storagePath
      const originalContentHash = originalData.contentHash

      // Remove file from map to simulate read failure
      setup.fileMap.delete('Test-Canvas/data.csv')

      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/data.csv',
      })

      expect(updateResult.success).toBe(false)
      expect(updateResult.action).toBe('error')
      expect(updateResult.error).toContain('Failed to read file')

      // Verify original node data is preserved
      const currentData = node!.xynode.data as FileNodeData
      expect(currentData.storagePath).toBe(originalStoragePath)
      expect(currentData.contentHash).toBe(originalContentHash)
    })

    it('should return no_op when updating unknown path', async () => {
      const setup = createSyncerWithBinarySupport()
      disposeCallbacks.push(setup.dispose)

      await createTestCanvas(setup, 'Test-Canvas')

      // Try to update a file that was never created
      const updateResult = await setup.syncer.syncChange({
        type: 'update',
        path: 'Test-Canvas/nonexistent.csv',
      })

      expect(updateResult.success).toBe(true)
      expect(updateResult.action).toBe('no_op')
    })
  })
})
