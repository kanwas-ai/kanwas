import type { WebSearchItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState } from 'react'
import { SubagentBadge } from './SubagentBadge'

interface WebSearchProps {
  item: DeepReadonly<WebSearchItem>
  /** True when query is still streaming from LLM */
  streaming?: boolean
}

const MAX_QUERY_LENGTH = 50
const resultCardClassName =
  'block rounded-lg border border-chat-pill-border bg-chat-background/70 px-3 py-2.5 transition-colors hover:bg-chat-background dark:border-outline/70 dark:bg-block-highlight/60 dark:hover:bg-block-highlight/80'

const resultIconClassName =
  'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-chat-pill-border bg-chat-pill text-chat-pill-icon dark:border-outline/70'

function truncateQuery(query: string): string {
  if (query.length <= MAX_QUERY_LENGTH) return query
  return query.slice(0, MAX_QUERY_LENGTH) + '...'
}

export function WebSearch({ item, streaming }: WebSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isFromSubagent = item.agent?.source === 'subagent'
  const displayQuery = truncateQuery(item.objective)

  // Streaming state - query still being typed by LLM
  if (streaming) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden animate-shimmer">
        <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className="min-w-0 truncate">
          Searching "<span className="text-chat-link font-medium">{displayQuery}</span>
          <span className="animate-pulse">|</span>"
        </span>
      </div>
    )
  }

  // Searching state - shimmer animation
  if (item.status === 'searching') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden animate-shimmer">
        <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className="min-w-0 truncate">
          Searching "<span className="text-chat-link font-medium">{displayQuery}</span>"
        </span>
        {isFromSubagent && <SubagentBadge />}
      </div>
    )
  }

  // Completed state - expandable results
  if (item.status === 'completed' && item.resultsFound !== undefined) {
    const hasResults = item.results && item.results.length > 0

    return (
      <div className="inline-flex flex-col bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] max-w-full overflow-hidden">
        <button
          onClick={() => hasResults && setIsExpanded(!isExpanded)}
          className={`inline-flex items-center gap-2 text-sm text-chat-pill-text px-3 py-1.5 text-left ${hasResults ? 'hover:opacity-80 cursor-pointer' : ''} transition-opacity`}
        >
          <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          <span className="min-w-0 truncate">
            Searched "<span className="text-chat-link font-medium">{displayQuery}</span>"
            <span>
              {' '}
              ({item.resultsFound} {item.resultsFound === 1 ? 'result' : 'results'})
            </span>
          </span>
          {isFromSubagent && <SubagentBadge />}
          {hasResults && (
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

        {/* Expandable results */}
        {isExpanded && item.results && item.results.length > 0 && (
          <div className="px-3 pb-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200 pl-9">
            {item.results.map((result, index) => (
              <a
                key={index}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className={resultCardClassName}
              >
                <div className="flex items-start gap-2">
                  <div className={resultIconClassName}>
                    <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-medium text-chat-link transition-opacity hover:opacity-80">
                      {result.title}
                    </div>
                    <div className="break-all text-xs text-chat-link/80">{result.url}</div>
                    {result.snippet && (
                      <div className="text-xs leading-relaxed text-foreground-muted line-clamp-3">{result.snippet}</div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Failed state
  if (item.status === 'failed') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full overflow-hidden">
        <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className="min-w-0 truncate">
          Search "<span className="text-chat-link font-medium">{displayQuery}</span>"
          <span className="text-status-error"> failed</span>
          {item.error && <span>: {item.error}</span>}
        </span>
        {isFromSubagent && <SubagentBadge />}
      </div>
    )
  }

  return null
}
