import type { CanvasItem, NodeItem } from 'shared'

export type SectionMemberItem = NodeItem | CanvasItem

export function findSectionMemberItem(canvas: CanvasItem, itemId: string): SectionMemberItem | null {
  return canvas.items.find((candidate): candidate is SectionMemberItem => candidate.id === itemId) ?? null
}

export function getSelectedSectionMemberItems(
  canvas: CanvasItem,
  selectedNodeIds: string[],
  groupedIds: Set<string>
): SectionMemberItem[] {
  return canvas.items.filter(
    (item): item is SectionMemberItem =>
      selectedNodeIds.includes(item.id) && !(item.kind === 'node' && groupedIds.has(item.id))
  )
}

export function findSectionForItem(canvas: CanvasItem, itemId: string) {
  return canvas.sections?.find((section) => section.memberIds.includes(itemId)) ?? null
}
