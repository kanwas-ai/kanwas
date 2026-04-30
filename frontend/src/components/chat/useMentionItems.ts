import { useMemo, useCallback } from 'react'
import type { CanvasItem, NodeItem } from 'shared'

export interface MentionItemData {
  id: string
  name: string
  type: 'document' | 'canvas'
  canvasId: string
  canvasName: string
}

interface GroupedMentionItems {
  canvasName: string
  canvasId: string
  items: MentionItemData[]
}

export function useMentionItems(root: CanvasItem | null, activeCanvasId: string | null) {
  const allItems = useMemo(() => {
    if (!root) return []

    const items: MentionItemData[] = []

    function collectFromCanvas(canvas: CanvasItem, parentCanvasId: string, parentCanvasName: string) {
      for (const item of canvas.items) {
        if (item.kind === 'node') {
          const node = item as NodeItem
          if (node.xynode.type === 'blockNote') {
            items.push({
              id: node.xynode.id,
              name: node.name || 'Untitled',
              type: 'document',
              canvasId: parentCanvasId,
              canvasName: parentCanvasName,
            })
          }
        } else {
          // It's a child canvas - add it as a mentionable item too
          const childCanvas = item as CanvasItem
          items.push({
            id: childCanvas.xynode.id,
            name: childCanvas.name || 'Untitled Canvas',
            type: 'canvas',
            canvasId: parentCanvasId,
            canvasName: parentCanvasName,
          })
          // Recurse into child canvas
          collectFromCanvas(childCanvas, childCanvas.xynode.id, childCanvas.name || 'Untitled Canvas')
        }
      }
    }

    // Collect from root canvas
    collectFromCanvas(root, root.xynode.id, root.name || 'Root')

    return items
  }, [root])

  const getItems = useCallback(
    (query: string): MentionItemData[] => {
      const lowerQuery = query.toLowerCase()

      const filtered = lowerQuery ? allItems.filter((item) => item.name.toLowerCase().includes(lowerQuery)) : allItems

      // Group by canvas, with active canvas items first
      const activeItems: MentionItemData[] = []
      const otherGroups: Map<string, GroupedMentionItems> = new Map()

      for (const item of filtered) {
        if (item.canvasId === activeCanvasId) {
          activeItems.push(item)
        } else {
          let group = otherGroups.get(item.canvasId)
          if (!group) {
            group = { canvasName: item.canvasName, canvasId: item.canvasId, items: [] }
            otherGroups.set(item.canvasId, group)
          }
          group.items.push(item)
        }
      }

      // Flatten: active canvas items first, then other groups
      const result: MentionItemData[] = [...activeItems]
      for (const group of otherGroups.values()) {
        result.push(...group.items)
      }

      return result
    },
    [allItems, activeCanvasId]
  )

  return { getItems, allItems }
}
