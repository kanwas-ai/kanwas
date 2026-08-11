import { COLLAPSED_NODE_LAYOUT, GROUP_LAYOUT } from 'shared/constants'
import { type Rect } from '../canvasLayout'
import type { GroupDef } from 'shared'

/**
 * Cell dimensions for a collapsed card inside a group grid.
 * Uses the full visible collapsed-node box.
 */
const CELL_WIDTH = COLLAPSED_NODE_LAYOUT.WIDTH
const CELL_HEIGHT = COLLAPSED_NODE_LAYOUT.HEIGHT

/**
 * Compute the grid layout for a group given its member count.
 * Returns total dimensions and per-cell offsets relative to the group position.
 */
export function computeGroupGrid(
  memberCount: number,
  columns?: number
): {
  width: number
  height: number
  cellPositions: Array<{ x: number; y: number }>
} {
  const cols = Math.min(columns ?? GROUP_LAYOUT.COLUMNS, Math.max(1, memberCount))
  const rows = Math.max(1, Math.ceil(memberCount / cols))

  const width = GROUP_LAYOUT.PADDING * 2 + cols * CELL_WIDTH + (cols - 1) * GROUP_LAYOUT.CELL_GAP
  const height =
    GROUP_LAYOUT.LABEL_HEIGHT + GROUP_LAYOUT.PADDING * 2 + rows * CELL_HEIGHT + (rows - 1) * GROUP_LAYOUT.CELL_GAP

  const cellPositions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < memberCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    cellPositions.push({
      x: GROUP_LAYOUT.PADDING + col * (CELL_WIDTH + GROUP_LAYOUT.CELL_GAP),
      y: GROUP_LAYOUT.LABEL_HEIGHT + GROUP_LAYOUT.PADDING + row * (CELL_HEIGHT + GROUP_LAYOUT.CELL_GAP),
    })
  }

  return { width, height, cellPositions }
}

/**
 * Given an absolute node position (center of the card), compute which grid cell
 * index it's closest to. Returns -1 if outside the grid area.
 * Uses the node center for a natural feel — avoids flickering at cell boundaries.
 */
export function computeCellIndex(
  nodeX: number,
  nodeY: number,
  groupX: number,
  groupY: number,
  memberCount: number,
  columns?: number
): number {
  const cols = Math.min(columns ?? GROUP_LAYOUT.COLUMNS, Math.max(1, memberCount))
  // Node center in local group space
  const localX = nodeX + CELL_WIDTH / 2 - groupX - GROUP_LAYOUT.PADDING
  const localY = nodeY + CELL_HEIGHT / 2 - groupY - GROUP_LAYOUT.LABEL_HEIGHT - GROUP_LAYOUT.PADDING

  const cellStepX = CELL_WIDTH + GROUP_LAYOUT.CELL_GAP
  const cellStepY = CELL_HEIGHT + GROUP_LAYOUT.CELL_GAP

  const col = Math.round(localX / cellStepX - 0.5)
  const row = Math.round(localY / cellStepY - 0.5)

  const clampedCol = Math.max(0, Math.min(col, cols - 1))
  const rows = Math.ceil(memberCount / cols)
  const clampedRow = Math.max(0, Math.min(row, rows - 1))

  const index = clampedRow * cols + clampedCol
  return Math.min(index, memberCount - 1)
}

/**
 * Compute the bounding rect for a group using full flow coordinates.
 */
export function computeGroupRect(group: GroupDef): Rect {
  const grid = computeGroupGrid((group.memberIds ?? []).length, group.columns)
  return {
    id: group.id,
    x: group.position.x,
    y: group.position.y,
    width: grid.width,
    height: grid.height,
  }
}

/**
 * Check whether a point (node position) falls inside a group's join zone
 * (the group rect inset by JOIN_INSET on all sides).
 */
export function isInsideGroupBounds(nodeX: number, nodeY: number, group: GroupDef): boolean {
  const rect = computeGroupRect(group)
  return (
    nodeX >= rect.x + GROUP_LAYOUT.JOIN_INSET &&
    nodeY >= rect.y + GROUP_LAYOUT.JOIN_INSET &&
    nodeX < rect.x + rect.width - GROUP_LAYOUT.JOIN_INSET &&
    nodeY < rect.y + rect.height - GROUP_LAYOUT.JOIN_INSET
  )
}
