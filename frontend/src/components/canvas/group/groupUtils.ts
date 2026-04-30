import type { CanvasItem, NodeItem } from 'shared'

/** Node types that can be collapsed and grouped */
export const COLLAPSIBLE_TYPES = new Set(['blockNote'])

/**
 * Collapse a node.
 * No-op if already collapsed.
 */
export function collapseNode(item: NodeItem) {
  if (item.collapsed === true) return
  item.collapsed = true
}

/**
 * Remove a single node from whichever group contains it.
 * Cleans up empty groups automatically.
 * Returns the modified group (node already removed from memberIds), or null.
 */
export function removeNodeFromGroup(mutableCanvas: CanvasItem, nodeId: string) {
  const groups = mutableCanvas.groups
  if (!groups) return null

  const groupIdx = groups.findIndex((g) => (g.memberIds ?? []).includes(nodeId))
  if (groupIdx === -1) return null

  const group = groups[groupIdx]
  group.memberIds = (group.memberIds ?? []).filter((id) => id !== nodeId)

  if (group.memberIds.length === 0) {
    mutableCanvas.groups = groups.filter((_, i) => i !== groupIdx)
  }

  return group
}

/**
 * Remove multiple nodes from all groups. Cleans up empty groups.
 */
export function removeNodesFromGroups(mutableCanvas: CanvasItem, nodeIds: string[]) {
  if (!mutableCanvas.groups) return
  const idSet = new Set(nodeIds)
  for (const g of mutableCanvas.groups) {
    g.memberIds = (g.memberIds ?? []).filter((mid) => !idSet.has(mid))
  }
  mutableCanvas.groups = mutableCanvas.groups.filter((g) => (g.memberIds ?? []).length > 0)
}
