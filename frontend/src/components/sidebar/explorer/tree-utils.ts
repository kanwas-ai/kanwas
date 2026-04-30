import type { CanvasItem, NodeItem } from 'shared'

/**
 * Node structure for react-arborist
 * Extends the base with metadata needed for rendering and operations
 */
export interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  // Metadata for rendering and operations
  _kind: 'canvas' | 'node' | 'spacer'
  _canvasId: string // Parent canvas ID (for nodes) or own ID (for canvases)
  _original: CanvasItem | NodeItem | null // null for spacer
}

export const SPACER_ID = '__DROP_ZONE_SPACER__'
export const DOCUMENT_SPACER_ID = '__DOCUMENT_DROP_ZONE_SPACER__'

/**
 * Transform workspace data structure to react-arborist format
 * Processes items array which contains both nodes and canvases
 * @param canvas - The canvas to transform
 * @param isRoot - Whether this is the root level (for adding spacer)
 */
export function toArboristData(canvas: CanvasItem, isRoot = true): TreeNode[] {
  const items = canvas.items.map((item): TreeNode => {
    if (item.kind === 'canvas') {
      return {
        id: item.id,
        name: item.name,
        _kind: 'canvas',
        _canvasId: item.id,
        _original: item,
        children: toArboristData(item, false),
      }
    }
    // Node item
    return {
      id: item.id,
      name: item.name,
      _kind: 'node',
      _canvasId: canvas.id,
      _original: item,
      // No children for nodes
    }
  })

  // Add spacer at root level only to extend drop zone
  if (isRoot) {
    items.push({
      id: SPACER_ID,
      name: '',
      _kind: 'spacer',
      _canvasId: 'root',
      _original: null,
    })
  }

  return items
}

/**
 * Find a canvas by ID in the tree
 */
export function findCanvas(root: CanvasItem, id: string): CanvasItem | null {
  if (root.id === id) return root

  for (const item of root.items) {
    if (item.kind === 'canvas') {
      const found = findCanvas(item, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Find an item (node or canvas) and its parent canvas
 */
export function findItemWithParent(
  root: CanvasItem,
  itemId: string
): { item: CanvasItem | NodeItem; parent: CanvasItem } | null {
  // Check root's items
  for (const item of root.items) {
    if (item.id === itemId) {
      return { item, parent: root }
    }
    if (item.kind === 'canvas') {
      const found = findItemWithParent(item, itemId)
      if (found) return found
    }
  }
  return null
}

/**
 * Remove an item from its current location in the tree
 * Returns the removed item or null if not found
 */
export function removeItem(root: CanvasItem, itemId: string): (CanvasItem | NodeItem) | null {
  const idx = root.items.findIndex((i) => i.id === itemId)
  if (idx !== -1) {
    return root.items.splice(idx, 1)[0]
  }

  for (const item of root.items) {
    if (item.kind === 'canvas') {
      const removed = removeItem(item, itemId)
      if (removed) return removed
    }
  }
  return null
}

/**
 * Check if targetId is a descendant of ancestorId
 * Used to prevent dropping a parent into its own child
 */
export function isDescendant(root: CanvasItem, ancestorId: string, targetId: string): boolean {
  const ancestor = findCanvas(root, ancestorId)
  if (!ancestor || ancestor.kind !== 'canvas') return false

  const checkDescendants = (canvas: CanvasItem): boolean => {
    for (const item of canvas.items) {
      if (item.id === targetId) return true
      if (item.kind === 'canvas' && checkDescendants(item)) return true
    }
    return false
  }

  return checkDescendants(ancestor)
}

/**
 * Calculate the insert index accounting for the current item position
 * When moving within the same parent, we need to adjust the index
 */
export function calculateInsertIndex(parent: CanvasItem, itemId: string, targetIndex: number): number {
  const currentIndex = parent.items.findIndex((i) => i.id === itemId)
  if (currentIndex === -1) {
    // Item is coming from a different parent, no adjustment needed
    return targetIndex
  }
  // If moving down in the same parent, adjust for removal
  if (currentIndex < targetIndex) {
    return targetIndex - 1
  }
  return targetIndex
}

/**
 * Transform canvas tree to show only canvas items (no nodes).
 * Used for the top CANVASES section of the split sidebar.
 */
export function toCanvasTreeData(canvas: CanvasItem): TreeNode[] {
  const items = canvas.items
    .filter((item) => item.kind === 'canvas')
    .map((item): TreeNode => {
      const canvasItem = item as CanvasItem
      return {
        id: canvasItem.id,
        name: canvasItem.name,
        _kind: 'canvas',
        _canvasId: canvasItem.id,
        _original: canvasItem,
        children: toCanvasTreeData(canvasItem),
      }
    })

  return items
}

/**
 * Returns a flat list of node items from a single canvas.
 * Used for the bottom DOCUMENTS section of the split sidebar.
 * Includes a spacer at the end for drop zone.
 */
export function toDocumentListData(canvas: CanvasItem): TreeNode[] {
  const items = canvas.items
    .filter((item) => item.kind === 'node')
    .map(
      (item): TreeNode => ({
        id: item.id,
        name: item.name,
        _kind: 'node',
        _canvasId: canvas.id,
        _original: item,
      })
    )

  items.push({
    id: DOCUMENT_SPACER_ID,
    name: '',
    _kind: 'spacer',
    _canvasId: canvas.id,
    _original: null,
  })

  return items
}
