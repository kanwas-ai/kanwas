import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Node as XYNode, NodeChange } from '@xyflow/react'
import type { CanvasItem } from 'shared'
import {
  toRect,
  findSwapTarget,
  rectsOverlap,
  pushNodesOnResize,
  groupBoundingBox,
  LAYOUT_GAP_X,
  LAYOUT_GAP_Y,
  type Rect,
} from './canvasLayout'

/** Node types that move freely without layout constraints (no snap, swap, or push). */
export const FREE_MOVING_NODE_TYPES = new Set(['text', 'stickyNote'])

interface UseCanvasLayoutOptions {
  mutableCanvas: CanvasItem
  /** IDs of nodes managed by groups — excluded from layout rects */
  groupedIds?: Set<string>
  /** IDs of nodes excluded from layout */
  excludeIds?: Set<string>
}

/** Info about a pending swap shown during drag */
export interface SwapIndicator {
  targetId: string
  /** Position for the indicator label (flow coordinates) */
  x: number
  y: number
  /** Target node bounds for highlight overlay (flow coordinates) */
  targetX: number
  targetY: number
  targetWidth: number
  targetHeight: number
}

export type LayoutHeightBaselineMap = Map<string, number>

export function useCanvasLayout({ mutableCanvas, groupedIds, excludeIds }: UseCanvasLayoutOptions) {
  const [swapIndicator, setSwapIndicator] = useState<SwapIndicator | null>(null)
  const groupedIdsRef = useRef<Set<string>>(new Set())
  groupedIdsRef.current = groupedIds ?? new Set()
  const excludeIdsRef = useRef<Set<string>>(new Set())
  excludeIdsRef.current = excludeIds ?? new Set()

  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const prevHeights = useRef<Map<string, number>>(new Map())
  const isDragging = useRef(false)
  const initialItemsRef = useRef(mutableCanvas.items)
  // Tracks nodes currently expanding: nodeId → collapsed height baseline
  const expandingNodes = useRef<Map<string, number>>(new Map())

  // Seed prevHeights from persisted measured heights at canvas mount.
  // Why: ReactFlow only fires a `dimensions` change when the DOM height differs
  // from what's already in the node prop's `measured`. On reload, they match,
  // so no initial dim event fires — prevHeights stays empty and the first
  // typing growth would be skipped as "initial measurement", collapsing the
  // gap between the growing node and anything below it.
  // CanvasFlow remounts per canvas (key={activeCanvas.id}), so this useEffect
  // runs once per canvas mount — no canvasId dep needed.

  useEffect(() => {
    for (const item of initialItemsRef.current) {
      if (item.kind !== 'node') continue
      const h = item.xynode.measured?.height
      if (h === undefined) continue
      prevHeights.current.set(item.id, h)
    }
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getItemRects = useCallback((): Rect[] => {
    return mutableCanvas.items
      .filter(
        (i) =>
          !groupedIdsRef.current.has(i.id) &&
          !excludeIdsRef.current.has(i.id) &&
          !(i.kind === 'node' && FREE_MOVING_NODE_TYPES.has(i.xynode.type))
      )
      .map(toRect)
      .filter((rect): rect is Rect => rect !== null)
  }, [mutableCanvas])

  /** Check if all dragged nodes are free-moving types (no layout constraints). */
  const areFreeMoving = useCallback(
    (nodes: XYNode[]): boolean => {
      return nodes.every((n) => {
        const item = mutableCanvas.items.find((i) => i.id === n.id)
        return item?.kind === 'node' && FREE_MOVING_NODE_TYPES.has(item.xynode.type)
      })
    },
    [mutableCanvas]
  )

  /** Apply a layout position back to the node using full node coordinates. */
  const applyPositionUpdate = useCallback(
    (id: string, x: number, y: number) => {
      const item = mutableCanvas.items.find((i) => i.id === id)
      if (item) {
        item.xynode.position.x = x
        item.xynode.position.y = y
      }
    },
    [mutableCanvas]
  )

  const getStoredLayoutHeight = useCallback(
    (id: string): number | null => {
      const item = mutableCanvas.items.find((candidate) => candidate.id === id)
      if (!item) {
        return null
      }

      const storedHeight = item.xynode.measured?.height
      if (typeof storedHeight !== 'number' || storedHeight <= 0) {
        return null
      }

      return storedHeight
    },
    [mutableCanvas]
  )

  const getDraggedRectSize = useCallback((node: XYNode, allItems: Rect[]): { width: number; height: number } | null => {
    const itemRect = allItems.find((rect) => rect.id === node.id)
    const width = itemRect?.width ?? node.measured?.width
    const height = itemRect?.height ?? node.measured?.height

    if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
      return null
    }

    return { width, height }
  }, [])

  /** Build current full-node rects for dragged nodes from ReactFlow's callback data. */
  const buildDraggedRects = useCallback(
    (nodes: XYNode[], allItems: Rect[]): Rect[] | null => {
      const rects: Rect[] = []

      for (const node of nodes) {
        const size = getDraggedRectSize(node, allItems)
        if (!size) {
          return null
        }

        rects.push({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: size.width,
          height: size.height,
        })
      }

      return rects
    },
    [getDraggedRectSize]
  )

  /** Build start-position full-node rects from stored drag start positions. */
  const buildStartRects = useCallback(
    (nodes: XYNode[], allItems: Rect[]): Rect[] | null => {
      const rects: Rect[] = []

      for (const node of nodes) {
        const sp = dragStartPositions.current.get(node.id)
        const size = getDraggedRectSize(node, allItems)
        if (!size) {
          return null
        }

        rects.push({
          id: node.id,
          x: sp?.x ?? node.position.x,
          y: sp?.y ?? node.position.y,
          width: size.width,
          height: size.height,
        })
      }

      return rects
    },
    [getDraggedRectSize]
  )
  // ── Drag Start ──────────────────────────────────────────────────────────
  const onNodeDragStart = useCallback((_event: ReactMouseEvent, _node: XYNode, nodes: XYNode[]) => {
    dragStartPositions.current.clear()
    isDragging.current = true

    for (const n of nodes) {
      dragStartPositions.current.set(n.id, { x: n.position.x, y: n.position.y })
    }
  }, [])

  // ── Drag (live — indicators only, no node movement) ────────────────────
  const onNodeDrag = useCallback(
    (_event: ReactMouseEvent, _node: XYNode, nodes: XYNode[]) => {
      // Free-moving nodes (text, sticky) skip all layout
      if (areFreeMoving(nodes)) {
        setSwapIndicator(null)
        return
      }

      const allItems = getItemRects()
      const draggedIds = new Set(nodes.map((n) => n.id))

      const draggedRects = buildDraggedRects(nodes, allItems)
      if (!draggedRects) {
        setSwapIndicator(null)
        return
      }

      const groupRect = groupBoundingBox(draggedRects)
      const others = allItems.filter((r) => !draggedIds.has(r.id))

      // Swap indicator
      const swapTarget = findSwapTarget(others, groupRect)
      if (swapTarget) {
        const target = swapTarget.targetRect
        const startRects = buildStartRects(nodes, allItems)
        if (!startRects) {
          setSwapIndicator(null)
          return
        }

        const groupStartRect = groupBoundingBox(startRects)
        const dx = Math.abs(groupStartRect.x - target.x)
        const dy = Math.abs(groupStartRect.y - target.y)

        let indicatorX: number
        let indicatorY: number

        if (dy >= dx) {
          indicatorX = groupRect.x + groupRect.width / 2
          indicatorY = groupRect.y
        } else {
          const leftX = Math.min(groupRect.x, target.x)
          const rightX = Math.max(groupRect.x + groupRect.width, target.x + target.width)
          indicatorX = (leftX + rightX) / 2
          indicatorY = Math.min(groupRect.y, target.y)
        }

        setSwapIndicator({
          targetId: swapTarget.targetId,
          x: indicatorX,
          y: indicatorY,
          targetX: target.x,
          targetY: target.y,
          targetWidth: target.width,
          targetHeight: target.height,
        })
        return
      }

      setSwapIndicator(null)
    },
    [getItemRects, areFreeMoving, buildDraggedRects, buildStartRects]
  )

  // ── Drag Stop ───────────────────────────────────────────────────────────
  const onNodeDragStop = useCallback(
    (_event: ReactMouseEvent, _node: XYNode, nodes: XYNode[]) => {
      setSwapIndicator(null)
      isDragging.current = false

      // Free-moving nodes (text, sticky) skip all layout
      if (areFreeMoving(nodes)) {
        dragStartPositions.current.clear()
        return
      }

      const allItems = getItemRects()
      const draggedIds = new Set(nodes.map((n) => n.id))

      const draggedRects = buildDraggedRects(nodes, allItems)
      if (!draggedRects) {
        dragStartPositions.current.clear()
        return
      }

      const groupRect = groupBoundingBox(draggedRects)
      const startRects = buildStartRects(nodes, allItems)
      if (!startRects) {
        dragStartPositions.current.clear()
        return
      }

      const groupStartRect = groupBoundingBox(startRects)
      const others = allItems.filter((r) => !draggedIds.has(r.id))

      // ── 1. Swap (node overlaps another node sufficiently) ─────────
      const swapTarget = findSwapTarget(others, groupRect)
      if (swapTarget) {
        const target = swapTarget.targetRect

        // Stack dragged nodes in a column at target's position (sorted left-to-right)
        const draggedSorted = [...draggedRects].sort((a, b) => a.x - b.x)
        let cursorY = target.y
        for (const rect of draggedSorted) {
          applyPositionUpdate(rect.id, target.x, cursorY)
          cursorY += rect.height + LAYOUT_GAP_Y
        }
        const columnBottom = cursorY - LAYOUT_GAP_Y

        // Target goes to dragged group's start position
        applyPositionUpdate(swapTarget.targetId, groupStartRect.x, groupStartRect.y)

        // Push nodes below at target position if column is taller than old target.
        const columnHeight = columnBottom - target.y
        if (columnHeight > target.height) {
          const postSwapRects = getItemRects()
          const firstId = draggedSorted[0].id
          const pushUpdates = pushNodesOnResize(postSwapRects, firstId, target.height, columnHeight)
          for (const update of pushUpdates) {
            applyPositionUpdate(update.id, update.x, update.y)
          }
        }

        // Push nodes below at start position if target is taller than the old column
        const oldColumnBottom = groupStartRect.y + groupStartRect.height
        const newTargetBottom = groupStartRect.y + target.height
        if (newTargetBottom > oldColumnBottom) {
          const postSwapRects2 = getItemRects()
          const pushUpdates = pushNodesOnResize(
            postSwapRects2,
            swapTarget.targetId,
            groupStartRect.height,
            target.height
          )
          for (const update of pushUpdates) {
            applyPositionUpdate(update.id, update.x, update.y)
          }
        }

        dragStartPositions.current.clear()
        return
      }

      // Temporarily disable free-node auto snapping so node drops stay exactly where released.

      // ── 3. Enforce minimum gap — push dropped nodes if too close ────
      const postRects = getItemRects()
      const postOthers = postRects.filter((r) => !draggedIds.has(r.id))

      for (const dragged of postRects.filter((r) => draggedIds.has(r.id))) {
        let dx = 0
        let dy = 0
        for (const other of postOthers) {
          if (!rectsOverlap(dragged, other, LAYOUT_GAP_X, LAYOUT_GAP_Y)) continue

          const oRight = other.x + other.width
          const oBottom = other.y + other.height
          const dRight = dragged.x + dragged.width
          const dBottom = dragged.y + dragged.height

          const penRight = oRight + LAYOUT_GAP_X - dragged.x
          const penLeft = dRight + LAYOUT_GAP_X - other.x
          const penDown = oBottom + LAYOUT_GAP_Y - dragged.y
          const penUp = dBottom + LAYOUT_GAP_Y - other.y

          const minPen = Math.min(penRight, penLeft, penDown, penUp)
          if (minPen <= 0) continue

          if (minPen === penRight) dx = Math.max(dx, penRight)
          else if (minPen === penLeft) dx = Math.min(dx, -penLeft)
          else if (minPen === penDown) dy = Math.max(dy, penDown)
          else if (minPen === penUp) dy = Math.min(dy, -penUp)
        }
        if (dx !== 0 || dy !== 0) {
          applyPositionUpdate(dragged.id, dragged.x + dx, dragged.y + dy)
        }
      }

      dragStartPositions.current.clear()
    },
    [getItemRects, applyPositionUpdate, areFreeMoving, buildDraggedRects, buildStartRects]
  )

  // ── Prepare for node expand (seed collapsed height baseline) ─────────────
  const prepareNodeExpand = useCallback(
    (nodeId: string) => {
      // Read current measured height from the rects (reflects actual collapsed DOM size)
      const rects = getItemRects()
      const rect = rects.find((r) => r.id === nodeId)
      if (rect) {
        expandingNodes.current.set(nodeId, rect.height)
        prevHeights.current.set(nodeId, rect.height)
      }
    },
    [getItemRects]
  )

  // ── Nodes Change wrapper (detects height changes for push) ──────────────
  const handleNodesChangeForLayout = useCallback(
    (changes: NodeChange[], oldHeights?: LayoutHeightBaselineMap) => {
      // Don't push nodes while dragging — it looks glitchy
      if (isDragging.current) return

      for (const change of changes) {
        if (change.type !== 'dimensions' || !change.dimensions) continue

        // Free-moving nodes don't participate in push-on-resize
        const item = mutableCanvas.items.find((i) => i.id === change.id)
        if (item?.kind === 'node' && FREE_MOVING_NODE_TYPES.has(item.xynode.type)) continue

        const newHeight = change.dimensions.height

        // Check if this node is currently expanding
        const collapsedBaseline = expandingNodes.current.get(change.id)
        if (collapsedBaseline !== undefined) {
          if (newHeight > collapsedBaseline) {
            // Expansion complete — push using collapsed height as baseline
            expandingNodes.current.delete(change.id)
            prevHeights.current.set(change.id, newHeight)

            const items = getItemRects()
            const pushUpdates = pushNodesOnResize(items, change.id, collapsedBaseline, newHeight)
            for (const update of pushUpdates) {
              applyPositionUpdate(update.id, update.x, update.y)
            }
          } else {
            // Intermediate height during expansion — track but don't push
            prevHeights.current.set(change.id, newHeight)
          }
          continue
        }

        const oldHeight =
          prevHeights.current.get(change.id) ?? oldHeights?.get(change.id) ?? getStoredLayoutHeight(change.id)

        if (oldHeight != null && newHeight < oldHeight && change.resizing !== true) {
          prevHeights.current.set(change.id, oldHeight)
          continue
        }

        prevHeights.current.set(change.id, newHeight)

        if (oldHeight == null || newHeight <= oldHeight) continue

        const items = getItemRects()
        const pushUpdates = pushNodesOnResize(items, change.id, oldHeight, newHeight)
        for (const update of pushUpdates) {
          applyPositionUpdate(update.id, update.x, update.y)
        }
      }
    },
    [getItemRects, applyPositionUpdate, getStoredLayoutHeight, mutableCanvas]
  )

  return {
    swapIndicator,
    clearSwapIndicator: useCallback(() => setSwapIndicator(null), []),
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    handleNodesChangeForLayout,
    prepareNodeExpand,
  }
}
