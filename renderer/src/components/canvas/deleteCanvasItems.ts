import type { CanvasItem } from 'shared'

type CanvasChildItem = CanvasItem['items'][number]

function toDeleteIdSet(itemIds: Iterable<string>, protectedItemIds: Set<string>): Set<string> {
  const deleteIds = new Set<string>()
  for (const itemId of itemIds) {
    if (!protectedItemIds.has(itemId)) {
      deleteIds.add(itemId)
    }
  }

  return deleteIds
}

export function getDeletableCanvasItems(
  canvas: CanvasItem,
  itemIds: Iterable<string>,
  protectedItemIds: Set<string> = new Set()
): CanvasChildItem[] {
  const deleteIds = toDeleteIdSet(itemIds, protectedItemIds)
  if (deleteIds.size === 0) {
    return []
  }

  return canvas.items.filter((item) => deleteIds.has(item.id))
}

function applyGroupDeletionPlan(canvas: CanvasItem, deleteIds: Set<string>): void {
  if (!canvas.groups || deleteIds.size === 0) {
    return
  }

  const nextGroups: NonNullable<CanvasItem['groups']> = []
  for (const group of canvas.groups) {
    const memberIds = group.memberIds ?? []
    const survivorIds = memberIds.filter((memberId) => !deleteIds.has(memberId))
    const changed = survivorIds.length !== memberIds.length

    if (changed && memberIds.length > 0 && survivorIds.length === 0) {
      continue
    }

    if (changed) {
      group.memberIds = survivorIds
    }
    nextGroups.push(group)
  }

  canvas.groups = nextGroups
}

function applySectionDeletionPlan(canvas: CanvasItem, deleteIds: Set<string>): void {
  if (!canvas.sections || deleteIds.size === 0) {
    return
  }

  const nextSections: NonNullable<CanvasItem['sections']> = []
  for (const section of canvas.sections) {
    const memberIds = section.memberIds ?? []
    const survivorIds = memberIds.filter((memberId) => !deleteIds.has(memberId))
    const changed = survivorIds.length !== memberIds.length

    if (changed && memberIds.length > 0 && survivorIds.length === 0) {
      continue
    }

    if (changed) {
      section.memberIds = survivorIds
    }
    nextSections.push(section)
  }

  canvas.sections = nextSections
}

export function deleteCanvasItemsFromCanvas(
  canvas: CanvasItem,
  itemIds: Iterable<string>,
  protectedItemIds: Set<string> = new Set()
): CanvasChildItem[] {
  const deleteIds = toDeleteIdSet(itemIds, protectedItemIds)
  if (deleteIds.size === 0) {
    return []
  }

  const removedItems = canvas.items.filter((item) => deleteIds.has(item.id))
  if (removedItems.length === 0) {
    return []
  }

  applyGroupDeletionPlan(canvas, deleteIds)
  applySectionDeletionPlan(canvas, deleteIds)
  canvas.items = canvas.items.filter((item) => !deleteIds.has(item.id))

  return removedItems
}
