import { useCallback, useRef, useState } from 'react'
import type { Node as XYNode, OnNodeDrag } from '@xyflow/react'
import type { CanvasItem, GroupDef, NodeItem } from 'shared'
import { COLLAPSED_NODE_LAYOUT, NODE_LAYOUT } from 'shared/constants'
import { LAYOUT_GAP_X } from '../canvasLayout'
import { computeGroupGrid, computeGroupRect, computeCellIndex, isInsideGroupBounds } from './groupLayout'
import { collapseNode, COLLAPSIBLE_TYPES, removeNodesFromGroups } from './groupUtils'

interface UseGroupDragOptions {
  mutableCanvas: CanvasItem
  /** Snapshot of canvas.groups (read-only) */
  canvasGroups: GroupDef[] | undefined
  groupedIdsRef: React.RefObject<Set<string>>
  nodeToGroupRef: React.RefObject<Map<string, GroupDef>>
  /** Base layout handlers from useCanvasLayout */
  onNodeDragStart: OnNodeDrag<XYNode>
  onNodeDrag: OnNodeDrag<XYNode>
  onNodeDragStop: OnNodeDrag<XYNode>
  prepareNodeExpand: (nodeId: string) => void
  clearSwapIndicator: () => void
  requestNodeSummary: (node: NodeItem) => void
}

export function useGroupDrag({
  mutableCanvas,
  canvasGroups,
  groupedIdsRef,
  nodeToGroupRef,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  prepareNodeExpand,
  clearSwapIndicator,
  requestNodeSummary,
}: UseGroupDragOptions) {
  // Track which node IDs are currently being dragged (read inside useMemo via ref)
  const draggingNodeIdsRef = useRef<Set<string>>(new Set())
  // Visual indicator: which group is a drop target for joining
  const [joinTargetGroupId, setJoinTargetGroupId] = useState<string | null>(null)
  const [isMultiDragActive, setIsMultiDragActive] = useState(false)

  // When dragging a grouped member, track its group ID for reindex
  const memberDragGroupId = useRef<string | null>(null)

  // Ref for canvasGroups to avoid stale closures in onNodeDragWithGroups
  const canvasGroupsRef = useRef(canvasGroups)
  canvasGroupsRef.current = canvasGroups

  // ── Drag Start ──────────────────────────────────────────────────────────
  const onNodeDragStartWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      draggingNodeIdsRef.current = new Set(nodes.map((n) => n.id))
      memberDragGroupId.current = null
      setJoinTargetGroupId(null)

      // Detect if we're dragging a single grouped member node
      // Multi-selection drag skips this — treated as regular drag so nodes can leave together
      const memberGroupSnapshot = nodeToGroupRef.current.get(node.id)
      if (memberGroupSnapshot && nodes.length === 1) {
        memberDragGroupId.current = memberGroupSnapshot.id
        return
      }

      setIsMultiDragActive(nodes.length > 1)
      onNodeDragStart(event, node, nodes)
    },
    [onNodeDragStart, nodeToGroupRef]
  )

  // ── Drag (live) ─────────────────────────────────────────────────────────
  const onNodeDragWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      // ── Grouped member drag: real-time reindex ──
      if (memberDragGroupId.current) {
        const group = mutableCanvas.groups?.find((g) => g.id === memberDragGroupId.current) ?? null
        if (!group) return

        const members = group.memberIds ?? []
        const currentIdx = members.indexOf(node.id)
        if (currentIdx === -1) return

        const targetIdx = computeCellIndex(
          node.position.x,
          node.position.y,
          group.position.x,
          group.position.y,
          members.length,
          group.columns
        )

        if (targetIdx !== currentIdx) {
          const newIds = [...members]
          newIds.splice(currentIdx, 1)
          newIds.splice(targetIdx, 0, node.id)
          group.memberIds = newIds
        }
        return
      }

      // ── If any dragged node is grouped, skip swap detection ──
      if (nodes.some((n) => groupedIdsRef.current.has(n.id))) {
        clearSwapIndicator()
        return
      }

      // ── Non-grouped node: detect if hovering over a group (join indicator) ──
      if (!groupedIdsRef.current.has(node.id)) {
        // Only show join indicator for collapsible node types
        const draggedItem = mutableCanvas.items.find((i) => i.id === node.id)
        const canJoin = draggedItem?.kind === 'node' && COLLAPSIBLE_TYPES.has(draggedItem.xynode.type)

        let foundTarget: string | null = null
        if (canJoin) {
          const groups = canvasGroupsRef.current ?? []
          for (const group of groups) {
            if (isInsideGroupBounds(node.position.x, node.position.y, group)) {
              foundTarget = group.id
              break
            }
          }
        }
        setJoinTargetGroupId(foundTarget)
        if (foundTarget) {
          clearSwapIndicator()
          return // Inside a group — skip normal drag (swap detection)
        }
      }

      onNodeDrag(event, node, nodes)
    },
    [onNodeDrag, mutableCanvas, groupedIdsRef, clearSwapIndicator]
  )

  // ── Drag Stop ───────────────────────────────────────────────────────────
  const onNodeDragStopWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      draggingNodeIdsRef.current = new Set()
      setJoinTargetGroupId(null)

      // ── Grouped member drag stop: leave or snap back ──
      if (memberDragGroupId.current) {
        const group = mutableCanvas.groups?.find((g) => g.id === memberDragGroupId.current) ?? null
        memberDragGroupId.current = null

        if (group) {
          handleMemberDragStop(group, node, mutableCanvas, prepareNodeExpand)
        }
        return
      }

      // ── Multi-selection exit: remove dragged grouped members from their groups ──
      if (nodes.length > 1) {
        const exitedNodes: XYNode[] = []
        for (const n of nodes) {
          const group = mutableCanvas.groups?.find((g) => (g.memberIds ?? []).includes(n.id))
          if (!group) continue
          const groupRect = computeGroupRect(group)
          const bounds = getCollapsedNodeBounds(n)
          const nodeRight = n.position.x + bounds.width
          const nodeBottom = n.position.y + bounds.height
          const hasExited =
            n.position.x < groupRect.x ||
            nodeRight > groupRect.x + groupRect.width ||
            n.position.y < groupRect.y ||
            nodeBottom > groupRect.y + groupRect.height
          if (hasExited) {
            exitedNodes.push(n)
            const item = mutableCanvas.items.find((i) => i.id === n.id)
            if (item && item.kind === 'node' && item.collapsed) {
              prepareNodeExpand(n.id)
              item.collapsed = false
            }
          }
        }
        if (exitedNodes.length > 0) {
          removeNodesFromGroups(
            mutableCanvas,
            exitedNodes.map((n) => n.id)
          )

          // Place exited nodes side by side from the drop position with gaps
          if (exitedNodes.length > 1) {
            const sorted = [...exitedNodes].sort((a, b) => a.position.x - b.position.x)
            const startX = sorted[0].position.x
            const startY = sorted[0].position.y
            let cursorX = startX
            for (const n of sorted) {
              const item = mutableCanvas.items.find((i) => i.id === n.id)
              if (item) {
                item.xynode.position = { x: cursorX, y: startY }
                cursorX += NODE_LAYOUT.WIDTH + LAYOUT_GAP_X
              }
            }
          }

          clearSwapIndicator()
          setIsMultiDragActive(false)
          return
        }
      }

      // ── Spatial join: if ANY dragged node overlaps a group, join ALL collapsible nodes ──
      let targetGroup: GroupDef | null = null
      const groups = mutableCanvas.groups ?? []
      for (const n of nodes) {
        if (groupedIdsRef.current.has(n.id)) continue
        for (const group of groups) {
          if (isInsideGroupBounds(n.position.x, n.position.y, group)) {
            targetGroup = group
            break
          }
        }
        if (targetGroup) break
      }

      if (targetGroup) {
        clearSwapIndicator()
        for (const n of nodes) {
          if (groupedIdsRef.current.has(n.id)) continue
          const item = mutableCanvas.items.find((i) => i.id === n.id)
          if (!item || item.kind !== 'node') continue
          if (!COLLAPSIBLE_TYPES.has(item.xynode.type)) continue
          collapseAndJoinGroup(item, targetGroup, requestNodeSummary)
        }
        setIsMultiDragActive(false)
        return
      }

      onNodeDragStop(event, node, nodes)
      setIsMultiDragActive(false)
    },
    [onNodeDragStop, mutableCanvas, prepareNodeExpand, groupedIdsRef, clearSwapIndicator, requestNodeSummary]
  )

  return {
    draggingNodeIdsRef,
    joinTargetGroupId,
    isMultiDragActive,
    setIsMultiDragActive,
    onNodeDragStart: onNodeDragStartWrapped,
    onNodeDrag: onNodeDragWrapped,
    onNodeDragStop: onNodeDragStopWrapped,
  }
}

function getCollapsedNodeBounds(node: XYNode): { width: number; height: number } {
  const width = node.measured?.width ?? COLLAPSED_NODE_LAYOUT.WIDTH
  const height = node.measured?.height ?? COLLAPSED_NODE_LAYOUT.HEIGHT
  return { width, height }
}

// ── Pure helper: handle member drag stop (exit or snap back) ──────────────

function handleMemberDragStop(
  group: GroupDef,
  node: XYNode,
  mutableCanvas: CanvasItem,
  prepareNodeExpand: (nodeId: string) => void
) {
  const groupRect = computeGroupRect(group)
  const bounds = getCollapsedNodeBounds(node)
  const nodeRight = node.position.x + bounds.width
  const nodeBottom = node.position.y + bounds.height

  const hasExited =
    node.position.x < groupRect.x ||
    nodeRight > groupRect.x + groupRect.width ||
    node.position.y < groupRect.y ||
    nodeBottom > groupRect.y + groupRect.height

  if (hasExited) {
    // Exited group boundary → leave and expand, stay where dropped
    group.memberIds = (group.memberIds ?? []).filter((mid) => mid !== node.id)

    const groupDeleted = group.memberIds.length === 0
    if (groupDeleted && mutableCanvas.groups) {
      mutableCanvas.groups = mutableCanvas.groups.filter((g) => g.id !== group.id)
    }

    const item = mutableCanvas.items.find((i) => i.id === node.id)
    if (item && item.kind === 'node') {
      if (item.collapsed) {
        prepareNodeExpand(node.id)
        item.collapsed = false
      }
    }
  } else {
    // Still inside → snap to final grid cell
    const members = group.memberIds ?? []
    const grid = computeGroupGrid(members.length, group.columns)
    const memberIdx = members.indexOf(node.id)
    if (memberIdx >= 0 && grid.cellPositions[memberIdx]) {
      const cellPos = grid.cellPositions[memberIdx]
      const item = mutableCanvas.items.find((i) => i.id === node.id)
      if (item) {
        item.xynode.position = {
          x: group.position.x + cellPos.x,
          y: group.position.y + cellPos.y,
        }
      }
    }
  }
}

// ── Pure helper: collapse a node and add it to a group ───────────────────

function collapseAndJoinGroup(item: NodeItem, group: GroupDef, requestNodeSummary: (node: NodeItem) => void) {
  // Defense-in-depth: callers already filter, but guard here too
  if (!COLLAPSIBLE_TYPES.has(item.xynode.type)) return

  collapseNode(item)
  requestNodeSummary(item)
  group.memberIds = [...(group.memberIds ?? []), item.id]

  // Write grid position so it persists correctly
  const members = group.memberIds
  const grid = computeGroupGrid(members.length, group.columns)
  const memberIdx = members.indexOf(item.id)
  if (memberIdx >= 0 && grid.cellPositions[memberIdx]) {
    const cellPos = grid.cellPositions[memberIdx]
    item.xynode.position = {
      x: group.position.x + cellPos.x,
      y: group.position.y + cellPos.y,
    }
  }
}
