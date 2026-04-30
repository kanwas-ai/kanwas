import type { ComposioToolItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState, useEffect } from 'react'
import { ComposioTimelinePill, ComposioToolkitIcon } from './ComposioTimelinePill'
import { composioDetailCardClassName, formatComposioDuration, formatComposioToolkitName } from './composioTimelineUtils'

interface ComposioToolProps {
  item: DeepReadonly<ComposioToolItem>
}

function getDescription(item: DeepReadonly<ComposioToolItem>): string {
  // If thought provided, use that
  if (item.thought) return item.thought

  // Single tool: use display name
  if (item.tools?.length === 1) {
    return item.tools[0].displayName
  }

  // Multiple tools: list them
  if (item.tools && item.tools.length > 1) {
    return item.tools.map((t) => t.displayName).join(', ')
  }

  return ''
}

function getUniqueToolkits(item: DeepReadonly<ComposioToolItem>): string[] {
  if (item.tools && item.tools.length > 0) {
    return [...new Set(item.tools.map((t) => t.toolkit))]
  }
  return [item.toolkit]
}

function getToolCount(item: DeepReadonly<ComposioToolItem>) {
  return item.toolCount ?? item.tools?.length ?? 1
}

export function ComposioTool({ item }: ComposioToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  const toolkits = getUniqueToolkits(item)
  const primaryToolkit = toolkits[0]
  const toolkitLabel =
    primaryToolkit === 'mixed' || toolkits.length > 1 ? 'connected app' : formatComposioToolkitName(primaryToolkit)
  const description = getDescription(item)
  const toolCount = getToolCount(item)
  const toolNoun = toolCount === 1 ? 'tool' : 'tools'
  const isExecuting = item.status === 'initializing' || item.status === 'in_progress'
  const canExpand = !isExecuting && item.tools && item.tools.length > 1
  const elapsedLabel = isExecuting && elapsedTime > 0 ? formatComposioDuration(elapsedTime) : ''
  const action = isExecuting ? 'Using' : 'Used'
  const toolTarget = `${toolCount > 1 ? `${toolCount} ` : ''}${toolkitLabel} ${toolNoun}`
  const titlePrefix = item.status === 'failed' ? toolTarget : `${action} ${toolTarget}`
  const icon = <i className="fa-solid fa-person-running" />

  // Track elapsed time for in-progress tools
  useEffect(() => {
    if (isExecuting) {
      const intervalId = setInterval(() => {
        setElapsedTime(Date.now() - item.timestamp)
      }, 1000)
      return () => clearInterval(intervalId)
    }
  }, [isExecuting, item.timestamp])

  // Failed state
  if (item.status === 'failed') {
    return (
      <ComposioTimelinePill
        icon={icon}
        title={`${titlePrefix} failed${item.error ? `: ${item.error}` : ''}`}
        canExpand={canExpand}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        label={
          <>
            {toolTarget}
            <span className="font-medium text-status-error"> failed</span>
          </>
        }
        subtitle={
          item.error ? (
            <span className="text-status-error">{item.error}</span>
          ) : description ? (
            <span>{description}</span>
          ) : undefined
        }
      >
        {item.tools?.map((tool, index) => (
          <div key={index} className={composioDetailCardClassName}>
            <div className="flex min-w-0 items-start gap-2">
              <ComposioToolkitIcon toolkit={tool.toolkit} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-chat-pill-text">{tool.displayName}</div>
                <code className="mt-0.5 block truncate font-mono text-[11px] text-foreground-muted">{tool.slug}</code>
              </div>
            </div>
          </div>
        ))}
      </ComposioTimelinePill>
    )
  }

  // Executing or completed - same format, shimmer indicates active
  return (
    <ComposioTimelinePill
      icon={icon}
      title={`${titlePrefix}${description ? `: ${description}` : ''}${elapsedLabel ? ` (${elapsedLabel})` : ''}`}
      active={isExecuting}
      canExpand={canExpand}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      label={
        <>
          {action} {toolCount > 1 && `${toolCount} `}
          <span className="font-medium text-chat-link">{toolkitLabel}</span> {toolNoun}
        </>
      }
      subtitle={
        description || elapsedLabel ? (
          <>
            {description}
            {elapsedLabel && (
              <span>
                {description ? ' · ' : ''}
                {elapsedLabel}
              </span>
            )}
          </>
        ) : undefined
      }
    >
      {item.tools?.map((tool, index) => (
        <div key={index} className={composioDetailCardClassName}>
          <div className="flex min-w-0 items-start gap-2">
            <ComposioToolkitIcon toolkit={tool.toolkit} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-chat-pill-text">{tool.displayName}</div>
              <code className="mt-0.5 block truncate font-mono text-[11px] text-foreground-muted">{tool.slug}</code>
            </div>
          </div>
        </div>
      ))}
    </ComposioTimelinePill>
  )
}
