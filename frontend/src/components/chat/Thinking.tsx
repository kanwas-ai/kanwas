import { useEffect, useRef, useState } from 'react'
import type { ThinkingItem } from 'backend/agent'
import { SubagentBadge } from './SubagentBadge'
import { ChatMarkdown } from './ChatMarkdown'
import type { MarkdownComponents } from './chatMarkdownShared'

interface ThinkingProps {
  item?: ThinkingItem
  /** For streaming mode - show expanded with this text */
  streamingText?: string
}

const CLAMPED_LINE_COUNT = 2

const thinkingMarkdownComponents: MarkdownComponents = {
  p: ({ children }) => <span className="mr-1 inline">{children}</span>,
  h1: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  h2: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  h3: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  h4: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  h5: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  h6: ({ children }) => <span className="mr-1 inline font-semibold">{children}</span>,
  ul: ({ children }) => <span className="mr-1 inline">{children}</span>,
  ol: ({ children }) => <span className="mr-1 inline">{children}</span>,
  li: ({ children }) => <span className="mr-2 inline">- {children}</span>,
  blockquote: ({ children }) => <span className="mr-1 inline border-l-2 border-outline pl-2 italic">{children}</span>,
  pre: ({ children }) => <span className="mr-1 inline">{children}</span>,
  code: ({ children }) => <code className="bg-canvas px-1 py-0.5 rounded text-foreground break-all">{children}</code>,
  inlineCode: ({ children }) => (
    <code className="bg-canvas px-1 py-0.5 rounded text-foreground break-all">{children}</code>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
      {children}
    </a>
  ),
}

export function Thinking({ item, streamingText }: ThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isExpandable, setIsExpandable] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const isStreaming = !!streamingText
  const thought = streamingText || item?.thought || ''
  const isFromSubagent = item?.agent?.source === 'subagent'
  const hasControls = isStreaming || isFromSubagent

  useEffect(() => {
    const element = contentRef.current
    if (!element) return

    const updateExpandable = () => {
      const previousDisplay = element.style.display
      const previousOverflow = element.style.overflow
      const previousLineClamp = element.style.getPropertyValue('-webkit-line-clamp')
      const previousBoxOrient = element.style.getPropertyValue('-webkit-box-orient')

      element.style.display = '-webkit-box'
      element.style.overflow = 'hidden'
      element.style.setProperty('-webkit-line-clamp', String(CLAMPED_LINE_COUNT))
      element.style.setProperty('-webkit-box-orient', 'vertical')

      const nextIsExpandable = element.scrollHeight > element.clientHeight + 1

      element.style.display = previousDisplay
      element.style.overflow = previousOverflow

      if (previousLineClamp) {
        element.style.setProperty('-webkit-line-clamp', previousLineClamp)
      } else {
        element.style.removeProperty('-webkit-line-clamp')
      }

      if (previousBoxOrient) {
        element.style.setProperty('-webkit-box-orient', previousBoxOrient)
      } else {
        element.style.removeProperty('-webkit-box-orient')
      }

      setIsExpandable((current) => (current === nextIsExpandable ? current : nextIsExpandable))
    }

    updateExpandable()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => updateExpandable())
    observer.observe(element)

    return () => observer.disconnect()
  }, [thought])

  const contentClassName = [
    'min-w-0 text-foreground-muted text-sm font-medium leading-snug break-words [&_strong]:font-semibold [&_em]:italic',
    isStreaming ? 'animate-thinking-stream' : '',
    !isExpanded ? 'overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex items-start gap-2 py-1">
      <div ref={contentRef} className={contentClassName}>
        <ChatMarkdown
          markdown={thought}
          streaming={isStreaming}
          className="inline"
          components={thinkingMarkdownComponents}
        />
      </div>
      {(isExpandable || hasControls) && (
        <div className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-foreground-muted">
          {isExpandable && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label={isExpanded ? 'Collapse thinking' : 'Expand thinking'}
            >
              <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-[8px]`} />
            </button>
          )}
          {isFromSubagent && <SubagentBadge />}
        </div>
      )}
    </div>
  )
}
