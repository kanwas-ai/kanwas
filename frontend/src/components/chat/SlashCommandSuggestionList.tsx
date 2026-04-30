import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SlashCommand } from './commands'

export interface SlashCommandSuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashCommandSuggestionListProps {
  items: SlashCommand[]
  command: (item: SlashCommand) => void
}

export const SlashCommandSuggestionList = forwardRef<SlashCommandSuggestionListRef, SlashCommandSuggestionListProps>(
  ({ items, command }, ref) => {
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
        // Enter: Only for immediate commands
        if (event.key === 'Enter') {
          const selected = items[selectedIndex]
          if (selected?.immediate) {
            command(selected)
            return true
          }
          return false // Let Enter submit the message for non-immediate commands
        }
        // Tab: For all commands (immediate executes, non-immediate inserts text)
        if (event.key === 'Tab') {
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
          <div className="text-foreground-muted px-3 py-2 text-sm">No commands found</div>
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className="bg-canvas border border-outline rounded-lg shadow-lg w-[280px] max-h-[280px] overflow-y-auto"
      >
        {items.map((cmd, index) => (
          <button
            key={cmd.name}
            data-index={index}
            className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
              index === selectedIndex ? 'bg-foreground/5 text-foreground' : 'text-foreground/70 hover:text-foreground'
            }`}
            onClick={() => command(cmd)}
          >
            <span className="text-sm font-medium">/{cmd.name}</span>
            <span className={`text-xs ${index === selectedIndex ? 'text-foreground/70' : 'text-foreground/40'}`}>
              {cmd.description}
            </span>
          </button>
        ))}
      </div>
    )
  }
)

SlashCommandSuggestionList.displayName = 'SlashCommandSuggestionList'
