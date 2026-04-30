import type { ReactNode } from 'react'
import { getToolkitLogo } from '@/utils/toolkitLogos'

interface ComposioTimelinePillProps {
  icon: ReactNode
  label: ReactNode
  title: string
  active?: boolean
  canExpand?: boolean
  isExpanded?: boolean
  subtitle?: ReactNode
  children?: ReactNode
  onToggle?: () => void
}

export function ComposioToolkitIcon({ toolkit, size = 'sm' }: { toolkit: string; size?: 'xs' | 'sm' }) {
  const logo = getToolkitLogo(toolkit)
  const sizeClass = size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (logo) {
    return (
      <span
        className={`${sizeClass} inline-flex shrink-0 items-center justify-center overflow-hidden rounded align-middle`}
      >
        <img src={logo} alt={toolkit} className="h-full w-full object-contain" />
      </span>
    )
  }

  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded border border-chat-pill-border bg-chat-clear align-middle text-[10px] font-semibold text-chat-pill-icon`}
    >
      {toolkit.charAt(0).toUpperCase()}
    </span>
  )
}

function Chevron({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 text-chat-pill-icon transition-transform ${isExpanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export function ComposioTimelinePill({
  icon,
  label,
  title,
  active,
  canExpand,
  isExpanded = false,
  subtitle,
  children,
  onToggle,
}: ComposioTimelinePillProps) {
  const summaryClassName = `inline-flex max-w-full items-start gap-2 px-3 text-left text-sm text-chat-pill-text ${
    subtitle ? 'py-2' : 'py-1.5'
  } ${canExpand ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}`

  const summary = (
    <>
      <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center text-[11px] text-chat-pill-icon">
        {icon}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="block truncate leading-5">{label}</div>
        {subtitle && (
          <div className="mt-0.5 min-w-0 truncate text-xs leading-snug text-chat-pill-text/70">{subtitle}</div>
        )}
      </div>
      {canExpand && <Chevron isExpanded={isExpanded} />}
    </>
  )

  return (
    <div
      className={`inline-block max-w-full overflow-hidden rounded-[var(--chat-radius)] border border-chat-pill-border bg-chat-pill shadow-chat-pill ${
        active ? 'animate-shimmer' : ''
      }`}
      title={title}
    >
      {canExpand ? (
        <button type="button" onClick={onToggle} className={summaryClassName}>
          {summary}
        </button>
      ) : (
        <div className={summaryClassName}>{summary}</div>
      )}

      {canExpand && isExpanded && children && (
        <div className="space-y-2 px-3 pb-3 pl-9 animate-in fade-in slide-in-from-top-2 duration-200">{children}</div>
      )}
    </div>
  )
}
