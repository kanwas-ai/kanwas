import type { WebFetchItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState } from 'react'
import { SubagentBadge } from './SubagentBadge'

interface WebFetchToolProps {
  item: DeepReadonly<WebFetchItem>
}

const resultCardClassName =
  'block rounded-lg border border-chat-pill-border bg-chat-background/70 px-3 py-2.5 transition-colors hover:bg-chat-background dark:border-outline/70 dark:bg-block-highlight/60 dark:hover:bg-block-highlight/80'

const resultIconClassName =
  'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-chat-pill-border bg-chat-pill text-chat-pill-icon dark:border-outline/70'

function formatUrl(url: string): { domain: string; path: string } {
  try {
    const parsed = new URL(url)
    return {
      domain: parsed.hostname,
      path:
        `${parsed.pathname}${parsed.search}`.length > 56
          ? `${parsed.pathname}${parsed.search}`.slice(0, 56) + '...'
          : `${parsed.pathname}${parsed.search}`,
    }
  } catch {
    return { domain: url, path: '' }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDomainSummary(urls: readonly string[] | undefined): string | null {
  if (!urls || urls.length === 0) {
    return null
  }

  const domains = [...new Set(urls.map((url) => formatUrl(url).domain).filter(Boolean))]

  if (domains.length === 0) {
    return null
  }

  const visibleDomains = domains.slice(0, 2)
  const extraCount = domains.length - visibleDomains.length
  return `(${visibleDomains.join(', ')}${extraCount > 0 ? `, +${extraCount}` : ''})`
}

function formatPageCount(count: number): string {
  return `${count} ${count === 1 ? 'page' : 'pages'}`
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function buildSummaryText(label: 'Fetching' | 'Fetched', count: number, domainSummary: string | null): string {
  if (count <= 0) {
    return domainSummary ? `${label} pages ${domainSummary}` : `${label} pages`
  }

  return `${label} ${formatPageCount(count)}${domainSummary ? ` ${domainSummary}` : ''}`
}

export function WebFetchTool({ item }: WebFetchToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isFetching = item.status === 'fetching'
  const isFromSubagent = item.agent?.source === 'subagent'
  const requestedUrls = Array.isArray(item.urls) ? item.urls : []
  const displayUrls = item.results && item.results.length > 0 ? item.results.map((result) => result.url) : requestedUrls
  const domainSummary = formatDomainSummary(displayUrls)
  const fetchedCount = item.resultsFound ?? item.results?.length ?? requestedUrls.length
  const summaryLabel = isFetching ? 'Fetching' : 'Fetched'
  const summaryText = buildSummaryText(summaryLabel, isFetching ? requestedUrls.length : fetchedCount, domainSummary)
  const objectivePreview = item.objective ? truncateText(item.objective, 88) : null

  // Failed state
  if (item.status === 'failed') {
    return (
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 text-sm text-chat-pill-text bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-full px-3 py-1.5 max-w-full">
          <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
          <span className="min-w-0 truncate">
            Fetch {formatPageCount(requestedUrls.length)}
            {domainSummary && <span className="text-chat-link font-medium"> {domainSummary}</span>}
            <span className="text-status-error"> failed</span>
          </span>
          {isFromSubagent && <SubagentBadge />}
        </div>
        {item.error && <div className="ml-6 text-xs text-status-error">{item.error}</div>}
      </div>
    )
  }

  // Fetching or completed
  const canExpand = !isFetching && Boolean(item.results && item.results.length > 0)

  return (
    <div
      className={`inline-block max-w-full bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] ${isFetching ? 'animate-shimmer' : ''}`}
    >
      <button
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-2 text-sm text-chat-pill-text px-3 py-1.5 max-w-full text-left ${canExpand ? 'hover:opacity-80 cursor-pointer' : ''} transition-opacity`}
      >
        <i className="fa-solid fa-globe w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{summaryText}</span>
          {objectivePreview && (
            <span className="mt-0.5 block truncate text-xs text-chat-pill-text/80">{objectivePreview}</span>
          )}
        </span>
        {isFromSubagent && <SubagentBadge />}
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

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200 pl-9">
          {item.results?.map((result) => {
            const { domain, path } = formatUrl(result.url)

            return (
              <a
                key={result.url}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className={resultCardClassName}
              >
                <div className="flex items-start gap-2">
                  <div className={resultIconClassName}>
                    <i className="fa-solid fa-link text-[10px]" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{result.title}</div>
                        <div className="truncate text-xs text-foreground-muted">
                          {domain}
                          {path && <span className="text-foreground-muted/70">{path}</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 rounded-full border border-chat-pill-border bg-chat-pill px-2 py-0.5 text-[11px] text-foreground-muted dark:border-outline/70">
                        {formatBytes(result.contentLength)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground-muted">
                      <span className="break-all text-chat-link/90">{result.url}</span>
                      {result.publishDate && <span>Published {result.publishDate}</span>}
                    </div>
                  </div>
                </div>
              </a>
            )
          })}

          {!isFetching && item.contentLength !== undefined && (
            <div className="text-xs text-foreground-muted">Total extracted: {formatBytes(item.contentLength)}</div>
          )}
        </div>
      )}
    </div>
  )
}
