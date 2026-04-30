import { useCallback } from 'react'
import type { CanvasItem, SectionDef } from 'shared'
import { assignItemToSection, cleanupEmptySections } from './sectionUtils'
import { getSelectedSectionMemberItems } from './sectionMembers'

export function makeUniqueSectionTitle(existingSections: SectionDef[]): string {
  const baseTitle = 'Section'
  const existingTitles = new Set(existingSections.map((section) => section.title))
  if (!existingTitles.has(baseTitle)) {
    return baseTitle
  }

  let suffix = 2
  while (existingTitles.has(`${baseTitle} ${suffix}`)) {
    suffix += 1
  }

  return `${baseTitle} ${suffix}`
}

export function createEmptySection(mutableCanvas: CanvasItem, position: { x: number; y: number }) {
  const existingSections = mutableCanvas.sections ?? []
  const section: SectionDef = {
    id: crypto.randomUUID(),
    title: makeUniqueSectionTitle(existingSections),
    layout: 'horizontal',
    position,
    memberIds: [],
    columns: 2,
  }

  if (!mutableCanvas.sections) {
    mutableCanvas.sections = []
  }

  mutableCanvas.sections.push(section)
  return section.id
}

export function useCreateSection({
  mutableCanvas,
  selectedNodeIds,
  groupedIds,
}: {
  mutableCanvas: CanvasItem
  selectedNodeIds: string[]
  groupedIds: Set<string>
}) {
  return useCallback(() => {
    const selectedItems = getSelectedSectionMemberItems(mutableCanvas, selectedNodeIds, groupedIds)
    if (selectedItems.length < 2) {
      return
    }

    const sortedItems = [...selectedItems].sort((left, right) => {
      const dy = left.xynode.position.y - right.xynode.position.y
      if (Math.abs(dy) > 50) {
        return dy
      }

      return left.xynode.position.x - right.xynode.position.x
    })

    let minX = Infinity
    let minY = Infinity
    for (const item of sortedItems) {
      minX = Math.min(minX, item.xynode.position.x)
      minY = Math.min(minY, item.xynode.position.y)
    }

    const nextSectionId = crypto.randomUUID()
    const existingSections = mutableCanvas.sections ?? []

    for (const section of existingSections) {
      section.memberIds = section.memberIds.filter((memberId) => !selectedNodeIds.includes(memberId))
    }
    cleanupEmptySections(mutableCanvas)

    const section: SectionDef = {
      id: nextSectionId,
      title: makeUniqueSectionTitle(existingSections),
      layout: 'grid',
      position: { x: minX, y: minY },
      memberIds: sortedItems.map((item) => item.id),
      columns: 2,
    }

    if (!mutableCanvas.sections) {
      mutableCanvas.sections = []
    }
    mutableCanvas.sections.push(section)

    for (const item of sortedItems) {
      assignItemToSection(item, nextSectionId)
    }
  }, [groupedIds, mutableCanvas, selectedNodeIds])
}

export function useCreateEmptySection(mutableCanvas: CanvasItem) {
  return useCallback(
    (position: { x: number; y: number }) => createEmptySection(mutableCanvas, position),
    [mutableCanvas]
  )
}
