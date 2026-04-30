import { useState } from 'react'

interface CollapsibleTimelineItemProps {
  icon: string // Font Awesome class like "fa-solid fa-magnifying-glass"
  title: string | React.ReactNode
  children: React.ReactNode
  defaultExpanded?: boolean
  variant?: 'default' | 'action' // 'action' for concrete actions (black text)
}

export function CollapsibleTimelineItem({
  icon,
  title,
  children,
  defaultExpanded = false,
  variant = 'default',
}: CollapsibleTimelineItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const buttonClass =
    variant === 'action'
      ? 'flex items-center gap-2 text-sm text-foreground transition-colors text-left'
      : 'flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors text-left'

  return (
    <div className="overflow-hidden">
      <button onClick={() => setIsExpanded(!isExpanded)} className={buttonClass}>
        <i className={`${icon} flex-shrink-0`}></i>
        <span className="min-w-0 break-words">{title}</span>
        <i
          className={`fa-solid fa-chevron-right text-[12px] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        ></i>
      </button>

      {isExpanded && <div className="ml-5 mt-2 space-y-1.5">{children}</div>}
    </div>
  )
}
