import { useEffect } from 'react'
import type { CanvasItem, NodeItem, PendingCanvasPlacement } from 'shared'
import { NODE_LAYOUT } from 'shared/constants'
import type { WorkspaceUndoController } from '@/lib/workspaceUndo'
import { computeGroupRect } from './group/groupLayout'
import { buildSectionLayouts, getSectionBounds, getSectionNodeSize } from './section/layout'
import { resolvePendingSectionPlacements } from './section/usePendingSectionPlacementResolution'

type CanvasChildItem = CanvasItem['items'][number]

type Bounds = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type PendingCanvasPlacementData = {
  pendingCanvasPlacement?: unknown
}

function isFilesystemPendingPlacement(value: unknown): value is PendingCanvasPlacement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PendingCanvasPlacement).source === 'filesystem' &&
    ((value as PendingCanvasPlacement).reason === 'created' || (value as PendingCanvasPlacement).reason === 'moved')
  )
}

function hasPendingCanvasPlacement(item: CanvasChildItem): item is NodeItem {
  if (item.kind !== 'node') {
    return false
  }

  const data = item.xynode.data as PendingCanvasPlacementData
  return isFilesystemPendingPlacement(data.pendingCanvasPlacement)
}

function clearPendingCanvasPlacement(item: NodeItem): boolean {
  const data = item.xynode.data as PendingCanvasPlacementData
  if (!isFilesystemPendingPlacement(data.pendingCanvasPlacement)) {
    return false
  }

  delete data.pendingCanvasPlacement
  return true
}

function toBounds(item: CanvasChildItem): Bounds | null {
  const size = getSectionNodeSize(item)
  if (!size) {
    return null
  }

  return {
    id: item.id,
    x: item.xynode.position.x,
    y: item.xynode.position.y,
    width: size.width,
    height: size.height,
  }
}

function getRight(bounds: Bounds): number {
  return bounds.x + bounds.width
}

function getRightmostBound(bounds: Bounds[]): Bounds | null {
  if (bounds.length === 0) {
    return null
  }

  return bounds.reduce((rightmost, candidate) => (getRight(candidate) > getRight(rightmost) ? candidate : rightmost))
}

function getMutableNodeById(mutableCanvas: CanvasItem, nodeId: string): NodeItem | null {
  const item = mutableCanvas.items.find(
    (candidate): candidate is NodeItem => candidate.kind === 'node' && candidate.id === nodeId
  )
  return item ?? null
}

function getOccupiedBounds(canvas: CanvasItem, pendingIds: Set<string>): Bounds[] {
  const sectionMemberIds = new Set((canvas.sections ?? []).flatMap((section) => section.memberIds))
  const groupMemberIds = new Set((canvas.groups ?? []).flatMap((group) => group.memberIds ?? []))
  const bounds: Bounds[] = []

  for (const item of canvas.items) {
    if (pendingIds.has(item.id) || sectionMemberIds.has(item.id) || groupMemberIds.has(item.id)) {
      continue
    }

    const itemBounds = toBounds(item)
    if (itemBounds) {
      bounds.push(itemBounds)
    }
  }

  const sectionLayouts = buildSectionLayouts(canvas)
  for (const section of canvas.sections ?? []) {
    const sectionBounds = getSectionBounds(section, sectionLayouts.get(section.id))
    if (!sectionBounds) {
      continue
    }

    bounds.push({
      id: section.id,
      x: sectionBounds.left,
      y: sectionBounds.top,
      width: sectionBounds.right - sectionBounds.left,
      height: sectionBounds.bottom - sectionBounds.top,
    })
  }

  for (const group of canvas.groups ?? []) {
    bounds.push(computeGroupRect(group))
  }

  return bounds
}

export function resolvePendingCanvasPlacements(mutableCanvas: CanvasItem, canvas: CanvasItem): boolean {
  const pendingItems = canvas.items.filter(hasPendingCanvasPlacement)
  if (pendingItems.length === 0) {
    return false
  }

  const sectionMemberIds = new Set((canvas.sections ?? []).flatMap((section) => section.memberIds))
  const groupMemberIds = new Set((canvas.groups ?? []).flatMap((group) => group.memberIds ?? []))
  const repairItems = pendingItems.filter((item) => !sectionMemberIds.has(item.id) && !groupMemberIds.has(item.id))
  const repairIds = new Set(repairItems.map((item) => item.id))
  const rightmostBound = getRightmostBound(getOccupiedBounds(canvas, repairIds))
  let cursorX = rightmostBound ? getRight(rightmostBound) + NODE_LAYOUT.GAP : NODE_LAYOUT.INITIAL_POSITION.x
  const y = rightmostBound ? rightmostBound.y : NODE_LAYOUT.INITIAL_POSITION.y
  let changed = false

  for (const item of pendingItems) {
    const mutableItem = getMutableNodeById(mutableCanvas, item.id)
    if (!mutableItem) {
      continue
    }

    if (!repairIds.has(item.id)) {
      changed = clearPendingCanvasPlacement(mutableItem) || changed
      continue
    }

    const size = getSectionNodeSize(item)
    if (mutableItem.xynode.position.x !== cursorX || mutableItem.xynode.position.y !== y) {
      mutableItem.xynode.position = { x: cursorX, y }
      changed = true
    }

    changed = clearPendingCanvasPlacement(mutableItem) || changed
    cursorX += (size?.width ?? NODE_LAYOUT.WIDTH) + NODE_LAYOUT.GAP
  }

  return changed
}

export function resolvePendingPlacementRepairs(mutableCanvas: CanvasItem, canvas: CanvasItem): boolean {
  const sectionsChanged = resolvePendingSectionPlacements(mutableCanvas, canvas)
  const nodesChanged = resolvePendingCanvasPlacements(mutableCanvas, mutableCanvas)

  return sectionsChanged || nodesChanged
}

function hasPendingPlacementWork(canvas: CanvasItem): boolean {
  return (
    (canvas.sections ?? []).some((section) => section.pendingPlacement) || canvas.items.some(hasPendingCanvasPlacement)
  )
}

export function usePendingCanvasPlacementRepair({
  canvas,
  mutableCanvas,
  workspaceUndoController,
}: {
  canvas: CanvasItem
  mutableCanvas: CanvasItem
  workspaceUndoController: WorkspaceUndoController
}) {
  useEffect(() => {
    if (!hasPendingPlacementWork(canvas)) {
      return
    }

    workspaceUndoController.runWithoutUndoTracking(
      'pending-placement',
      () => resolvePendingPlacementRepairs(mutableCanvas, canvas),
      (changed) => changed
    )
  }, [canvas, mutableCanvas, workspaceUndoController])
}
