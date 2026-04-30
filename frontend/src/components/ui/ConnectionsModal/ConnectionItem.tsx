import { Button } from '@/components/ui/Button'
import type { ToolkitCategory } from '@/api/connections'
import { formatCategoryLabel } from './catalogPresentation'

interface ConnectionItemProps {
  displayName: string
  logo?: string
  description?: string
  categories?: ToolkitCategory[]
  isNoAuth: boolean
  isConnected: boolean
  isConnecting: boolean
  isInteractionDisabled?: boolean
  isHighlighted?: boolean
  onConnect: () => void
  onDisconnect: () => void
}

function getDescription(description: string | undefined, isNoAuth: boolean): string {
  const normalizedDescription = description?.trim()
  if (normalizedDescription) {
    return normalizedDescription
  }

  if (isNoAuth) {
    return 'No authentication needed. This toolkit is ready to use immediately.'
  }

  return 'Connect this toolkit to enable actions in this workspace.'
}

function getInstalledBadge(isConnected: boolean, isNoAuth: boolean, isConnecting: boolean) {
  if (!isConnected || isNoAuth || isConnecting) {
    return null
  }

  return {
    label: 'Installed',
    badgeClassName: 'border border-status-success/35 bg-status-success/15 text-status-success',
    dotClassName: 'bg-status-success',
  }
}

export function ConnectionItem({
  displayName,
  logo,
  description,
  categories = [],
  isNoAuth,
  isConnected,
  isConnecting,
  isInteractionDisabled = false,
  isHighlighted = false,
  onConnect,
  onDisconnect,
}: ConnectionItemProps) {
  const installedBadge = getInstalledBadge(isConnected, isNoAuth, isConnecting)
  const normalizedDescription = getDescription(description, isNoAuth)
  const visibleCategories = categories.slice(0, 2)
  const hiddenCategoryCount = Math.max(0, categories.length - visibleCategories.length)

  return (
    <div
      className={`
        group flex h-full min-h-[186px] flex-col justify-between rounded-xl border p-4
        transition-all duration-150 ease-out
        ${isHighlighted ? 'border-blue-400/60 bg-blue-50/40 ring-1 ring-blue-400/20 dark:bg-blue-950/20 dark:border-blue-500/40 dark:ring-blue-500/15' : 'border-outline/60 bg-editor/55 hover:border-outline hover:bg-editor'}
      `}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-outline/50 shadow-sm flex-shrink-0">
          {logo ? (
            <img src={logo} alt={displayName} className="w-7 h-7 object-contain" />
          ) : (
            <i className="fa-solid fa-plug text-foreground-muted text-sm" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-[15px] leading-5 truncate">{displayName}</p>
            </div>

            {installedBadge ? (
              <span
                className={`inline-flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded-full font-medium shrink-0 ${installedBadge.badgeClassName}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${installedBadge.dotClassName}`} aria-hidden="true" />
                {installedBadge.label}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-foreground-muted mt-2 leading-relaxed break-words line-clamp-3">
            {normalizedDescription}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {visibleCategories.map((category) => {
            const categoryLabel = formatCategoryLabel(category.name)

            return (
              <span
                key={category.slug}
                className="inline-flex items-center px-2 py-1 rounded-md text-[12px] leading-none border border-outline/70 bg-canvas text-foreground-muted font-medium"
              >
                <span className="truncate">{categoryLabel}</span>
              </span>
            )
          })}
          {hiddenCategoryCount > 0 && (
            <span className="px-2 py-1 rounded-md text-[12px] leading-none border border-outline/70 bg-canvas text-foreground-muted">
              +{hiddenCategoryCount}
            </span>
          )}
        </div>

        {isNoAuth ? (
          <Button size="sm" variant="secondary" disabled className="shrink-0">
            No auth
          </Button>
        ) : isConnecting ? (
          <Button size="sm" variant="secondary" isLoading disabled className="shrink-0">
            Connecting...
          </Button>
        ) : isConnected ? (
          <Button
            size="sm"
            variant="danger"
            onClick={onDisconnect}
            disabled={isInteractionDisabled}
            className="shrink-0"
          >
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={onConnect} disabled={isInteractionDisabled} className="shrink-0">
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
