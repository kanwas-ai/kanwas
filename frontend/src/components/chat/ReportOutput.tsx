import { useState, useMemo } from 'react'
import type { ReportOutputItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { ChatMarkdown } from './ChatMarkdown'
import { plainMarkdownComponents, stripMarkdownNodeProp, type MarkdownComponents } from './chatMarkdownShared'

interface ReportOutputProps {
  item: DeepReadonly<ReportOutputItem>
  streaming?: boolean
}

const REPORT_MARKDOWN_COMPONENTS: MarkdownComponents = {
  ...plainMarkdownComponents,
  a: ({ href, children, ...props }) => (
    <a {...stripMarkdownNodeProp(props)} href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
      {children}
    </a>
  ),
}

/** Extract first heading or short preview from content */
function getContentPreview(text: string): string | null {
  if (!text) return null

  // Look for first markdown heading
  const headingMatch = text.match(/^#+\s+(.+)$/m)
  if (headingMatch) {
    const heading = headingMatch[1].trim()
    return heading.length > 40 ? heading.slice(0, 40) + '...' : heading
  }

  // Fallback: first line truncated
  const firstLine = text.split('\n')[0].trim()
  if (firstLine.length > 40) return firstLine.slice(0, 40) + '...'
  return firstLine || null
}

export function ReportOutput({ item, streaming }: ReportOutputProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isStreaming = streaming || item.status === 'streaming'
  const content = item.content || ''
  const lineCount = item.lineCount || content.split('\n').length

  const preview = useMemo(() => (isStreaming ? getContentPreview(content) : null), [isStreaming, content])

  return (
    <div
      className={`inline-block bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)] ${isStreaming ? 'animate-shimmer' : ''}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-2 text-sm text-foreground-muted px-3 py-1.5 max-w-full text-left hover:opacity-80 cursor-pointer transition-opacity"
      >
        <i className="fa-solid fa-file-lines w-4 text-center flex-shrink-0 text-[12px] opacity-70" />
        <span className="truncate">
          {isStreaming ? 'Generating report' : 'Report'}
          {lineCount > 0 && <span className="opacity-60"> ({lineCount} lines)</span>}
          {isStreaming && preview && <span className="opacity-60"> · {preview}</span>}
        </span>
        <svg
          className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 animate-in fade-in duration-200 pl-9">
          <div className="text-foreground-muted text-sm break-words [&_p]:mb-3 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:my-1 [&_code]:bg-block-highlight [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-foreground [&_code]:break-all [&_pre]:bg-block-highlight [&_pre]:border [&_pre]:border-outline [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:break-normal [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_th]:border [&_th]:border-outline [&_th]:bg-block-highlight [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-outline [&_td]:px-3 [&_td]:py-2">
            <ChatMarkdown markdown={content} streaming={isStreaming} components={REPORT_MARKDOWN_COMPONENTS} />
            {isStreaming && <span className="inline-block w-0.5 h-4 bg-foreground-muted animate-pulse align-middle" />}
          </div>
        </div>
      )}
    </div>
  )
}
