import { useCallback, useState } from 'react'
import type { NodeChange } from '@xyflow/react'
import type { CanvasItem } from 'shared'
import type * as Y from 'yjs'
import { deleteNoteDocsForRemovedItems, rememberDeletedNoteDocsForRemovedItems } from '@/lib/workspaceNoteLifecycle'
import { findCanonicalKanwasNodeId } from '@/lib/workspaceUtils'
import type { WorkspaceUndoController } from '@/lib/workspaceUndo'
import { deleteCanvasItemsFromCanvas, getDeletableCanvasItems } from './deleteCanvasItems'

interface UseCanvasDeletionOptions {
  mutableCanvas: CanvasItem
  root: CanvasItem | null
  yDoc: Y.Doc
  workspaceUndoController: WorkspaceUndoController
}

export function useCanvasDeletion({ mutableCanvas, root, yDoc, workspaceUndoController }: UseCanvasDeletionOptions) {
  const [pendingDeleteChanges, setPendingDeleteChanges] = useState<NodeChange[] | null>(null)

  const queueDeleteConfirmation = useCallback((changes: NodeChange[]) => {
    if (changes.length > 0) {
      setPendingDeleteChanges(changes)
    }
  }, [])

  const confirmDelete = useCallback(() => {
    if (!pendingDeleteChanges) {
      return
    }

    const canonicalKanwasNodeId = root ? findCanonicalKanwasNodeId(root) : null
    const protectedNodeIds = new Set(canonicalKanwasNodeId ? [canonicalKanwasNodeId] : [])
    const removedIds = pendingDeleteChanges.filter((change) => change.type === 'remove').map((change) => change.id)
    const removedItems = getDeletableCanvasItems(mutableCanvas, removedIds, protectedNodeIds)

    workspaceUndoController.runCommand(() => {
      rememberDeletedNoteDocsForRemovedItems(yDoc, removedItems, (noteId, noteDoc) => {
        workspaceUndoController.rememberDeletedNoteDoc(noteId, noteDoc)
      })
      deleteNoteDocsForRemovedItems(yDoc, removedItems)
      deleteCanvasItemsFromCanvas(mutableCanvas, removedIds, protectedNodeIds)
    })

    setPendingDeleteChanges(null)
  }, [mutableCanvas, pendingDeleteChanges, root, workspaceUndoController, yDoc])

  const cancelDelete = useCallback(() => {
    setPendingDeleteChanges(null)
  }, [])

  return {
    pendingDeleteChanges,
    queueDeleteConfirmation,
    confirmDelete,
    cancelDelete,
  }
}
