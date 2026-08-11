import type { CanvasItem, NodeItem } from 'shared'
import * as Y from 'yjs'
import { createNoteDoc, deleteNoteDoc, getNoteDoc, isNoteNodeType } from '@/lib/workspaceNoteDoc'
import { WORKSPACE_NOTE_COMMAND_ORIGIN } from '@/lib/workspaceUndo'

export function isTextNoteNode(node: NodeItem): boolean {
  return isNoteNodeType(node.xynode.type)
}

export function createNoteDocForNode(rootDoc: Y.Doc, nodeId: string, nodeType: NodeItem['xynode']['type']): void {
  if (!isNoteNodeType(nodeType)) {
    return
  }

  rootDoc.transact(() => {
    createNoteDoc(rootDoc, nodeId, nodeType)
  }, WORKSPACE_NOTE_COMMAND_ORIGIN)
}

export function deleteNoteDocForNode(rootDoc: Y.Doc, node: NodeItem): void {
  if (!isTextNoteNode(node)) {
    return
  }

  rootDoc.transact(() => {
    deleteNoteDoc(rootDoc, node.id)
  }, WORKSPACE_NOTE_COMMAND_ORIGIN)
}

function visitTextNoteNodesInCanvas(
  rootDoc: Y.Doc,
  canvas: CanvasItem,
  visit: (node: NodeItem, noteDoc: Y.Doc | null) => void
): void {
  for (const item of canvas.items) {
    if (item.kind === 'canvas') {
      visitTextNoteNodesInCanvas(rootDoc, item, visit)
      continue
    }

    if (isTextNoteNode(item)) {
      visit(item, getNoteDoc(rootDoc, item.id) ?? null)
    }
  }
}

function deleteNoteDocsForCanvasInner(rootDoc: Y.Doc, canvas: CanvasItem): void {
  visitTextNoteNodesInCanvas(rootDoc, canvas, (node) => {
    deleteNoteDoc(rootDoc, node.id)
  })
}

function rememberDeletedNoteDocsForCanvasInner(
  rootDoc: Y.Doc,
  canvas: CanvasItem,
  remember: (noteId: string, noteDoc: Y.Doc) => void
): void {
  visitTextNoteNodesInCanvas(rootDoc, canvas, (node, noteDoc) => {
    if (noteDoc) {
      remember(node.id, noteDoc)
    }
  })
}

export function deleteNoteDocsForCanvas(rootDoc: Y.Doc, canvas: CanvasItem): void {
  rootDoc.transact(() => {
    deleteNoteDocsForCanvasInner(rootDoc, canvas)
  }, WORKSPACE_NOTE_COMMAND_ORIGIN)
}

export function deleteNoteDocsForRemovedItems(rootDoc: Y.Doc, removedItems: Iterable<NodeItem | CanvasItem>): void {
  rootDoc.transact(() => {
    for (const item of removedItems) {
      if (item.kind === 'canvas') {
        deleteNoteDocsForCanvasInner(rootDoc, item)
        continue
      }

      if (isTextNoteNode(item)) {
        deleteNoteDoc(rootDoc, item.id)
      }
    }
  }, WORKSPACE_NOTE_COMMAND_ORIGIN)
}

export function rememberDeletedNoteDocsForRemovedItems(
  rootDoc: Y.Doc,
  removedItems: Iterable<NodeItem | CanvasItem>,
  remember: (noteId: string, noteDoc: Y.Doc) => void
): void {
  for (const item of removedItems) {
    if (item.kind === 'canvas') {
      rememberDeletedNoteDocsForCanvasInner(rootDoc, item, remember)
      continue
    }

    if (!isTextNoteNode(item)) {
      continue
    }

    const noteDoc = getNoteDoc(rootDoc, item.id)
    if (noteDoc) {
      remember(item.id, noteDoc)
    }
  }
}
