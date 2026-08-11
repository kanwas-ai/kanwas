import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import type {
  WorkspaceDocument,
  CanvasItem,
  NodeItem,
  BlockNoteNode,
  ImageNode,
  ImageNodeData,
  AudioNode,
  AudioNodeData,
  FileNode,
  FileNodeData,
  LinkNode,
  LinkNodeData,
  Edge,
} from '../../src/types.js'
import { AUDIO_NODE_LAYOUT, FILE_NODE_LAYOUT, LINK_NODE_LAYOUT } from '../../src/constants.js'
import { ensureWorkspaceNotesMap } from '../../src/workspace/note-doc.js'
import { createWorkspaceContentStore } from '../../src/workspace/workspace-content-store.js'
import { createServerBlockNoteEditor } from '../../src/workspace/server-blocknote.js'

/**
 * Creates a test workspace with proper YJS and Valtio setup
 * IMPORTANT: Always use the proxy to manipulate data, never the Y.Doc directly
 */
export function createTestWorkspace() {
  const yDoc = new Y.Doc()
  const { bootstrap, proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  // Initialize workspace with root canvas
  bootstrap({
    root: {
      id: 'root',
      name: '',
      kind: 'canvas',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      items: [],
      edges: [],
    },
  })

  // Shared workspace tests default to the note-subdoc schema.
  ensureWorkspaceNotesMap(yDoc)

  return {
    proxy,
    yDoc,
    dispose,
    bootstrap,
  }
}

/**
 * Helper to create a CanvasItem structure
 */
export function createCanvas(
  id: string,
  name: string,
  nodes: NodeItem[] = [],
  edges: Edge[] = [],
  children: CanvasItem[] = []
): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: { id, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
    edges,
    items: [...nodes, ...children],
  }
}

/**
 * Helper to create a NodeItem with BlockNote type
 * @param id - Node ID
 * @param name - Node name
 * @param yDoc - YDoc to populate with BlockNote content
 * @param markdown - Markdown content for the note
 */
export async function createBlockNoteNode(id: string, name: string, yDoc: Y.Doc, markdown: string): Promise<NodeItem> {
  // Create editor and parse markdown
  const editor = createServerBlockNoteEditor()
  const blocks = await editor.tryParseMarkdownToBlocks(markdown)
  const fragment = editor.blocksToYXmlFragment(blocks)

  // Store the XML fragment in the note subdoc content store.
  createWorkspaceContentStore(yDoc).setBlockNoteFragment(id, fragment)

  const xynode: BlockNoteNode = {
    id,
    type: 'blockNote',
    position: { x: 0, y: 0 },
    data: {},
    measured: {
      width: 300,
      height: 200,
    },
  }

  return {
    kind: 'node',
    id,
    name,
    xynode,
  }
}

/**
 * Helper to create a NodeItem with Image type
 */
export function createImageNode(
  id: string,
  name: string,
  data: ImageNodeData,
  position: { x: number; y: number } = { x: 0, y: 0 }
): NodeItem {
  const xynode: ImageNode = {
    id,
    type: 'image',
    position,
    data,
    measured: {
      width: 200,
      height: 150,
    },
  }

  return {
    kind: 'node',
    id,
    name,
    xynode,
  }
}

/**
 * Helper to create a NodeItem with Audio type
 */
export function createAudioNode(
  id: string,
  name: string,
  data: AudioNodeData,
  position: { x: number; y: number } = { x: 0, y: 0 }
): NodeItem {
  const xynode: AudioNode = {
    id,
    type: 'audio',
    position,
    data,
    measured: AUDIO_NODE_LAYOUT.DEFAULT_MEASURED,
  }

  return {
    kind: 'node',
    id,
    name,
    xynode,
  }
}

/**
 * Helper to create a NodeItem with File type
 */
export function createFileNode(
  id: string,
  name: string,
  data: FileNodeData,
  position: { x: number; y: number } = { x: 0, y: 0 }
): NodeItem {
  const xynode: FileNode = {
    id,
    type: 'file',
    position,
    data,
    measured: FILE_NODE_LAYOUT.DEFAULT_MEASURED,
  }

  return {
    kind: 'node',
    id,
    name,
    xynode,
  }
}

/**
 * Helper to create a NodeItem with Link type
 */
export function createLinkNode(
  id: string,
  name: string,
  data: Partial<LinkNodeData> & { url: string },
  position: { x: number; y: number } = { x: 0, y: 0 }
): NodeItem {
  // Build data object without undefined values (valtio-y doesn't allow undefined)
  const nodeData: LinkNodeData = {
    url: data.url,
    loadingStatus: data.loadingStatus ?? 'pending',
  }
  if (data.title !== undefined) nodeData.title = data.title
  if (data.description !== undefined) nodeData.description = data.description
  if (data.imageStoragePath !== undefined) nodeData.imageStoragePath = data.imageStoragePath
  if (data.siteName !== undefined) nodeData.siteName = data.siteName
  if (data.favicon !== undefined) nodeData.favicon = data.favicon
  if (data.displayMode !== undefined) nodeData.displayMode = data.displayMode

  const xynode: LinkNode = {
    id,
    type: 'link',
    position,
    data: nodeData,
    measured: LINK_NODE_LAYOUT.DEFAULT_MEASURED,
  }

  return {
    kind: 'node',
    id,
    name,
    xynode,
  }
}
