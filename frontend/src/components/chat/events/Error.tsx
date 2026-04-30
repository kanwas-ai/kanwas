import type { ErrorItem } from 'backend/agent'

interface ErrorProps {
  item: ErrorItem
}

export function Error({ item }: ErrorProps) {
  const isUsageLimitError = item.error.code === 'OUT_OF_USAGE_LIMIT'
  const title = isUsageLimitError ? 'Usage limit reached' : 'Error'

  return (
    <div className="inline-flex max-w-full items-start gap-2 rounded-[var(--chat-radius)] border border-status-error/15 bg-chat-pill px-3 py-2 text-sm text-chat-pill-text shadow-chat-pill">
      <i
        className="fa-solid fa-circle-exclamation mt-[3px] w-4 shrink-0 text-center text-[11px] text-status-error/80"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground-muted">{title}</span>
          {!isUsageLimitError ? (
            <code className="rounded-md bg-status-error/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-status-error">
              {item.error.code}
            </code>
          ) : null}
        </div>
        <p className="leading-snug text-chat-pill-text/90">{item.error.message}</p>
      </div>
    </div>
  )
}
