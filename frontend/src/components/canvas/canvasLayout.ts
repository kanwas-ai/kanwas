import { NODE_NAME_HEIGHT } from 'shared/constants'

export { NODE_NAME_HEIGHT }

/**
 * Pure layout functions for canvas node positioning.
 * No React dependencies — easily testable.
 */

// ─── Constants ──────────────────────────────────────────────────────────────
export const LAYOUT_GAP_X = 40
export const LAYOUT_GAP_Y = 16
export const SNAP_THRESHOLD = 100
export const PUSH_X_BUFFER = 20

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Rect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface PositionUpdate {
  id: string
  x: number
  y: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a Rect from a canvas item's xynode using the full visible node bounds.
 */
export function toRect(item: {
  id: string
  xynode: {
    position: { x: number; y: number }
    measured?: { width?: number; height?: number }
  }
}): Rect | null {
  const width = item.xynode.measured?.width
  const height = item.xynode.measured?.height

  if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
    return null
  }

  return {
    id: item.id,
    x: item.xynode.position.x,
    y: item.xynode.position.y,
    width,
    height,
  }
}

function right(r: Rect) {
  return r.x + r.width
}
function bottom(r: Rect) {
  return r.y + r.height
}

/** Compute the bounding box of a group of rects. Returns a Rect with id '__group__'. */
export function groupBoundingBox(rects: Rect[]): Rect {
  if (rects.length === 0) return { id: '__group__', x: 0, y: 0, width: 0, height: 0 }
  if (rects.length === 1) return { ...rects[0], id: '__group__' }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, right(r))
    maxY = Math.max(maxY, bottom(r))
  }
  return { id: '__group__', x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsOverlap(a: Rect, b: Rect, gapX = LAYOUT_GAP_X, gapY = LAYOUT_GAP_Y): boolean {
  return a.x < right(b) + gapX && right(a) + gapX > b.x && a.y < bottom(b) + gapY && bottom(a) + gapY > b.y
}

function xRangeOverlaps(a: Rect, b: Rect, buffer: number): boolean {
  return a.x < right(b) + buffer && right(a) > b.x - buffer
}

// ─── Snap to Edges ──────────────────────────────────────────────────────────

/**
 * Snap a rect to nearby edges of other nodes.
 * `others` should NOT include the rect being snapped.
 * Returns a snapped position or null if nothing is close enough.
 */
export function snapRectToEdges(
  others: Rect[],
  dropped: Rect,
  gapX = LAYOUT_GAP_X,
  gapY = LAYOUT_GAP_Y,
  threshold = SNAP_THRESHOLD
): { x: number; y: number } | null {
  interface SnapCandidate {
    value: number
    dist: number
  }

  // Proximity margin: only snap to nodes that are nearby in the perpendicular
  // axis. Prevents snapping to far-away unrelated nodes.
  const proximityMargin = threshold * 3

  // Collect snap candidates per axis, tagged with source node
  const xCandidates: SnapCandidate[] = []
  const yCandidates: SnapCandidate[] = []

  for (const other of others) {
    const nearInY = dropped.y < bottom(other) + proximityMargin && bottom(dropped) + proximityMargin > other.y
    const nearInX = dropped.x < right(other) + proximityMargin && right(dropped) + proximityMargin > other.x

    // ── X-axis snaps (only if near in Y) ──────────────────────────────
    if (nearInY) {
      const llDist = Math.abs(dropped.x - other.x)
      if (llDist <= threshold) {
        xCandidates.push({ value: other.x, dist: llDist })
      }

      const rrDist = Math.abs(right(dropped) - right(other))
      if (rrDist <= threshold) {
        xCandidates.push({ value: right(other) - dropped.width, dist: rrDist })
      }

      const rlDist = Math.abs(right(dropped) - (other.x - gapX))
      if (rlDist <= threshold) {
        xCandidates.push({ value: other.x - gapX - dropped.width, dist: rlDist })
      }

      const lrDist = Math.abs(dropped.x - (right(other) + gapX))
      if (lrDist <= threshold) {
        xCandidates.push({ value: right(other) + gapX, dist: lrDist })
      }
    }

    // ── Y-axis snaps (only if near in X) ────────────────────────────
    if (nearInX) {
      const ttDist = Math.abs(dropped.y - other.y)
      if (ttDist <= threshold) {
        yCandidates.push({ value: other.y, dist: ttDist })
      }

      const bbDist = Math.abs(bottom(dropped) - bottom(other))
      if (bbDist <= threshold) {
        yCandidates.push({ value: bottom(other) - dropped.height, dist: bbDist })
      }

      const btDist = Math.abs(bottom(dropped) - (other.y - gapY))
      if (btDist <= threshold) {
        yCandidates.push({ value: other.y - gapY - dropped.height, dist: btDist })
      }

      const tbDist = Math.abs(dropped.y - (bottom(other) + gapY))
      if (tbDist <= threshold) {
        yCandidates.push({ value: bottom(other) + gapY, dist: tbDist })
      }
    }
  }

  if (xCandidates.length === 0 && yCandidates.length === 0) return null

  xCandidates.sort((a, b) => a.dist - b.dist)
  yCandidates.sort((a, b) => a.dist - b.dist)

  const bestX = xCandidates.length > 0 ? xCandidates[0] : null
  const bestY = yCandidates.length > 0 ? yCandidates[0] : null

  return {
    x: bestX ? bestX.value : dropped.x,
    y: bestY ? bestY.value : dropped.y,
  }
}

// ─── Push on Resize ─────────────────────────────────────────────────────────

/**
 * When a node grows in height, push nodes below it down.
 * Only pushes nodes whose X range overlaps (with buffer) and whose top was
 * below the old bottom of the changed node.
 */
export function pushNodesOnResize(
  items: Rect[],
  changedId: string,
  oldHeight: number,
  newHeight: number
): PositionUpdate[] {
  const delta = newHeight - oldHeight
  if (delta <= 0) return []

  const changed = items.find((r) => r.id === changedId)
  if (!changed) return []

  const oldBottom = changed.y + oldHeight
  const updates: PositionUpdate[] = []

  // Collect nodes that need pushing
  const toPush = new Map<string, Rect>()
  for (const item of items) {
    if (item.id === changedId) continue
    // Must be below the old bottom
    if (item.y < oldBottom) continue
    // Must overlap horizontally
    if (!xRangeOverlaps(changed, item, PUSH_X_BUFFER)) continue

    toPush.set(item.id, { ...item })
  }

  // Push each node down by delta
  for (const [, rect] of toPush) {
    rect.y += delta
    updates.push({ id: rect.id, x: rect.x, y: rect.y })
  }

  return updates
}

// ─── Compact After Collapse ─────────────────────────────────────────────────

/**
 * After a node collapses (height decreases), pull nodes below it upward
 * to close the gap. Only moves nodes whose X range overlaps the collapsed node.
 * Each candidate is pulled up to sit gap-distance below the nearest node above it.
 */
export function compactAfterCollapse(items: Rect[], collapsedId: string, gapY = LAYOUT_GAP_Y): PositionUpdate[] {
  const collapsed = items.find((r) => r.id === collapsedId)
  if (!collapsed) return []

  // Sort all items by Y position (top to bottom)
  const sorted = [...items].sort((a, b) => a.y - b.y)

  // Candidates: nodes below the collapsed node that overlap horizontally
  const candidateIds = new Set(
    sorted
      .filter((r) => r.id !== collapsedId && r.y > collapsed.y && xRangeOverlaps(r, collapsed, PUSH_X_BUFFER))
      .map((r) => r.id)
  )

  if (candidateIds.size === 0) return []

  // Working copy of all rects (mutated as we settle candidates)
  const rects = new Map<string, Rect>()
  for (const r of sorted) {
    rects.set(r.id, { ...r })
  }

  const updates: PositionUpdate[] = []

  // Process candidates in top-to-bottom order
  for (const r of sorted) {
    if (!candidateIds.has(r.id)) continue
    const candidate = rects.get(r.id)!
    const originalY = candidate.y

    // Find the floor: must be below all overlapping rects that are above it
    let floor = 0
    for (const [id, s] of rects) {
      if (id === candidate.id) continue
      if (!xRangeOverlaps(candidate, s, PUSH_X_BUFFER)) continue
      // Only consider nodes above this candidate
      if (s.y >= originalY) continue
      const required = bottom(s) + gapY
      if (required > floor) {
        floor = required
      }
    }

    // Pull up to floor, but never push down
    if (floor < originalY) {
      candidate.y = floor
      rects.set(candidate.id, candidate)
      updates.push({ id: candidate.id, x: candidate.x, y: floor })
    }
  }

  return updates
}

/**
 * Find a swap target based on overlap area.
 * Swap triggers when the overlap covers ≥50% of the target node's area
 * in BOTH dimensions independently (prevents edge-only overlaps from swapping).
 * Returns the target with the highest overlap, or null.
 */
export function findSwapTarget(items: Rect[], draggedRect: Rect): { targetId: string; targetRect: Rect } | null {
  let best: { targetId: string; targetRect: Rect; ratio: number } | null = null

  for (const other of items) {
    if (other.id === draggedRect.id) continue

    // Overlap in each dimension
    const ox = Math.max(0, Math.min(right(draggedRect), right(other)) - Math.max(draggedRect.x, other.x))
    const oy = Math.max(0, Math.min(bottom(draggedRect), bottom(other)) - Math.max(draggedRect.y, other.y))
    if (ox === 0 || oy === 0) continue

    // Both dimensions must have ≥50% coverage of the smaller node
    const xRatio = ox / Math.min(draggedRect.width, other.width)
    const yRatio = oy / Math.min(draggedRect.height, other.height)
    if (xRatio < 0.5 || yRatio < 0.5) continue

    const ratio = xRatio * yRatio
    if (!best || ratio > best.ratio) {
      best = { targetId: other.id, targetRect: other, ratio }
    }
  }

  return best ? { targetId: best.targetId, targetRect: best.targetRect } : null
}
