import type { CanvasItem, NodeItem, SectionDef } from 'shared'
import { buildSectionLayouts } from './layout'
import { findSectionForItem, findSectionMemberItem, type SectionMemberItem } from './sectionMembers'

function setNodeSectionId(item: NodeItem, sectionId: string | undefined) {
  const data = item.xynode.data as { sectionId?: string }

  if (sectionId) {
    data.sectionId = sectionId
    return
  }

  delete data.sectionId
}

function setItemSectionId(item: SectionMemberItem, sectionId: string | undefined) {
  if (item.kind !== 'node') {
    return
  }

  setNodeSectionId(item, sectionId)
}

export function deleteSection(mutableCanvas: CanvasItem, sectionId: string) {
  const section = mutableCanvas.sections?.find((candidate) => candidate.id === sectionId)
  if (!section) {
    return
  }

  const memberPositions = buildSectionLayouts(mutableCanvas).get(section.id)?.memberPositions ?? new Map()
  for (const memberId of section.memberIds) {
    const item = findSectionMemberItem(mutableCanvas, memberId)
    if (!item) {
      continue
    }

    const position = memberPositions.get(memberId)
    if (position) {
      item.xynode.position = position
    }
    setItemSectionId(item, undefined)
  }

  mutableCanvas.sections = (mutableCanvas.sections ?? []).filter((candidate) => candidate.id !== sectionId)
}

export function cleanupEmptySections(mutableCanvas: CanvasItem) {
  if (!mutableCanvas.sections) {
    return
  }

  mutableCanvas.sections = mutableCanvas.sections.filter((section) => section.memberIds.length > 0)
}

export function removeNodesFromSections(mutableCanvas: CanvasItem, nodeIds: string[]) {
  if (!mutableCanvas.sections || nodeIds.length === 0) {
    return
  }

  const idSet = new Set(nodeIds)
  for (const section of mutableCanvas.sections) {
    section.memberIds = section.memberIds.filter((memberId) => !idSet.has(memberId))
  }

  cleanupEmptySections(mutableCanvas)
}

export function moveNodeToSection(
  mutableCanvas: CanvasItem,
  item: NodeItem,
  targetSection: SectionDef,
  insertIndex: number
) {
  moveItemToSection(mutableCanvas, item, targetSection, insertIndex)
}

export function moveItemToSection(
  mutableCanvas: CanvasItem,
  item: SectionMemberItem,
  targetSection: SectionDef,
  insertIndex: number
) {
  const sourceSection = findSectionForItem(mutableCanvas, item.id)
  if (sourceSection) {
    sourceSection.memberIds = sourceSection.memberIds.filter((memberId) => memberId !== item.id)
  }

  const targetMemberIds = targetSection.memberIds.filter((memberId) => memberId !== item.id)
  const clampedIndex = Math.max(0, Math.min(insertIndex, targetMemberIds.length))
  targetMemberIds.splice(clampedIndex, 0, item.id)
  targetSection.memberIds = targetMemberIds
  setItemSectionId(item, targetSection.id)

  cleanupEmptySections(mutableCanvas)
}

export function removeNodeFromSection(mutableCanvas: CanvasItem, item: NodeItem) {
  removeItemFromSection(mutableCanvas, item)
}

export function removeItemFromSection(mutableCanvas: CanvasItem, item: SectionMemberItem) {
  const section = findSectionForItem(mutableCanvas, item.id)
  if (!section) {
    return
  }

  section.memberIds = section.memberIds.filter((memberId) => memberId !== item.id)
  setItemSectionId(item, undefined)
  cleanupEmptySections(mutableCanvas)
}

export function assignNodeToSection(item: NodeItem, sectionId: string) {
  assignItemToSection(item, sectionId)
}

export function assignItemToSection(item: SectionMemberItem, sectionId: string) {
  setItemSectionId(item, sectionId)
}
