import { useCallback } from 'react'
import type { CanvasItem } from 'shared'
import { deleteSection } from './sectionUtils'

export function useSectionMutations(mutableCanvas: CanvasItem, onSectionContentChange?: (sectionId: string) => void) {
  const handleSectionTitleChange = useCallback(
    (sectionId: string, title: string) => {
      const duplicate = (mutableCanvas.sections ?? []).some(
        (section) => section.id !== sectionId && section.title === title
      )
      if (duplicate) {
        return
      }

      const section = mutableCanvas.sections?.find((candidate) => candidate.id === sectionId)
      if (section) {
        section.title = title
      }
    },
    [mutableCanvas]
  )

  const handleSectionLayoutChange = useCallback(
    (sectionId: string, layout: 'horizontal' | 'grid') => {
      const section = mutableCanvas.sections?.find((candidate) => candidate.id === sectionId)
      if (!section) {
        return
      }

      section.layout = layout
      onSectionContentChange?.(sectionId)
      if (layout !== 'grid') {
        delete section.columns
      } else if (!section.columns || section.columns < 1) {
        section.columns = 2
      }
    },
    [mutableCanvas, onSectionContentChange]
  )

  const handleSectionColumnsChange = useCallback(
    (sectionId: string, columns: number | undefined) => {
      const section = mutableCanvas.sections?.find((candidate) => candidate.id === sectionId)
      if (!section || section.layout !== 'grid') {
        return
      }

      if (!columns || columns < 1) {
        delete section.columns
        onSectionContentChange?.(sectionId)
        return
      }

      section.columns = columns
      onSectionContentChange?.(sectionId)
    },
    [mutableCanvas, onSectionContentChange]
  )

  const handleSectionDrag = useCallback(
    (sectionId: string, dx: number, dy: number) => {
      const section = mutableCanvas.sections?.find((candidate) => candidate.id === sectionId)
      if (!section) {
        return
      }

      section.position = {
        x: section.position.x + dx,
        y: section.position.y + dy,
      }
    },
    [mutableCanvas]
  )

  const handleDeleteSection = useCallback(
    (sectionId: string) => {
      deleteSection(mutableCanvas, sectionId)
    },
    [mutableCanvas]
  )

  return {
    handleSectionTitleChange,
    handleSectionLayoutChange,
    handleSectionColumnsChange,
    handleSectionDrag,
    handleDeleteSection,
  }
}
