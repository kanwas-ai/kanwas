import { useCallback, useRef, useState, useEffect } from 'react'
import type * as Y from 'yjs'
import type { CanvasItem, NodeItem } from 'shared'
import { findCanvas, findItemWithParent, removeItem, isDescendant, SPACER_ID, DOCUMENT_SPACER_ID } from './tree-utils'
import { isReservedTopLevelCanvas } from '@/lib/workspaceUtils'

/**
 * Measures container height using ResizeObserver
 */
export function useContainerHeight(initialHeight = 400) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(initialHeight)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    updateHeight()

    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  return { containerRef, containerHeight }
}

interface UseDropTargetHighlightOptions {
  onNotify?: () => void
}

/**
 * Manages drop target parent highlighting state
 * - Uses ref during drag to avoid re-renders on every mouse move
 * - Debounces notifications to reduce re-renders
 * - Cleans up on mouseup (handles cancelled drags)
 */
export function useDropTargetHighlight({ onNotify }: UseDropTargetHighlightOptions = {}) {
  const dropTargetParentIdRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const onNotifyRef = useRef(onNotify)
  onNotifyRef.current = onNotify

  const updateDropTarget = useCallback((targetParentId: string | null) => {
    // Always update ref immediately for accurate tracking
    const changed = dropTargetParentIdRef.current !== targetParentId
    dropTargetParentIdRef.current = targetParentId

    // Debounce notifications to reduce re-renders during drag
    if (changed) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        onNotifyRef.current?.()
      })
    }
  }, [])

  const clearDropTarget = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const changed = dropTargetParentIdRef.current !== null
    dropTargetParentIdRef.current = null
    if (changed) {
      onNotifyRef.current?.()
    }
  }, [])

  // Clear on mouseup (handles cancelled drags)
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(clearDropTarget, 50)
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [clearDropTarget])

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return { dropTargetParentIdRef, updateDropTarget, clearDropTarget }
}

interface UseTreeMoveOptions {
  root: CanvasItem | null
  yDoc: Y.Doc
}

/**
 * Convert visible tree index to actual array index.
 * React-arborist gives us indices based on visible items, but we need to
 * account for items in the actual array.
 */
function visibleToActualIndex(items: (CanvasItem | NodeItem)[], visibleIndex: number): number {
  let visibleCount = 0

  for (let actualIndex = 0; actualIndex < items.length; actualIndex++) {
    if (visibleCount === visibleIndex) {
      return actualIndex
    }

    visibleCount++
  }

  return items.length
}

/**
 * Handles tree move operations (drag-drop reorder)
 * Wraps mutations in a Yjs transaction for atomicity.
 *
 * Note: Some invalid drops are allowed through disableDrop (to work around
 * react-arborist bug #168) and are silently ignored here.
 */
export function useTreeMove({ root, yDoc }: UseTreeMoveOptions) {
  return useCallback(
    (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      const { dragIds, parentId, index } = args

      if (!root) return

      // Wrap all mutations in a single Yjs transaction for atomicity
      yDoc.transact(() => {
        // Normalize parentId - treat internal root as null (root level)
        const normalizedParentId = !parentId || parentId === '__REACT_ARBORIST_INTERNAL_ROOT__' ? null : parentId

        for (const dragId of dragIds) {
          // Skip spacer - it's not a real item
          if (dragId === SPACER_ID) {
            continue
          }

          const currentLocation = findItemWithParent(root, dragId)

          // Prevent dropping a canvas into its own descendant
          if (normalizedParentId && isDescendant(root, dragId, normalizedParentId)) {
            continue
          }

          // Find target parent canvas (null means root)
          const targetParent = normalizedParentId ? findCanvas(root, normalizedParentId) : root

          // Skip invalid targets (e.g., trying to drop INTO a node instead of next to it)
          // This can happen due to react-arborist's cursor position detection
          if (!targetParent || targetParent.kind !== 'canvas') {
            continue
          }

          // Convert visible index to actual array index.
          let insertIndex = visibleToActualIndex(targetParent.items, index)

          // Find current location for same-parent adjustment
          const currentParent = currentLocation?.parent

          // Adjust for same-parent moves (removing shifts indices)
          if (currentParent && currentParent.id === targetParent.id) {
            const currentIndex = targetParent.items.findIndex((i: CanvasItem | NodeItem) => i.id === dragId)
            if (currentIndex !== -1 && currentIndex < insertIndex) {
              insertIndex = insertIndex - 1
            }
            // Skip if position hasn't changed
            if (currentIndex === insertIndex) {
              continue
            }
          }

          // Remove and reinsert
          const item = removeItem(root, dragId)
          if (!item) {
            continue
          }

          insertIndex = Math.min(insertIndex, targetParent.items.length)
          targetParent.items.splice(insertIndex, 0, item)
        }
      })
    },
    [root, yDoc]
  )
}

interface DisableDropArgs {
  dragNodes: { id: string; data?: { _kind?: string } }[]
  parentNode: { id: string; data?: { _kind?: string } } | null
  index: number
}

interface UseDisableDropOptions {
  onDropTargetChange: (targetParentId: string | null) => void
}

/**
 * Validates drop targets and updates highlighting.
 *
 * IMPORTANT: Due to a react-arborist bug (#168), returning true from disableDrop
 * can break same-level reordering even for unrelated drops. So we ONLY block
 * truly invalid operations (spacer drag) and let onMove handle
 * the rest. This ensures reordering always works.
 */
export function useDisableDrop({ onDropTargetChange }: UseDisableDropOptions) {
  const isRootLevel = (parentNode: DisableDropArgs['parentNode']) => {
    return !parentNode || parentNode.id === '__REACT_ARBORIST_INTERNAL_ROOT__'
  }

  return useCallback(
    (args: DisableDropArgs): boolean => {
      const { dragNodes, parentNode } = args

      // Prevent dragging the spacer
      for (const dragNode of dragNodes) {
        if (dragNode.id === SPACER_ID) {
          return true
        }
      }

      // Update drop target for highlighting
      const targetParentId = isRootLevel(parentNode) ? null : (parentNode?.id ?? null)
      onDropTargetChange(targetParentId)

      // Cannot drop into spacer
      if (parentNode?.id === SPACER_ID) {
        return true
      }

      // Allow all other drops - onMove will filter invalid ones
      // This works around react-arborist bug #168 where disableDrop
      // breaks same-level reordering
      return false
    },
    [onDropTargetChange]
  )
}

/**
 * Convert visible canvas-only index to actual array index.
 * The items array mixes canvases and nodes. When react-arborist reports
 * a drop index among visible canvas items, we need to find the actual
 * position in the mixed array.
 */
function visibleCanvasToActualIndex(items: (CanvasItem | NodeItem)[], visibleIndex: number): number {
  let visibleCount = 0

  for (let actualIndex = 0; actualIndex < items.length; actualIndex++) {
    const item = items[actualIndex]
    if (item.kind !== 'canvas') continue

    if (visibleCount === visibleIndex) {
      return actualIndex
    }
    visibleCount++
  }

  // Past all visible canvases - insert at end
  return items.length
}

/**
 * Convert visible node-only index to actual array index.
 * The items array mixes canvases and nodes. When react-arborist reports
 * a drop index among visible node items, we need to find the actual
 * position in the mixed array.
 */
function visibleNodeToActualIndex(items: (CanvasItem | NodeItem)[], visibleIndex: number): number {
  let visibleCount = 0

  for (let actualIndex = 0; actualIndex < items.length; actualIndex++) {
    const item = items[actualIndex]
    if (item.kind !== 'node') continue

    if (visibleCount === visibleIndex) {
      return actualIndex
    }
    visibleCount++
  }

  // Past all visible nodes - insert at end
  return items.length
}

interface UseCanvasTreeMoveOptions {
  root: CanvasItem | null
  yDoc: Y.Doc
}

/**
 * Handles canvas tree move operations (drag-drop reorder).
 * Only handles canvas items being moved among other canvases.
 */
export function useCanvasTreeMove({ root, yDoc }: UseCanvasTreeMoveOptions) {
  return useCallback(
    (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      const { dragIds, parentId, index } = args

      if (!root) return

      yDoc.transact(() => {
        const normalizedParentId = !parentId || parentId === '__REACT_ARBORIST_INTERNAL_ROOT__' ? null : parentId

        for (const dragId of dragIds) {
          if (dragId === SPACER_ID) continue
          const currentLocation = findItemWithParent(root, dragId)
          if (currentLocation?.item.kind === 'canvas' && isReservedTopLevelCanvas(root, currentLocation.item)) {
            continue
          }
          if (normalizedParentId && isDescendant(root, dragId, normalizedParentId)) continue

          // For canvas tree, parent is always root or another canvas
          const targetParent = normalizedParentId ? findCanvas(root, normalizedParentId) : root
          if (!targetParent || targetParent.kind !== 'canvas') continue

          let insertIndex = visibleCanvasToActualIndex(targetParent.items, index)

          // Adjust for same-parent moves
          const currentParent = currentLocation?.parent

          if (currentParent && currentParent.id === targetParent.id) {
            const currentIndex = targetParent.items.findIndex((i: CanvasItem | NodeItem) => i.id === dragId)
            if (currentIndex !== -1 && currentIndex < insertIndex) {
              insertIndex = insertIndex - 1
            }
            if (currentIndex === insertIndex) continue
          }

          const item = removeItem(root, dragId)
          if (!item) continue

          insertIndex = Math.min(insertIndex, targetParent.items.length)
          targetParent.items.splice(insertIndex, 0, item)
        }
      })
    },
    [root, yDoc]
  )
}

interface UseDocumentListMoveOptions {
  activeCanvasId: string | null
  root: CanvasItem | null
  yDoc: Y.Doc
}

/**
 * Handles document list move operations (reordering documents within a canvas).
 * Documents are flat (no nesting), so parentId is always the active canvas.
 */
export function useDocumentListMove({ activeCanvasId, root, yDoc }: UseDocumentListMoveOptions) {
  return useCallback(
    (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      const { dragIds, index } = args

      if (!root || !activeCanvasId) return

      yDoc.transact(() => {
        const canvas = findCanvas(root, activeCanvasId)
        if (!canvas) return

        for (const dragId of dragIds) {
          if (dragId === DOCUMENT_SPACER_ID) continue

          let insertIndex = visibleNodeToActualIndex(canvas.items, index)

          // Adjust for same-parent moves
          const currentIndex = canvas.items.findIndex((i: CanvasItem | NodeItem) => i.id === dragId)
          if (currentIndex !== -1 && currentIndex < insertIndex) {
            insertIndex = insertIndex - 1
          }
          if (currentIndex === insertIndex) continue

          const item = removeItem(root, dragId)
          if (!item) continue

          insertIndex = Math.min(insertIndex, canvas.items.length)
          canvas.items.splice(insertIndex, 0, item)
        }
      })
    },
    [activeCanvasId, root, yDoc]
  )
}

/**
 * Disables drop for the document list - blocks all nesting (flat list only).
 */
export function useDocumentDisableDrop({ onDropTargetChange }: UseDisableDropOptions) {
  return useCallback(
    (args: DisableDropArgs): boolean => {
      const { dragNodes, parentNode } = args

      // Prevent dragging spacer
      for (const dragNode of dragNodes) {
        if (dragNode.id === DOCUMENT_SPACER_ID) {
          return true
        }
      }

      // Block any nesting - documents are flat
      if (parentNode && parentNode.id !== '__REACT_ARBORIST_INTERNAL_ROOT__') {
        return true
      }

      onDropTargetChange(null)

      // Cannot drop into spacer
      if (parentNode?.id === DOCUMENT_SPACER_ID) {
        return true
      }

      return false
    },
    [onDropTargetChange]
  )
}
