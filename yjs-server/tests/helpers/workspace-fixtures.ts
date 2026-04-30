import * as Y from 'yjs'
import type { WorkspaceBootstrapPayload } from 'shared'
import { createNoteDoc } from 'shared/note-doc'
import { ContentConverter } from 'shared/server'
import type { CanvasItem, NodeItem } from 'shared'

export type BootstrapPayload = WorkspaceBootstrapPayload

function createDefaultRootState(): CanvasItem {
  return {
    id: 'root',
    name: '',
    kind: 'canvas',
    xynode: {
      id: 'root',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items: [],
  }
}

export function createRootDoc(noteIds: string[] = [], rootState: unknown = createDefaultRootState()): Y.Doc {
  const doc = new Y.Doc()
  doc.getMap('state').set('root', rootState)
  const notes = doc.getMap<Y.Doc>('notes')
  for (const noteId of noteIds) {
    notes.set(noteId, new Y.Doc({ guid: noteId }))
  }
  return doc
}

export function setBlockNoteText(noteDoc: Y.Doc, text: string): void {
  const fragment = noteDoc.getXmlFragment('content')
  const existingChildren = fragment.toArray()
  if (existingChildren.length > 0) {
    fragment.delete(0, existingChildren.length)
  }

  const paragraph = new Y.XmlElement('paragraph')
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  paragraph.insert(0, [textNode])
  fragment.insert(0, [paragraph])
}

export function createBlockNoteDoc(noteId: string, text: string): Y.Doc {
  const noteDoc = createNoteDoc(noteId, 'blockNote')
  setBlockNoteText(noteDoc, text)
  return noteDoc
}

export function readBlockNoteXml(noteDoc: Y.Doc): string {
  return noteDoc.getXmlFragment('content').toString()
}

export function applyWorkspaceBootstrap(rootDoc: Y.Doc, payload: BootstrapPayload): void {
  for (const docPayload of payload.docs) {
    if (docPayload.kind === 'root') {
      Y.applyUpdateV2(rootDoc, docPayload.update)
      continue
    }

    const noteDoc = rootDoc.getMap<Y.Doc>('notes').get(docPayload.docId)
    if (!noteDoc) {
      throw new Error(`Missing attached note doc ${docPayload.docId}`)
    }

    Y.applyUpdateV2(noteDoc, docPayload.update)
  }
}

export function applyNoteBootstrap(noteDoc: Y.Doc, noteId: string, payload: BootstrapPayload): void {
  if (payload.docs.length !== 1) {
    throw new Error(`Expected one bootstrap doc for note ${noteId}`)
  }

  const [docPayload] = payload.docs
  if (docPayload.kind !== 'note' || docPayload.docId !== noteId) {
    throw new Error(`Expected note bootstrap for ${noteId}`)
  }

  Y.applyUpdateV2(noteDoc, docPayload.update)
}

export function createCanvas(id: string, name: string, items: Array<NodeItem | CanvasItem>): CanvasItem {
  return {
    id,
    name,
    kind: 'canvas',
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

export function createBlockNoteNode(id: string, name: string): NodeItem {
  return {
    id,
    name,
    kind: 'node',
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 100, y: 100 },
      data: {},
    },
  }
}

export function createPlainNoteNode(id: string, name: string): NodeItem {
  return {
    id,
    name,
    kind: 'node',
    xynode: {
      id,
      type: 'plainNote',
      position: { x: 100, y: 100 },
      data: {},
    } as unknown as NodeItem['xynode'],
  }
}

export async function createLegacyDocumentBytes(
  root: CanvasItem,
  options: {
    blockNotes?: Record<string, string>
    plainNotes?: Record<string, string>
  } = {}
): Promise<Uint8Array> {
  const yDoc = new Y.Doc()
  const converter = new ContentConverter()

  try {
    yDoc.getMap('state').set('root', root)

    for (const [noteId, markdown] of Object.entries(options.blockNotes ?? {})) {
      yDoc.getMap<Y.XmlFragment>('editors').set(noteId, await converter.createFragmentFromMarkdown(markdown))
    }

    for (const [noteId, content] of Object.entries(options.plainNotes ?? {})) {
      yDoc.getMap<string>('plainNoteContents').set(noteId, content)
    }

    return Y.encodeStateAsUpdateV2(yDoc)
  } finally {
    yDoc.destroy()
  }
}
