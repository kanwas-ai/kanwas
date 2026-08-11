import { useCallback } from 'react'
import type { CanvasItem, NodeItem, GroupDef } from 'shared'
import { COLLAPSED_NODE_LAYOUT, GROUP_LAYOUT } from 'shared/constants'
import { computeGroupGrid } from './groupLayout'
import { collapseNode, removeNodesFromGroups, COLLAPSIBLE_TYPES } from './groupUtils'

/**
 * Hook providing group creation for selected canvas nodes.
 */
export function useCreateGroup({
  mutableCanvas,
  selectedNodeIds,
  requestNodeSummary,
}: {
  mutableCanvas: CanvasItem
  selectedNodeIds: string[]
  requestNodeSummary: (node: NodeItem) => void
}) {
  const createGroup = useCallback(() => {
    if (selectedNodeIds.length < 2) return

    // Get selected items that are collapsible nodes
    const selectedItems = mutableCanvas.items.filter(
      (i): i is NodeItem => i.kind === 'node' && selectedNodeIds.includes(i.id) && COLLAPSIBLE_TYPES.has(i.xynode.type)
    )
    if (selectedItems.length < 2) return

    // Sort by position: top-to-bottom, then left-to-right
    const sorted = [...selectedItems].sort((a, b) => {
      const dy = a.xynode.position.y - b.xynode.position.y
      if (Math.abs(dy) > 50) return dy
      return a.xynode.position.x - b.xynode.position.x
    })

    // Compute group position: top-left of bounding box
    let minX = Infinity
    let minY = Infinity
    for (const item of sorted) {
      minX = Math.min(minX, item.xynode.position.x)
      minY = Math.min(minY, item.xynode.position.y)
    }

    // Collapse all selected nodes that aren't already collapsed
    for (const item of sorted) {
      collapseNode(item)
      requestNodeSummary(item)
    }

    // Also check if any selected node is already in another group — remove it first
    removeNodesFromGroups(mutableCanvas, selectedNodeIds)

    const group: GroupDef = {
      id: crypto.randomUUID(),
      name: 'Group',
      color: '#22C55E',
      position: { x: minX, y: minY },
      memberIds: sorted.map((i) => i.id),
      columns: GROUP_LAYOUT.COLUMNS,
    }

    if (!mutableCanvas.groups) {
      mutableCanvas.groups = []
    }
    mutableCanvas.groups.push(group)

    // Write grid positions and collapsed dimensions so they persist correctly
    const grid = computeGroupGrid(sorted.length, group.columns)
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]
      if (item.xynode.measured) {
        item.xynode.measured = {
          width: COLLAPSED_NODE_LAYOUT.WIDTH,
          height: COLLAPSED_NODE_LAYOUT.HEIGHT,
        }
      }
      if (grid.cellPositions[i]) {
        item.xynode.position = {
          x: group.position.x + grid.cellPositions[i].x,
          y: group.position.y + grid.cellPositions[i].y,
        }
      }
    }
  }, [mutableCanvas, requestNodeSummary, selectedNodeIds])

  return createGroup
}
