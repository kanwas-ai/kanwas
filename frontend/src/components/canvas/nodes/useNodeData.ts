import { useCallback } from 'react'
import type { NodeFontFamily } from 'shared'
import { findTargetCanvas } from 'shared/constants'
import { useWorkspace } from '@/providers/workspace/WorkspaceContext'

/**
 * Returns a getter for the mutable Valtio node data of a specific node.
 * The returned data object can be mutated directly (Valtio syncs to Yjs).
 */
export function useNodeData<T>(id: string, nodeType: string): () => T | null {
  const { store, activeCanvasId } = useWorkspace()

  return useCallback((): T | null => {
    const canvas = findTargetCanvas(store.root, activeCanvasId ?? undefined)
    if (!canvas) return null
    const nodeItem = canvas.items.find((i) => i.kind === 'node' && i.id === id)
    if (!nodeItem || nodeItem.xynode.type !== nodeType) return null
    return nodeItem.xynode.data as T
  }, [store, activeCanvasId, id, nodeType])
}

/**
 * Returns a callback that sets `fontFamily` on ALL nodes of the given type
 * on the current canvas. Used so changing font on one text/sticky applies globally.
 */
export function useFontChangeAll(nodeType: string): (font: NodeFontFamily) => void {
  const { store, activeCanvasId } = useWorkspace()

  return useCallback(
    (font: NodeFontFamily) => {
      const canvas = findTargetCanvas(store.root, activeCanvasId ?? undefined)
      if (!canvas) return
      for (const item of canvas.items) {
        if (item.kind === 'node' && item.xynode.type === nodeType) {
          ;(item.xynode.data as Record<string, unknown>).fontFamily = font
        }
      }
    },
    [store, activeCanvasId, nodeType]
  )
}
