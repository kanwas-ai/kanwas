import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MentionItemData } from './useMentionItems'

export interface MentionSuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface MentionSuggestionListProps {
  items: MentionItemData[]
  command: (item: MentionItemData) => void
  activeCanvasId: string | null
}

export const MentionSuggestionList = forwardRef<MentionSuggestionListRef, MentionSuggestionListProps>(
  ({ items, command, activeCanvasId }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      setSelectedIndex(0)
    }, [items])

    useEffect(() => {
      const el = containerRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
          return true
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault()
          if (items[selectedIndex]) {
            command(items[selectedIndex])
          }
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="bg-canvas border border-outline rounded-lg shadow-lg w-[280px] p-2">
          <div className="text-foreground-muted px-3 py-2 text-sm">No documents found</div>
        </div>
      )
    }

    // Build render list with dividers between canvas groups
    type RenderItem = { type: 'item'; item: MentionItemData; index: number } | { type: 'divider'; canvasName: string }

    const renderList: RenderItem[] = []
    let lastCanvasId: string | null = null
    let itemIndex = 0

    for (const item of items) {
      if (item.canvasId !== lastCanvasId && item.canvasId !== activeCanvasId) {
        renderList.push({ type: 'divider', canvasName: item.canvasName })
      }
      renderList.push({ type: 'item', item, index: itemIndex })
      lastCanvasId = item.canvasId
      itemIndex++
    }

    return (
      <div
        ref={containerRef}
        className="bg-canvas border border-outline rounded-lg shadow-lg w-[280px] max-h-[280px] overflow-y-auto"
      >
        {renderList.map((entry, i) => {
          if (entry.type === 'divider') {
            return (
              <div
                key={`divider-${i}`}
                className="px-3 py-1.5 text-xs font-medium text-foreground-muted border-t border-outline mt-1 pt-2"
              >
                {entry.canvasName}
              </div>
            )
          }

          const { item, index } = entry
          const isSelected = index === selectedIndex

          return (
            <button
              key={item.id}
              data-index={index}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                isSelected ? 'bg-foreground/5 text-foreground' : 'text-foreground/70 hover:text-foreground'
              }`}
              onClick={() => command(item)}
            >
              <i
                className={`fa-solid ${item.type === 'canvas' ? 'fa-folder' : 'fa-file-lines'} text-[12px] opacity-50`}
              />
              <span className="text-sm truncate">{item.name}</span>
            </button>
          )
        })}
      </div>
    )
  }
)

MentionSuggestionList.displayName = 'MentionSuggestionList'
