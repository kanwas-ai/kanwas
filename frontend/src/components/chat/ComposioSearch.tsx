import type { ComposioSearchItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState, useEffect } from 'react'
import { ComposioTimelinePill, ComposioToolkitIcon } from './ComposioTimelinePill'
import { composioDetailCardClassName, formatComposioDuration, formatComposioToolkitName } from './composioTimelineUtils'

interface ComposioSearchProps {
  item: DeepReadonly<ComposioSearchItem>
}

function getFoundToolkits(item: DeepReadonly<ComposioSearchItem>) {
  const toolkits = item.tools?.map((tool) => tool.toolkit).filter(Boolean) ?? []
  return [...new Set(toolkits)]
}

function ToolkitStrip({ toolkits }: { toolkits: string[] }) {
  const visibleToolkits = toolkits.slice(0, 5)
  const hiddenCount = Math.max(0, toolkits.length - visibleToolkits.length)

  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden pt-0.5">
      {visibleToolkits.map((toolkit) => (
        <span
          key={toolkit}
          className="inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full border border-chat-pill-border bg-chat-clear px-1.5 py-0.5"
        >
          <ComposioToolkitIcon toolkit={toolkit} size="xs" />
          <span className="max-w-20 truncate text-[11px] font-medium text-chat-pill-text/75">
            {formatComposioToolkitName(toolkit)}
          </span>
        </span>
      ))}
      {hiddenCount > 0 && <span className="shrink-0 text-[11px] text-chat-pill-text/60">+{hiddenCount}</span>}
    </span>
  )
}

export function ComposioSearch({ item }: ComposioSearchProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const isSearching = item.status === 'searching'

  // Track elapsed time for searching status
  useEffect(() => {
    if (isSearching) {
      const intervalId = setInterval(() => {
        setElapsedTime(Date.now() - item.timestamp)
      }, 1000)
      return () => clearInterval(intervalId)
    }
  }, [isSearching, item.timestamp])

  // Failed state
  if (item.status === 'failed') {
    return (
      <ComposioTimelinePill
        icon={<i className="fa-solid fa-person-running" />}
        title={`Search tools for "${item.useCase}" failed${item.error ? `: ${item.error}` : ''}`}
        label={
          <>
            Search tools for "<span className="font-medium text-chat-link">{item.useCase}</span>"
            <span className="font-medium text-status-error"> failed</span>
          </>
        }
        subtitle={item.error ? <span className="text-status-error">{item.error}</span> : undefined}
      />
    )
  }

  // Searching or completed
  const hasTools = item.tools && item.tools.length > 0
  const toolsFoundLabel =
    !isSearching && item.toolsFound !== undefined
      ? ` (${item.toolsFound} ${item.toolsFound === 1 ? 'tool' : 'tools'})`
      : ''
  const elapsedLabel = isSearching && elapsedTime > 3000 ? ` (${formatComposioDuration(elapsedTime)})` : ''
  const foundToolkits = getFoundToolkits(item)

  return (
    <ComposioTimelinePill
      icon={<i className="fa-solid fa-person-running" />}
      title={`${isSearching ? 'Searching' : 'Found'} tools for "${item.useCase}"${toolsFoundLabel}${elapsedLabel}`}
      active={isSearching}
      canExpand={hasTools && !isSearching}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      label={
        <>
          {isSearching ? 'Searching' : 'Found'} tools for "
          <span className="font-medium text-chat-link">{item.useCase}</span>"
          {toolsFoundLabel && <span className="text-chat-pill-text/70">{toolsFoundLabel}</span>}
          {elapsedLabel && <span className="text-chat-pill-text/70">{elapsedLabel}</span>}
        </>
      }
      subtitle={!isSearching && foundToolkits.length > 0 ? <ToolkitStrip toolkits={foundToolkits} /> : undefined}
    >
      {hasTools &&
        item.tools!.map((tool, i) => (
          <div key={i} className={composioDetailCardClassName}>
            <div className="flex min-w-0 items-start gap-2">
              <ComposioToolkitIcon toolkit={tool.toolkit} />
              <div className="min-w-0 flex-1">
                <code className="block truncate font-mono text-xs font-semibold text-chat-link">{tool.toolSlug}</code>
                {tool.description && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground-muted">{tool.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
    </ComposioTimelinePill>
  )
}
