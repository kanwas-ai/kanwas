import { describe, it, expect, afterEach } from 'vitest'
import * as yaml from 'yaml'
import { ContentConverter } from '../../../src/workspace/content-converter.js'
import { createWorkspaceContentStore } from '../../../src/workspace/workspace-content-store.js'
import { workspaceToFilesystem, type FSNode, type FileFetcher } from '../../../src/workspace/converter.js'
import {
  createTestWorkspace,
  createCanvas,
  createBlockNoteNode,
  createImageNode,
  createAudioNode,
  createFileNode,
  createLinkNode,
} from '../../helpers/workspace-factory.js'
import type { NodeItem, StickyNoteNode, TextNode } from '../../../src/types.js'

describe('workspaceToFilesystem', () => {
  const disposeCallbacks: Array<() => void> = []

  afterEach(() => {
    // Clean up all created workspaces
    disposeCallbacks.forEach((dispose) => dispose())
    disposeCallbacks.length = 0
  })

  it('should convert empty workspace to root folder with metadata', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const result = await workspaceToFilesystem(proxy, yDoc)

    expect(result.type).toBe('folder')
    expect(result.name).toBe('.')
    // Root canvas has metadata.yaml
    expect(result.children).toHaveLength(1)
    expect(result.children![0].name).toBe('metadata.yaml')
  })

  it('should convert child canvas to filesystem folder', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    proxy.root.items = [createCanvas('canvas-1', 'Projects')]

    const result = await workspaceToFilesystem(proxy, yDoc)

    expect(result.type).toBe('folder')
    expect(result.name).toBe('.')
    // Has metadata.yaml + lowercase projects folder
    expect(result.children!.length).toBeGreaterThanOrEqual(1)
    const projectsFolder = result.children!.find((c) => c.name === 'projects')
    expect(projectsFolder).toBeDefined()
    expect(projectsFolder!.type).toBe('folder')
  })

  it('should convert canvas to folder without prefix', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    proxy.root.items = [createCanvas('canvas-1', 'My Canvas')]

    const result = await workspaceToFilesystem(proxy, yDoc)

    const canvasFolder = result.children!.find((c) => c.name === 'my-canvas')
    expect(canvasFolder).toBeDefined()
    expect(canvasFolder!.type).toBe('folder')
    // Canvas name is sanitized to lowercase kebab-case, no prefix
    expect(canvasFolder!.name).toBe('my-canvas')
  })

  it('should create metadata.yaml with canvas information', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node1 = await createBlockNoteNode(
      'node-1',
      'First Note',
      yDoc,
      '# First Note\n\nThis is the first note content.'
    )
    const node2 = await createBlockNoteNode(
      'node-2',
      'Second Note',
      yDoc,
      '# Second Note\n\nThis is the second note content.'
    )

    proxy.root.items = [createCanvas('canvas-1', 'My Canvas', [node1, node2], [])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'my-canvas')
    expect(canvasFolder).toBeDefined()
    const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')

    expect(metadataFile).toBeDefined()
    expect(metadataFile!.type).toBe('file')
    expect(metadataFile!.data).toBeInstanceOf(Buffer)

    const metadata = yaml.parse(metadataFile!.data!.toString())
    expect(metadata).toMatchObject({
      id: 'canvas-1',
      name: 'My Canvas',
      edges: [],
      nodes: [
        {
          id: 'node-1',
          name: 'First Note',
          xynode: expect.objectContaining({
            id: 'node-1',
            type: 'blockNote',
          }),
        },
        {
          id: 'node-2',
          name: 'Second Note',
          xynode: expect.objectContaining({
            id: 'node-2',
            type: 'blockNote',
          }),
        },
      ],
    })
  })

  it('omits pending canvas placement markers from metadata.yaml', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node = await createBlockNoteNode('node-1', 'Pending Note', yDoc, '# Pending Note')
    node.xynode.data.pendingCanvasPlacement = { source: 'filesystem', reason: 'created' }
    proxy.root.items = [createCanvas('canvas-1', 'My Canvas', [node], [])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'my-canvas')
    const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
    const metadata = yaml.parse(metadataFile!.data!.toString())

    expect(metadata.nodes[0].xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })

  it('serializes audit actors as metadata identity objects', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node = await createBlockNoteNode('node-1', 'Audit Note', yDoc, '# Audit Note')
    node.xynode.data.audit = {
      createdAt: '2026-02-18T12:00:00.000Z',
      updatedAt: '2026-02-18T12:30:00.000Z',
      createdBy: 'agent:123',
      updatedBy: 'user:456',
    }

    const canvas = createCanvas('canvas-1', 'Audit Canvas', [node])
    canvas.xynode.data.audit = {
      createdAt: '2026-02-18T11:00:00.000Z',
      updatedAt: '2026-02-18T12:30:00.000Z',
      createdBy: 'user:456',
      updatedBy: 'agent:123',
    }
    proxy.root.items = [canvas]

    const result = await workspaceToFilesystem(proxy, yDoc, {
      resolveActorIdentity: async (actor) => {
        if (actor === 'agent:123') {
          return { id: '123', name: 'Agent One', email: 'agent@example.com' }
        }
        if (actor === 'user:456') {
          return { id: '456', name: 'User Two', email: 'user@example.com' }
        }
        return null
      },
    })

    const canvasFolder = result.children!.find((c) => c.name === 'audit-canvas')
    expect(canvasFolder).toBeDefined()
    const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
    expect(metadataFile).toBeDefined()

    const metadata = yaml.parse(metadataFile!.data!.toString())
    expect(metadata.xynode.data.audit.createdBy).toEqual({
      actor: 'user:456',
      id: '456',
      name: 'User Two',
      email: 'user@example.com',
    })
    expect(metadata.xynode.data.audit.updatedBy).toEqual({
      actor: 'agent:123',
      id: '123',
      name: 'Agent One',
      email: 'agent@example.com',
    })

    expect(metadata.nodes[0].xynode.data.audit.createdBy).toEqual({
      actor: 'agent:123',
      id: '123',
      name: 'Agent One',
      email: 'agent@example.com',
    })
    expect(metadata.nodes[0].xynode.data.audit.updatedBy).toEqual({
      actor: 'user:456',
      id: '456',
      name: 'User Two',
      email: 'user@example.com',
    })
  })

  it('should create .md files for BlockNote nodes', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node1 = await createBlockNoteNode(
      'node-1',
      'My Note',
      yDoc,
      '# My Note\n\nThis is **important** content with *emphasis*.\n\n- Item 1\n- Item 2\n- Item 3'
    )

    proxy.root.items = [createCanvas('canvas-1', 'My Canvas', [node1])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'my-canvas')
    expect(canvasFolder).toBeDefined()
    const mdFile = canvasFolder!.children!.find((child) => child.name === 'my-note.md')

    expect(mdFile).toBeDefined()
    expect(mdFile!.type).toBe('file')
    expect(mdFile!.data).toBeInstanceOf(Buffer)

    const content = mdFile!.data!.toString()
    expect(content).toContain('My Note')
    expect(content).toContain('important')
    expect(content).toContain('Item 1')
  })

  it('writes normalized BlockNote list spacing to markdown files', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node = await createBlockNoteNode('node-1', 'List Note', yDoc, '# Title\n\n- one\n- two\n- three')

    proxy.root.items = [createCanvas('canvas-1', 'My Canvas', [node])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((child) => child.name === 'my-canvas')
    expect(canvasFolder).toBeDefined()

    const mdFile = canvasFolder!.children!.find((child) => child.name === 'list-note.md')
    expect(mdFile).toBeDefined()
    expect(mdFile!.type).toBe('file')
    expect(mdFile!.data).toBeInstanceOf(Buffer)
    expect(mdFile!.data!.toString()).toBe('# Title\n\n* one\n* two\n* three\n')
  })

  it('should handle canvas with mixed node types', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const blockNote = await createBlockNoteNode('node-1', 'Note', yDoc, '# Note\n\nA simple note in the canvas.')
    const imageNode = createImageNode('node-2', 'Diagram', {
      storagePath: 'files/workspace/diagram.png',
      mimeType: 'image/png',
      size: 2048,
    })

    proxy.root.items = [createCanvas('canvas-1', 'Mixed Canvas', [blockNote, imageNode])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'mixed-canvas')
    expect(canvasFolder).toBeDefined()

    // Should have metadata.yaml + 2 node files
    expect(canvasFolder!.children).toHaveLength(3)

    const noteFile = canvasFolder!.children!.find((child) => child.name === 'note.md')
    const imageFile = canvasFolder!.children!.find((child) => child.name === 'diagram.png')

    expect(noteFile).toBeDefined()
    expect(imageFile).toBeDefined()
  })

  it('exports text and sticky nodes as canonical yaml files', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const contentStore = createWorkspaceContentStore(yDoc)
    const converter = new ContentConverter()
    contentStore.createNoteDoc('node-2', 'stickyNote')
    const stickyFragment = contentStore.getBlockNoteFragment('node-2')
    if (!stickyFragment) throw new Error('Missing sticky fragment in test setup')
    await converter.updateFragmentFromMarkdown(stickyFragment, 'Sticky body', { nodeId: 'node-2', source: 'test' })

    const textNode: NodeItem = {
      kind: 'node',
      id: 'node-1',
      name: 'Callout',
      xynode: {
        id: 'node-1',
        type: 'text',
        position: { x: 0, y: 0 },
        data: { content: 'Text body' },
      } as TextNode,
    }

    const stickyNode: NodeItem = {
      kind: 'node',
      id: 'node-2',
      name: 'Retro',
      xynode: {
        id: 'node-2',
        type: 'stickyNote',
        position: { x: 0, y: 0 },
        data: { color: 'yellow' },
      } as StickyNoteNode,
    }

    proxy.root.items = [createCanvas('canvas-1', 'My Canvas', [textNode, stickyNode])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((child) => child.name === 'my-canvas')
    expect(canvasFolder?.children?.find((child) => child.name === 'callout.text.yaml')).toBeDefined()
    expect(canvasFolder?.children?.find((child) => child.name === 'retro.sticky.yaml')).toBeDefined()

    const stickyFile = canvasFolder?.children?.find((child) => child.name === 'retro.sticky.yaml')
    expect(yaml.parse(stickyFile?.data?.toString() || '')).toMatchObject({ content: 'Sticky body\n', color: 'yellow' })
  })

  it('should handle nested canvas structure', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    // Create nested canvas structure: Projects > SubFolder > Inner Canvas
    const innerCanvas = createCanvas('canvas-inner', 'Inner Canvas')
    const subFolderCanvas = createCanvas('canvas-sub', 'SubFolder', [], [], [innerCanvas])
    const projectsCanvas = createCanvas('canvas-projects', 'Projects', [], [], [subFolderCanvas])

    proxy.root.items = [projectsCanvas]

    const result = await workspaceToFilesystem(proxy, yDoc)

    const projectsFolder = result.children!.find((c) => c.name === 'projects')
    expect(projectsFolder).toBeDefined()

    const subFolder = projectsFolder!.children!.find((c) => c.name === 'subfolder')
    expect(subFolder).toBeDefined()

    const canvasFolder = subFolder!.children!.find((c) => c.name === 'inner-canvas')
    // Canvas name is sanitized to lowercase kebab-case, no prefix
    expect(canvasFolder).toBeDefined()
    expect(canvasFolder!.name).toBe('inner-canvas')
  })

  it('should sanitize filenames with special characters', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const node = await createBlockNoteNode(
      'node-1',
      'My<>:|?*Note/With\\Invalid"Chars',
      yDoc,
      '# Test\n\nTesting filename sanitization.'
    )

    proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [node])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
    expect(canvasFolder).toBeDefined()
    const mdFile = canvasFolder!.children!.find((child) => child.name.endsWith('.md'))

    expect(mdFile).toBeDefined()
    // Special characters should be replaced with dashes
    expect(mdFile!.name).toBe('my-note-with-invalid-chars.md')
    expect(mdFile!.name).not.toContain('<')
    expect(mdFile!.name).not.toContain('>')
    expect(mdFile!.name).not.toContain(':')
    expect(mdFile!.name).not.toContain('|')
    expect(mdFile!.name).not.toContain('?')
    expect(mdFile!.name).not.toContain('*')
    expect(mdFile!.name).not.toContain('/')
    expect(mdFile!.name).not.toContain('\\')
    expect(mdFile!.name).not.toContain('"')
  })

  it('should handle multiple canvases', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const canvas1 = createCanvas('canvas-1', 'Canvas One')
    const canvas2 = createCanvas('canvas-2', 'Canvas Two')
    const canvas3 = createCanvas('canvas-3', 'Canvas Three')
    const canvas4 = createCanvas('canvas-4', 'Canvas Four')

    proxy.root.items = [canvas1, canvas2, canvas3, canvas4]

    const result = await workspaceToFilesystem(proxy, yDoc)

    // Items are sorted by ID for deterministic deduplication
    // Names are sanitized to lowercase kebab-case, no prefix
    const canvasNames = result.children!.filter((c) => c.name !== 'metadata.yaml').map((c) => c.name)
    expect(canvasNames).toContain('canvas-one')
    expect(canvasNames).toContain('canvas-two')
    expect(canvasNames).toContain('canvas-three')
    expect(canvasNames).toContain('canvas-four')
  })

  it('should handle canvas with no nodes', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    proxy.root.items = [createCanvas('canvas-1', 'Empty Canvas', [], [])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'empty-canvas')
    expect(canvasFolder).toBeDefined()

    // Should only have metadata.yaml
    expect(canvasFolder!.children).toHaveLength(1)
    expect(canvasFolder!.children![0].name).toBe('metadata.yaml')
  })

  it('should preserve heading levels in markdown output', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const markdown = `# Level 1 Heading

## Level 2 Heading

### Level 3 Heading

#### Level 4 Heading

Some paragraph text.`

    const node = await createBlockNoteNode('node-1', 'Multi Heading', yDoc, markdown)

    proxy.root.items = [createCanvas('canvas-1', 'Heading Test', [node])]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'heading-test')
    expect(canvasFolder).toBeDefined()
    const mdFile = canvasFolder!.children!.find((child) => child.name === 'multi-heading.md')

    expect(mdFile).toBeDefined()
    const content = mdFile!.data!.toString()

    console.log('\n=== HEADING LEVEL TEST (workspaceToFilesystem) ===')
    console.log('Original markdown:')
    console.log(markdown)
    console.log('\nResult markdown:')
    console.log(content)
    console.log('========================\n')

    // Verify heading levels are preserved
    expect(content).toContain('# Level 1')
    expect(content).toContain('## Level 2')
    expect(content).toContain('### Level 3')
    expect(content).toContain('#### Level 4')
  })

  it('preserves measured fields in serialized metadata xynodes', async () => {
    const { proxy, yDoc, dispose } = createTestWorkspace()
    disposeCallbacks.push(dispose)

    const blockNoteNode = await createBlockNoteNode(
      'node-1',
      'Test Node',
      yDoc,
      '# Test Node\n\nContent for metadata validation test.'
    )
    const imageNode = createImageNode('node-2', 'Diagram', {
      storagePath: 'files/workspace/diagram.png',
      mimeType: 'image/png',
      size: 2048,
      contentHash: 'image-hash',
    })
    const audioNode = createAudioNode('node-3', 'Recording', {
      storagePath: 'files/workspace/recording.mp3',
      mimeType: 'audio/mpeg',
      size: 4096,
      originalFilename: 'recording.mp3',
      contentHash: 'audio-hash',
    })
    const fileNode = createFileNode('node-4', 'Report', {
      storagePath: 'files/workspace/report.pdf',
      mimeType: 'application/pdf',
      size: 8192,
      originalFilename: 'report.pdf',
      contentHash: 'file-hash',
    })
    const linkNode = createLinkNode('node-5', 'Reference', {
      url: 'https://example.com/reference',
    })

    const canvas = createCanvas('canvas-1', 'Test Canvas', [blockNoteNode, imageNode, audioNode, fileNode, linkNode])
    canvas.xynode.measured = { width: 1200, height: 800 }
    proxy.root.items = [canvas]

    const result = await workspaceToFilesystem(proxy, yDoc)
    const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
    expect(canvasFolder).toBeDefined()
    const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')

    const metadata = yaml.parse(metadataFile!.data!.toString())
    const nodeXynodesByName = Object.fromEntries(
      metadata.nodes.map((serializedNode: { name: string; xynode: Record<string, unknown> }) => [
        serializedNode.name,
        serializedNode.xynode,
      ])
    )

    expect(metadata.xynode.measured).toEqual({ width: 1200, height: 800 })
    expect(nodeXynodesByName['Test Node']).toMatchObject({
      id: 'node-1',
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    })
    expect(nodeXynodesByName['Test Node'].measured).toEqual(blockNoteNode.xynode.measured)
    expect(nodeXynodesByName.Diagram.measured).toEqual(imageNode.xynode.measured)
    expect(nodeXynodesByName.Recording.measured).toEqual(audioNode.xynode.measured)
    expect(nodeXynodesByName.Report.measured).toEqual(fileNode.xynode.measured)
    expect(nodeXynodesByName.Reference.measured).toEqual(linkNode.xynode.measured)
  })

  // ==========================================================================
  // BINARY FILE OUTPUT TESTS
  // ==========================================================================

  describe('binary file output', () => {
    it('should create placeholder markdown for image node without fetcher', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const imageNode = createImageNode('image-1', 'My Screenshot', {
        storagePath: 'files/workspace/screenshot.png',
        mimeType: 'image/png',
        size: 1024,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [imageNode])]

      // No fileFetcher provided - should create placeholder
      const result = await workspaceToFilesystem(proxy, yDoc)
      const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
      expect(canvasFolder).toBeDefined()

      // Without fetcher, image becomes a placeholder .png file with markdown content
      const imageFile = canvasFolder!.children!.find((child) => child.name === 'my-screenshot.png')
      expect(imageFile).toBeDefined()
      expect(imageFile!.type).toBe('file')

      const content = imageFile!.data!.toString()
      expect(content).toContain('Binary file')
      expect(content).toContain('Storage path')
    })

    it('should create binary file with fetcher', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const imageNode = createImageNode('image-1', 'Photo', {
        storagePath: 'files/workspace/photo.png',
        mimeType: 'image/png',
        size: 2048,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [imageNode])]

      // Create a mock fetcher that returns fake PNG data
      const fakePngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG magic bytes
      const fileFetcher: FileFetcher = async (storagePath) => {
        expect(storagePath).toBe('files/workspace/photo.png')
        return fakePngData
      }

      const result = await workspaceToFilesystem(proxy, yDoc, { fileFetcher })
      const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
      expect(canvasFolder).toBeDefined()

      const imageFile = canvasFolder!.children!.find((child) => child.name === 'photo.png')
      expect(imageFile).toBeDefined()
      expect(imageFile!.data).toEqual(fakePngData)
    })

    it('should use correct extension based on mime type', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const pngNode = createImageNode('img-1', 'PNG Image', {
        storagePath: 'files/png.png',
        mimeType: 'image/png',
        size: 100,
      })
      const jpgNode = createImageNode('img-2', 'JPG Image', {
        storagePath: 'files/jpg.jpg',
        mimeType: 'image/jpeg',
        size: 200,
      })
      const gifNode = createImageNode('img-3', 'GIF Image', {
        storagePath: 'files/gif.gif',
        mimeType: 'image/gif',
        size: 300,
      })
      const webpNode = createImageNode('img-4', 'WebP Image', {
        storagePath: 'files/webp.webp',
        mimeType: 'image/webp',
        size: 400,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Images', [pngNode, jpgNode, gifNode, webpNode])]

      const result = await workspaceToFilesystem(proxy, yDoc)
      const canvasFolder = result.children!.find((c) => c.name === 'images')
      expect(canvasFolder).toBeDefined()

      // Each image should have correct extension
      expect(canvasFolder!.children!.find((c) => c.name === 'png-image.png')).toBeDefined()
      expect(canvasFolder!.children!.find((c) => c.name === 'jpg-image.jpg')).toBeDefined()
      expect(canvasFolder!.children!.find((c) => c.name === 'gif-image.gif')).toBeDefined()
      expect(canvasFolder!.children!.find((c) => c.name === 'webp-image.webp')).toBeDefined()
    })

    it('should create error placeholder on fetcher failure', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const imageNode = createImageNode('image-1', 'Broken Image', {
        storagePath: 'files/missing.png',
        mimeType: 'image/png',
        size: 1000,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [imageNode])]

      // Fetcher that fails
      const fileFetcher: FileFetcher = async () => {
        throw new Error('File not found in storage')
      }

      const result = await workspaceToFilesystem(proxy, yDoc, { fileFetcher })
      const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
      expect(canvasFolder).toBeDefined()

      const imageFile = canvasFolder!.children!.find((child) => child.name === 'broken-image.png')
      expect(imageFile).toBeDefined()

      // Should contain error placeholder
      const content = imageFile!.data!.toString()
      expect(content).toContain('Error loading file')
      expect(content).toContain('File not found in storage')
    })

    it('should include image node xynode in metadata.yaml', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const imageNode = createImageNode('image-1', 'Screenshot', {
        storagePath: 'files/screenshot.png',
        mimeType: 'image/png',
        size: 5000,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [imageNode])]

      const result = await workspaceToFilesystem(proxy, yDoc)
      const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
      expect(canvasFolder).toBeDefined()

      const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
      expect(metadataFile).toBeDefined()

      const metadata = yaml.parse(metadataFile!.data!.toString())
      expect(metadata.nodes).toHaveLength(1)
      expect(metadata.nodes[0]).toMatchObject({
        id: 'image-1',
        name: 'Screenshot',
        xynode: {
          id: 'image-1',
          type: 'image',
          data: {
            storagePath: 'files/screenshot.png',
            mimeType: 'image/png',
            size: 5000,
          },
        },
      })
    })

    it('should handle mixed text and image nodes', async () => {
      const { proxy, yDoc, dispose } = createTestWorkspace()
      disposeCallbacks.push(dispose)

      const textNode = await createBlockNoteNode('node-1', 'Notes', yDoc, '# My Notes\n\nSome text content.')
      const imageNode = createImageNode('image-1', 'Diagram', {
        storagePath: 'files/diagram.png',
        mimeType: 'image/png',
        size: 2000,
      })

      proxy.root.items = [createCanvas('canvas-1', 'Mixed Canvas', [textNode, imageNode])]

      const result = await workspaceToFilesystem(proxy, yDoc)
      const canvasFolder = result.children!.find((c) => c.name === 'mixed-canvas')
      expect(canvasFolder).toBeDefined()

      // Should have metadata.yaml + .md file + .png file
      expect(canvasFolder!.children).toHaveLength(3)

      const mdFile = canvasFolder!.children!.find((c) => c.name === 'notes.md')
      const pngFile = canvasFolder!.children!.find((c) => c.name === 'diagram.png')

      expect(mdFile).toBeDefined()
      expect(pngFile).toBeDefined()
    })

    // ========================================================================
    // AUDIO NODE CONVERSION
    // ========================================================================

    describe('audio nodes', () => {
      it('should create audio file with correct extension from originalFilename', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const audioNode = createAudioNode('audio-1', 'Podcast Episode', {
          storagePath: 'files/workspace/episode.mp3',
          mimeType: 'audio/mpeg',
          size: 5000000,
          originalFilename: 'episode.mp3',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [audioNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        // Audio file should use .mp3 extension from originalFilename
        const audioFile = canvasFolder!.children!.find((child) => child.name === 'podcast-episode.mp3')
        expect(audioFile).toBeDefined()
        expect(audioFile!.type).toBe('file')
      })

      it('should handle various audio formats', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const mp3Node = createAudioNode('audio-1', 'MP3 Audio', {
          storagePath: 'files/audio.mp3',
          mimeType: 'audio/mpeg',
          size: 1000,
          originalFilename: 'audio.mp3',
        })
        const wavNode = createAudioNode('audio-2', 'WAV Audio', {
          storagePath: 'files/audio.wav',
          mimeType: 'audio/wav',
          size: 2000,
          originalFilename: 'audio.wav',
        })
        const oggNode = createAudioNode('audio-3', 'OGG Audio', {
          storagePath: 'files/audio.ogg',
          mimeType: 'audio/ogg',
          size: 3000,
          originalFilename: 'audio.ogg',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Audio Collection', [mp3Node, wavNode, oggNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'audio-collection')
        expect(canvasFolder).toBeDefined()

        expect(canvasFolder!.children!.find((c) => c.name === 'mp3-audio.mp3')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'wav-audio.wav')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'ogg-audio.ogg')).toBeDefined()
      })

      it('should include audio node in metadata.yaml', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const audioNode = createAudioNode('audio-1', 'Recording', {
          storagePath: 'files/recording.mp3',
          mimeType: 'audio/mpeg',
          size: 2500000,
          originalFilename: 'recording.mp3',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [audioNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
        expect(metadataFile).toBeDefined()

        const metadata = yaml.parse(metadataFile!.data!.toString())
        expect(metadata.nodes).toHaveLength(1)
        expect(metadata.nodes[0]).toMatchObject({
          id: 'audio-1',
          name: 'Recording',
          xynode: {
            id: 'audio-1',
            type: 'audio',
            data: {
              storagePath: 'files/recording.mp3',
              mimeType: 'audio/mpeg',
              size: 2500000,
              originalFilename: 'recording.mp3',
            },
          },
        })
      })
    })

    // ========================================================================
    // FILE NODE CONVERSION
    // ========================================================================

    describe('file nodes', () => {
      it('should create file with correct extension from originalFilename', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const fileNode = createFileNode('file-1', 'Report', {
          storagePath: 'files/workspace/report.pdf',
          mimeType: 'application/pdf',
          size: 100000,
          originalFilename: 'report.pdf',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [fileNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        // File should use .pdf extension from originalFilename
        const pdfFile = canvasFolder!.children!.find((child) => child.name === 'report.pdf')
        expect(pdfFile).toBeDefined()
        expect(pdfFile!.type).toBe('file')
      })

      it('should handle various document formats', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const pdfNode = createFileNode('file-1', 'PDF Document', {
          storagePath: 'files/doc.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          originalFilename: 'doc.pdf',
        })
        const csvNode = createFileNode('file-2', 'CSV Data', {
          storagePath: 'files/data.csv',
          mimeType: 'text/csv',
          size: 2000,
          originalFilename: 'data.csv',
        })
        const txtNode = createFileNode('file-3', 'Text File', {
          storagePath: 'files/readme.txt',
          mimeType: 'text/plain',
          size: 500,
          originalFilename: 'readme.txt',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Documents', [pdfNode, csvNode, txtNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'documents')
        expect(canvasFolder).toBeDefined()

        expect(canvasFolder!.children!.find((c) => c.name === 'pdf-document.pdf')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'csv-data.csv')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'text-file.txt')).toBeDefined()
      })

      it('should include file node in metadata.yaml', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const fileNode = createFileNode('file-1', 'Spreadsheet', {
          storagePath: 'files/data.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 50000,
          originalFilename: 'data.xlsx',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [fileNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
        expect(metadataFile).toBeDefined()

        const metadata = yaml.parse(metadataFile!.data!.toString())
        expect(metadata.nodes).toHaveLength(1)
        expect(metadata.nodes[0]).toMatchObject({
          id: 'file-1',
          name: 'Spreadsheet',
          xynode: {
            id: 'file-1',
            type: 'file',
            data: {
              storagePath: 'files/data.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              size: 50000,
              originalFilename: 'data.xlsx',
            },
          },
        })
      })
    })

    // ========================================================================
    // MIXED BINARY NODE TYPES
    // ========================================================================

    describe('mixed binary node types', () => {
      it('should handle canvas with image, audio, and file nodes together', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const imageNode = createImageNode('img-1', 'Photo', {
          storagePath: 'files/photo.png',
          mimeType: 'image/png',
          size: 1000,
        })
        const audioNode = createAudioNode('audio-1', 'Voiceover', {
          storagePath: 'files/voice.mp3',
          mimeType: 'audio/mpeg',
          size: 2000,
          originalFilename: 'voice.mp3',
        })
        const fileNode = createFileNode('file-1', 'Script', {
          storagePath: 'files/script.pdf',
          mimeType: 'application/pdf',
          size: 3000,
          originalFilename: 'script.pdf',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Media Project', [imageNode, audioNode, fileNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'media-project')
        expect(canvasFolder).toBeDefined()

        // Should have metadata.yaml + 3 binary files
        expect(canvasFolder!.children).toHaveLength(4)

        expect(canvasFolder!.children!.find((c) => c.name === 'photo.png')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'voiceover.mp3')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'script.pdf')).toBeDefined()

        // Verify metadata includes all nodes
        const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
        const metadata = yaml.parse(metadataFile!.data!.toString())
        expect(metadata.nodes).toHaveLength(3)
        expect(metadata.nodes.map((n: { xynode: { type: string } }) => n.xynode.type)).toEqual([
          'image',
          'audio',
          'file',
        ])
      })
    })

    // ========================================================================
    // LINK NODE CONVERSION
    // ========================================================================

    describe('link nodes', () => {
      it('should create .url.yaml files for LinkNodes', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const linkNode = createLinkNode('link-1', 'Example Site', {
          url: 'https://example.com',
          title: 'Example Domain',
          description: 'This is an example site',
          siteName: 'Example',
          displayMode: 'iframe',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [linkNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        // Link file should use .url.yaml extension
        const linkFile = canvasFolder!.children!.find((child) => child.name === 'example-site.url.yaml')
        expect(linkFile).toBeDefined()
        expect(linkFile!.type).toBe('file')

        // Verify YAML content
        const content = yaml.parse(linkFile!.data!.toString())
        expect(content.url).toBe('https://example.com')
        expect(content.title).toBe('Example Domain')
        expect(content.description).toBe('This is an example site')
        expect(content.siteName).toBe('Example')
        expect(content.displayMode).toBe('iframe')
      })

      it('should handle LinkNode with minimal data', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const linkNode = createLinkNode('link-1', 'Simple Link', {
          url: 'https://simple.com',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [linkNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        expect(canvasFolder).toBeDefined()

        const linkFile = canvasFolder!.children!.find((child) => child.name === 'simple-link.url.yaml')
        expect(linkFile).toBeDefined()

        // Verify YAML content defaults display mode for explicit file contract
        const content = yaml.parse(linkFile!.data!.toString())
        expect(content.url).toBe('https://simple.com')
        expect(content.displayMode).toBe('preview')
        expect(content.title).toBeUndefined()
        expect(content.description).toBeUndefined()
      })

      it('should include link node in metadata.yaml', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const linkNode = createLinkNode('link-1', 'My Link', {
          url: 'https://example.com',
          loadingStatus: 'loaded',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Test Canvas', [linkNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'test-canvas')
        const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')

        const metadata = yaml.parse(metadataFile!.data!.toString())
        expect(metadata.nodes).toHaveLength(1)
        expect(metadata.nodes[0]).toMatchObject({
          id: 'link-1',
          name: 'My Link',
          xynode: {
            id: 'link-1',
            type: 'link',
            data: {
              url: 'https://example.com',
              loadingStatus: 'loaded',
            },
          },
        })
      })

      it('should handle mixed text, binary, and link nodes', async () => {
        const { proxy, yDoc, dispose } = createTestWorkspace()
        disposeCallbacks.push(dispose)

        const textNode = await createBlockNoteNode('node-1', 'Notes', yDoc, '# My Notes\n\nSome content.')
        const imageNode = createImageNode('img-1', 'Photo', {
          storagePath: 'files/photo.png',
          mimeType: 'image/png',
          size: 1000,
        })
        const linkNode = createLinkNode('link-1', 'Reference', {
          url: 'https://docs.example.com',
          title: 'Documentation',
        })

        proxy.root.items = [createCanvas('canvas-1', 'Mixed Canvas', [textNode, imageNode, linkNode])]

        const result = await workspaceToFilesystem(proxy, yDoc)
        const canvasFolder = result.children!.find((c) => c.name === 'mixed-canvas')
        expect(canvasFolder).toBeDefined()

        // Should have metadata.yaml + .md + .png + .url.yaml
        expect(canvasFolder!.children).toHaveLength(4)

        expect(canvasFolder!.children!.find((c) => c.name === 'notes.md')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'photo.png')).toBeDefined()
        expect(canvasFolder!.children!.find((c) => c.name === 'reference.url.yaml')).toBeDefined()

        // Verify metadata includes all nodes
        const metadataFile = canvasFolder!.children!.find((child) => child.name === 'metadata.yaml')
        const metadata = yaml.parse(metadataFile!.data!.toString())
        expect(metadata.nodes).toHaveLength(3)
        expect(metadata.nodes.map((n: { xynode: { type: string } }) => n.xynode.type)).toEqual([
          'blockNote',
          'image',
          'link',
        ])
      })
    })
  })
})
