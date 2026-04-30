import { useCallback } from 'react'
import type { CanvasItem } from 'shared'

/**
 * Stable callbacks for group toolbar mutations (color, columns, drag).
 * These write to the Valtio proxy — kept separate from read-only lookups.
 */
export function useGroupMutations(mutableCanvas: CanvasItem) {
  const handleGroupColorChange = useCallback(
    (groupId: string, color: string | undefined) => {
      const group = mutableCanvas.groups?.find((g) => g.id === groupId)
      if (!group) return
      if (color === undefined) {
        delete group.color
      } else {
        group.color = color
      }
    },
    [mutableCanvas]
  )

  const handleGroupColumnsChange = useCallback(
    (groupId: string, columns: number | undefined) => {
      const group = mutableCanvas.groups?.find((g) => g.id === groupId)
      if (!group) return
      if (columns !== undefined && (columns < 1 || !Number.isFinite(columns))) return
      group.columns = columns
    },
    [mutableCanvas]
  )

  const handleGroupDrag = useCallback(
    (groupId: string, dx: number, dy: number) => {
      const group = mutableCanvas.groups?.find((g) => g.id === groupId)
      if (!group) return
      group.position = {
        x: group.position.x + dx,
        y: group.position.y + dy,
      }
    },
    [mutableCanvas]
  )

  const handleGroupNameChange = useCallback(
    (groupId: string, name: string) => {
      const group = mutableCanvas.groups?.find((g) => g.id === groupId)
      if (!group) return
      group.name = name
    },
    [mutableCanvas]
  )

  return { handleGroupColorChange, handleGroupColumnsChange, handleGroupDrag, handleGroupNameChange }
}
