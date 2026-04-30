import type { BashItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState, useRef, useEffect } from 'react'
import { SubagentBadge } from './SubagentBadge'

interface BashToolProps {
  item: DeepReadonly<BashItem>
}

function getLastOutputLine(output?: string): string | null {
  if (!output) return null

  const lines = output.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line) return line
  }

  return null
}

export function BashTool({ item }: BashToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const outputRef = useRef<HTMLPreElement>(null)
  const isUserScrolledUp = useRef(false)
  const hasOutput = !!item.output?.trim()
  const outputLines = item.output?.split('\n').length ?? 0
  const hiddenLines = Math.max(0, (item.outputLineCount ?? 0) - outputLines)
  const isExecuting = item.status === 'executing'
  const lastOutputLine = getLastOutputLine(item.output)

  // Track if user has scrolled up (to disable auto-scroll)
  const handleScroll = () => {
    if (!outputRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current
    isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 20
  }

  // Auto-scroll only if user hasn't scrolled up
  useEffect(() => {
    if (isExpanded && isExecuting && outputRef.current && !isUserScrolledUp.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [item.output, isExecuting, isExpanded])

  // Reset scroll state when command completes or new command starts
  useEffect(() => {
    if (!isExecuting || !isExpanded) {
      isUserScrolledUp.current = false
    }
  }, [isExecuting, isExpanded])

  const canExpand = hasOutput || (item.status === 'failed' && !!item.error)
  const isSuccess = item.status === 'completed' && item.exitCode === 0
  const previewLine = !isExpanded ? lastOutputLine : null

  const renderOutputPanel = () => {
    if (!isExpanded || (!hasOutput && !(item.status === 'failed' && item.error))) {
      return null
    }

    return (
      <div className="px-3 pb-2 space-y-2 animate-in fade-in duration-200 pl-9">
        {hasOutput && (
          <>
            {hiddenLines > 0 && (
              <div className="text-xs text-foreground-muted">
                ... {hiddenLines} more {hiddenLines === 1 ? 'line' : 'lines'} above
              </div>
            )}
            <pre
              ref={outputRef}
              onScroll={handleScroll}
              className="bg-block-highlight rounded px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-64 overflow-y-auto"
            >
              {item.output}
            </pre>
          </>
        )}
        {item.status === 'failed' && item.error && <div className="text-xs text-status-error">{item.error}</div>}
      </div>
    )
  }

  // Failed state
  if (item.status === 'failed') {
    return (
      <div className="inline-block max-w-full bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)]">
        <button
          onClick={() => canExpand && setIsExpanded(!isExpanded)}
          className={`inline-flex items-center gap-2 text-sm text-chat-pill-text px-3 py-1.5 max-w-full text-left ${canExpand ? 'hover:opacity-80 cursor-pointer' : ''} transition-opacity`}
        >
          <i className="fa-solid fa-terminal w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              <span>Run </span>
              <code className="font-mono text-xs">{item.command}</code>
              <span className="text-status-error font-medium"> failed</span>
            </span>
            {previewLine && <span className="mt-0.5 block truncate text-xs text-chat-pill-text">{previewLine}</span>}
          </span>
          {item.agent?.source === 'subagent' && <SubagentBadge />}
          {canExpand && (
            <svg
              className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {renderOutputPanel()}
      </div>
    )
  }

  return (
    <div
      className={`inline-block max-w-full bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] ${isExecuting ? 'animate-shimmer' : ''}`}
    >
      <button
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-2 text-sm text-chat-pill-text px-3 py-1.5 max-w-full text-left ${canExpand ? 'hover:opacity-80 cursor-pointer' : ''} transition-opacity`}
      >
        <i className="fa-solid fa-terminal w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span>{isExecuting ? 'Running ' : 'Ran '}</span>
            <code className="font-mono text-xs">{item.command}</code>
            {!isExecuting && !isSuccess && item.exitCode !== undefined && (
              <span className="text-yellow-600 dark:text-yellow-400 text-xs"> (exit {item.exitCode})</span>
            )}
          </span>
          {previewLine && <span className="mt-0.5 block truncate text-xs text-chat-pill-text">{previewLine}</span>}
        </span>
        {item.agent?.source === 'subagent' && <SubagentBadge />}
        {canExpand && (
          <svg
            className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {renderOutputPanel()}
    </div>
  )
}
