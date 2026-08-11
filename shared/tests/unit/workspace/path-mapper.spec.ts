import { describe, it, expect, beforeEach } from 'vitest'
import { PathMapper, makeUniqueName } from '../../../src/workspace/path-mapper.js'
import { sanitizeFilename } from '../../../src/constants.js'
import type {
  WorkspaceDocument,
  CanvasItem,
  NodeItem,
  BlockNoteNode,
  TextNode,
  StickyNoteNode,
  FileNode,
  FileNodeData,
  ImageNode,
  ImageNodeData,
  AudioNode,
  AudioNodeData,
} from '../../../src/types.js'

describe('sanitizeFilename', () => {
  it('should replace invalid characters with dashes', () => {
    expect(sanitizeFilename('file<name>test')).toBe('file-name-test')
    expect(sanitizeFilename('file:name')).toBe('file-name')
    expect(sanitizeFilename('file/name')).toBe('file-name')
    expect(sanitizeFilename('file\\name')).toBe('file-name')
    expect(sanitizeFilename('file?name')).toBe('file-name')
    expect(sanitizeFilename('file*name')).toBe('file-name')
  })

  it('should replace whitespace with dashes', () => {
    expect(sanitizeFilename('file name')).toBe('file-name')
    expect(sanitizeFilename('file  name')).toBe('file-name')
    expect(sanitizeFilename('file\tname')).toBe('file-name')
  })

  it('should collapse multiple dashes', () => {
    expect(sanitizeFilename('file--name')).toBe('file-name')
    expect(sanitizeFilename('file---name')).toBe('file-name')
  })

  it('should remove leading and trailing dashes', () => {
    expect(sanitizeFilename('-filename')).toBe('filename')
    expect(sanitizeFilename('filename-')).toBe('filename')
    expect(sanitizeFilename('-filename-')).toBe('filename')
  })
})

describe('makeUniqueName', () => {
  it('should return base name when no conflicts', () => {
    const usedNames = new Set<string>()
    expect(makeUniqueName('Note', usedNames)).toBe('Note')
    expect(usedNames.has('note')).toBe(true) // lowercase stored
  })

  it('should add suffix when name conflicts', () => {
    const usedNames = new Set<string>(['note'])
    expect(makeUniqueName('Note', usedNames)).toBe('Note-2')
    expect(usedNames.has('note-2')).toBe(true)
  })

  it('should increment suffix for multiple conflicts', () => {
    const usedNames = new Set<string>(['note', 'note-2', 'note-3'])
    expect(makeUniqueName('Note', usedNames)).toBe('Note-4')
  })

  it('should handle extension parameter', () => {
    const usedNames = new Set<string>()
    expect(makeUniqueName('Note', usedNames, '.md')).toBe('Note')
    expect(usedNames.has('note.md')).toBe(true)

    // Adding another "Note" should get suffix
    expect(makeUniqueName('Note', usedNames, '.md')).toBe('Note-2')
    expect(usedNames.has('note-2.md')).toBe(true)
  })

  it('should be case-insensitive', () => {
    const usedNames = new Set<string>(['note'])
    expect(makeUniqueName('NOTE', usedNames)).toBe('NOTE-2')
    expect(makeUniqueName('note', usedNames)).toBe('note-3')
  })
})

describe('PathMapper', () => {
  let pathMapper: PathMapper

  // Helper to create test data
  const createBlockNoteNode = (id: string, name: string): NodeItem => ({
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    } as BlockNoteNode,
  })

  const createCanvas = (id: string, name: string, nodes: NodeItem[], children: CanvasItem[] = []): CanvasItem => ({
    kind: 'canvas',
    id,
    name,
    xynode: { id, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
    edges: [],
    items: [...nodes, ...children],
  })

  const createRootCanvas = (children: CanvasItem[] = [], nodes: NodeItem[] = []): CanvasItem => ({
    kind: 'canvas',
    id: 'root',
    name: '',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items: [...nodes, ...children],
  })

  const createTextNode = (id: string, name: string): NodeItem => ({
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'text',
      position: { x: 0, y: 0 },
      data: { content: 'hello' },
    } as TextNode,
  })

  const createStickyNode = (id: string, name: string): NodeItem => ({
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'stickyNote',
      position: { x: 0, y: 0 },
      data: { color: 'yellow' },
    } as StickyNoteNode,
  })

  beforeEach(() => {
    pathMapper = new PathMapper()
  })

  describe('buildFromWorkspace', () => {
    it('should build mapping from simple workspace', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'My Canvas', [
            createBlockNoteNode('node-1', 'Note 1'),
            createBlockNoteNode('node-2', 'Note 2'),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // Check node mappings (note: names are sanitized to lowercase kebab-case)
      // Nodes are sorted by ID, so node-1 comes before node-2
      expect(pathMapper.getMapping('my-canvas/note-1.md')).toEqual({
        path: 'my-canvas/note-1.md',
        nodeId: 'node-1',
        canvasId: 'canvas-1',
        originalName: 'Note 1',
        type: 'node',
      })

      expect(pathMapper.getMapping('my-canvas/note-2.md')).toEqual({
        path: 'my-canvas/note-2.md',
        nodeId: 'node-2',
        canvasId: 'canvas-1',
        originalName: 'Note 2',
        type: 'node',
      })

      // Check canvas mapping (sanitized name)
      expect(pathMapper.getPathForCanvas('canvas-1')).toBe('my-canvas')
    })

    it('should build mapping from nested canvas structure', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas(
            'canvas-parent',
            'Projects',
            [],
            [createCanvas('canvas-1', 'Design', [createBlockNoteNode('node-1', 'Wireframes')])]
          ),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getMapping('projects/design/wireframes.md')).toEqual({
        path: 'projects/design/wireframes.md',
        nodeId: 'node-1',
        canvasId: 'canvas-1',
        originalName: 'Wireframes',
        type: 'node',
      })
    })

    it('uses canonical yaml filenames for text and sticky nodes', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createTextNode('node-1', 'Callout'),
            createStickyNode('node-2', 'Retro'),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('node-1')).toBe('canvas/callout.text.yaml')
      expect(pathMapper.getPathForNode('node-2')).toBe('canvas/retro.sticky.yaml')
    })

    it('should handle empty workspace', () => {
      const workspace: WorkspaceDocument = { root: createRootCanvas() }
      pathMapper.buildFromWorkspace(workspace)

      // Root canvas is always included in mappings with empty path
      expect(pathMapper.getAllMappings()).toEqual({
        nodes: [],
        canvases: [{ canvasId: 'root', originalName: '', path: '' }],
      })
    })
  })

  describe('getMapping and getPathForNode', () => {
    beforeEach(() => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([createCanvas('canvas-1', 'Canvas', [createBlockNoteNode('node-1', 'Note')])]),
      }
      pathMapper.buildFromWorkspace(workspace)
    })

    it('should return mapping for valid path', () => {
      const mapping = pathMapper.getMapping('canvas/note.md')
      expect(mapping?.nodeId).toBe('node-1')
    })

    it('should return undefined for invalid path', () => {
      expect(pathMapper.getMapping('nonexistent.md')).toBeUndefined()
    })

    it('should return path for valid node ID', () => {
      expect(pathMapper.getPathForNode('node-1')).toBe('canvas/note.md')
    })

    it('should return undefined for invalid node ID', () => {
      expect(pathMapper.getPathForNode('nonexistent')).toBeUndefined()
    })
  })

  describe('duplicate name handling', () => {
    it('should deduplicate node names within a canvas', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createBlockNoteNode('node-a', 'Note'),
            createBlockNoteNode('node-b', 'Note'),
            createBlockNoteNode('node-c', 'Note'),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // Sorted by ID: node-a, node-b, node-c
      expect(pathMapper.getPathForNode('node-a')).toBe('canvas/note.md')
      expect(pathMapper.getPathForNode('node-b')).toBe('canvas/note-2.md')
      expect(pathMapper.getPathForNode('node-c')).toBe('canvas/note-3.md')
    })

    it('should deduplicate canvas names at same level', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([createCanvas('canvas-a', 'Canvas', []), createCanvas('canvas-b', 'Canvas', [])]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // Sorted by ID: canvas-a, canvas-b
      expect(pathMapper.getPathForCanvas('canvas-a')).toBe('canvas')
      expect(pathMapper.getPathForCanvas('canvas-b')).toBe('canvas-2')
    })

    it('should handle case-insensitive collisions', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createBlockNoteNode('node-a', 'Note'),
            createBlockNoteNode('node-b', 'NOTE'),
            createBlockNoteNode('node-c', 'note'),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // All should be unique despite case differences
      const paths = [
        pathMapper.getPathForNode('node-a'),
        pathMapper.getPathForNode('node-b'),
        pathMapper.getPathForNode('node-c'),
      ]
      const uniquePaths = new Set(paths)
      expect(uniquePaths.size).toBe(3)
    })
  })

  describe('resolveNewFile', () => {
    beforeEach(() => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'My Canvas', []),
          createCanvas('canvas-parent', 'Projects', [], [createCanvas('canvas-2', 'Design', [])]),
        ]),
      }
      pathMapper.buildFromWorkspace(workspace)
    })

    it('should resolve new file in root canvas', () => {
      // Returns raw filename - caller (FilesystemSyncer) handles sanitization
      const result = pathMapper.resolveNewFile('my-canvas/New-Note.md')
      expect(result).toEqual({
        canvasId: 'canvas-1',
        nodeName: 'New-Note.md',
      })
    })

    it('should resolve new file in nested canvas', () => {
      const result = pathMapper.resolveNewFile('projects/design/New-Note.md')
      expect(result).toEqual({
        canvasId: 'canvas-2',
        nodeName: 'New-Note.md',
      })
    })

    it('should resolve any file type (not just .md)', () => {
      // resolveNewFile now works for any file type
      const result = pathMapper.resolveNewFile('my-canvas/image.png')
      expect(result).toEqual({
        canvasId: 'canvas-1',
        nodeName: 'image.png',
      })
    })

    it('should resolve file at root level to root canvas', () => {
      // Root is a valid canvas, so files at root level can be resolved
      expect(pathMapper.resolveNewFile('file.md')).toEqual({
        canvasId: 'root',
        nodeName: 'file.md',
      })
    })
  })

  describe('resolveNewCanvas', () => {
    it('should resolve new canvas at root', () => {
      const result = pathMapper.resolveNewCanvas('New-Canvas')
      expect(result).toEqual({
        parentPath: '',
        canvasName: 'New-Canvas',
      })
    })

    it('should resolve new canvas in parent canvas', () => {
      const result = pathMapper.resolveNewCanvas('Projects/New-Canvas')
      expect(result).toEqual({
        parentPath: 'Projects',
        canvasName: 'New-Canvas',
      })
    })

    it('should resolve deeply nested canvas', () => {
      const result = pathMapper.resolveNewCanvas('Projects/Design/New-Canvas')
      expect(result).toEqual({
        parentPath: 'Projects/Design',
        canvasName: 'New-Canvas',
      })
    })
  })

  describe('addMapping and removeByPath', () => {
    it('should add and remove mappings', () => {
      pathMapper.addMapping({
        path: 'Canvas/New-Note.md',
        nodeId: 'new-node',
        canvasId: 'canvas-1',
        originalName: 'New Note',
        type: 'node',
      })

      expect(pathMapper.getMapping('Canvas/New-Note.md')?.nodeId).toBe('new-node')
      expect(pathMapper.getPathForNode('new-node')).toBe('Canvas/New-Note.md')

      pathMapper.removeByPath('Canvas/New-Note.md')

      expect(pathMapper.getMapping('Canvas/New-Note.md')).toBeUndefined()
      expect(pathMapper.getPathForNode('new-node')).toBeUndefined()
    })
  })

  describe('isCanvasPath', () => {
    it('should detect canvas paths (all directories are canvases)', () => {
      expect(pathMapper.isCanvasPath('Canvas')).toBe(true)
      expect(pathMapper.isCanvasPath('Projects')).toBe(true)
      expect(pathMapper.isCanvasPath('Projects/SubCanvas')).toBe(true)
    })

    it('should reject file paths', () => {
      expect(pathMapper.isCanvasPath('file.md')).toBe(false)
      expect(pathMapper.isCanvasPath('metadata.yaml')).toBe(false)
      expect(pathMapper.isCanvasPath('Canvas/file.md')).toBe(false)
      expect(pathMapper.isCanvasPath('Projects/Canvas/file.md')).toBe(false)
    })
  })

  describe('binary node type mapping', () => {
    // Helper to create FileNode test data
    const createFileNode = (id: string, name: string, data: FileNodeData): NodeItem => ({
      kind: 'node',
      id,
      name,
      xynode: {
        id,
        type: 'file',
        position: { x: 0, y: 0 },
        data,
        measured: { width: 200, height: 60 },
      } as FileNode,
    })

    // Helper to create ImageNode test data
    const createImageNode = (id: string, name: string, data: ImageNodeData): NodeItem => ({
      kind: 'node',
      id,
      name,
      xynode: {
        id,
        type: 'image',
        position: { x: 0, y: 0 },
        data,
        measured: { width: 200, height: 150 },
      } as ImageNode,
    })

    // Helper to create AudioNode test data
    const createAudioNode = (id: string, name: string, data: AudioNodeData): NodeItem => ({
      kind: 'node',
      id,
      name,
      xynode: {
        id,
        type: 'audio',
        position: { x: 0, y: 0 },
        data,
        measured: { width: 300, height: 80 },
      } as AudioNode,
    })

    it('should map FileNode with correct extension based on mimeType (CSV)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createFileNode('file-1', 'data', {
              storagePath: 'workspaces/123/files/abc.csv',
              mimeType: 'text/csv',
              size: 1024,
              originalFilename: 'data.csv',
              contentHash: 'abc123',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // BUG: Currently maps as 'Canvas/data.md' instead of 'Canvas/data.csv'
      expect(pathMapper.getPathForNode('file-1')).toBe('canvas/data.csv')
      expect(pathMapper.getMapping('canvas/data.csv')).toEqual({
        path: 'canvas/data.csv',
        nodeId: 'file-1',
        canvasId: 'canvas-1',
        originalName: 'data',
        type: 'node',
      })
    })

    it('should map FileNode with correct extension based on mimeType (PDF)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createFileNode('file-1', 'document', {
              storagePath: 'workspaces/123/files/abc.pdf',
              mimeType: 'application/pdf',
              size: 2048,
              originalFilename: 'document.pdf',
              contentHash: 'def456',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('file-1')).toBe('canvas/document.pdf')
    })

    it('should map ImageNode with correct extension based on mimeType (PNG)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createImageNode('image-1', 'screenshot', {
              storagePath: 'workspaces/123/files/xyz.png',
              mimeType: 'image/png',
              size: 4096,
              contentHash: 'ghi789',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('image-1')).toBe('canvas/screenshot.png')
    })

    it('should map ImageNode with correct extension based on mimeType (JPEG)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createImageNode('image-1', 'photo', {
              storagePath: 'workspaces/123/files/xyz.jpg',
              mimeType: 'image/jpeg',
              size: 8192,
              contentHash: 'jkl012',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('image-1')).toBe('canvas/photo.jpg')
    })

    it('should map AudioNode with correct extension based on mimeType (MP3)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createAudioNode('audio-1', 'recording', {
              storagePath: 'workspaces/123/files/abc.mp3',
              mimeType: 'audio/mpeg',
              size: 16384,
              originalFilename: 'recording.mp3',
              contentHash: 'mno345',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('audio-1')).toBe('canvas/recording.mp3')
    })

    it('should map AudioNode with correct extension based on mimeType (WAV)', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createAudioNode('audio-1', 'sound', {
              storagePath: 'workspaces/123/files/abc.wav',
              mimeType: 'audio/wav',
              size: 32768,
              originalFilename: 'sound.wav',
              contentHash: 'pqr678',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      expect(pathMapper.getPathForNode('audio-1')).toBe('canvas/sound.wav')
    })

    it('should handle mixed node types in same canvas', () => {
      const workspace: WorkspaceDocument = {
        root: createRootCanvas([
          createCanvas('canvas-1', 'Canvas', [
            createBlockNoteNode('note-1', 'notes'),
            createFileNode('file-1', 'data', {
              storagePath: 'workspaces/123/files/data.csv',
              mimeType: 'text/csv',
              size: 1024,
              originalFilename: 'data.csv',
              contentHash: 'abc123',
            }),
            createImageNode('image-1', 'chart', {
              storagePath: 'workspaces/123/files/chart.png',
              mimeType: 'image/png',
              size: 4096,
              contentHash: 'def456',
            }),
          ]),
        ]),
      }

      pathMapper.buildFromWorkspace(workspace)

      // Each node type should use its correct extension
      expect(pathMapper.getPathForNode('note-1')).toBe('canvas/notes.md')
      expect(pathMapper.getPathForNode('file-1')).toBe('canvas/data.csv')
      expect(pathMapper.getPathForNode('image-1')).toBe('canvas/chart.png')
    })
  })
})
