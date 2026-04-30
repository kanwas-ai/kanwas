import { useEffect, useRef, useState } from 'react'
import type { ProgressItem } from 'backend/agent'
import { SubagentBadge } from './SubagentBadge'
import { ChatMarkdown } from './ChatMarkdown'
import { plainMarkdownComponents, stripMarkdownNodeProp, type MarkdownComponents } from './chatMarkdownShared'

interface ProgressProps {
  item: ProgressItem
  streaming?: boolean
  /** Override message with streaming text during active streaming */
  streamingMessage?: string
}

const CLAMPED_LINE_COUNT = 3

const progressMarkdownComponents: MarkdownComponents = {
  ...plainMarkdownComponents,
  a: ({ href, children, ...props }) => (
    <a {...stripMarkdownNodeProp(props)} href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
      {children}
    </a>
  ),
}

export function Progress({ item, streaming, streamingMessage }: ProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isExpandable, setIsExpandable] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const message = streamingMessage ?? item.message
  const isFromSubagent = item.agent?.source === 'subagent'

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
  }, [message])

  const contentClassName = [
    'min-w-0 max-w-none text-foreground-muted text-sm font-medium leading-snug break-words [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:mb-1 [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:font-semibold [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:mb-1 [&_h5]:font-semibold [&_h6]:mb-1 [&_h6]:font-semibold [&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-outline [&_blockquote]:pl-2 [&_blockquote]:italic [&_hr]:my-2 [&_hr]:border-outline [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-foreground [&_code]:break-all [&_pre]:my-1 [&_pre]:bg-canvas [&_pre]:border [&_pre]:border-outline [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:break-normal',
    streaming ? 'animate-thinking-stream' : '',
    !isExpanded ? 'overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical]' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex items-start gap-2 py-1">
      <div ref={contentRef} className={contentClassName}>
        <ChatMarkdown
          markdown={message}
          streaming={streaming}
          className="inline"
          components={progressMarkdownComponents}
        />
      </div>
      {(isExpandable || isFromSubagent) && (
        <div className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-foreground-muted">
          {isExpandable && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label={isExpanded ? 'Collapse progress' : 'Expand progress'}
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
