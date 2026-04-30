import { Button } from '@/components/ui/Button'
import type { Organization } from '@/api/organizations'
import { useOrganization } from '@/hooks/useOrganizations'

interface UsageSectionProps {
  workspaceId?: string
  isOpen: boolean
}

interface UsagePeriodSnapshot {
  usedCents: number
  limitCents: number
  percent: number
  periodEndUtc: string
}

interface UsageSnapshot {
  weekly: UsagePeriodSnapshot
  monthly: UsagePeriodSnapshot
  isOutOfUsage: boolean
  lastSyncedAt: string | null
}

interface UsageLimitRowProps {
  label: string
  usedPercent: number
  periodEndUtc: string
  exhausted: boolean
}

function toDate(value: unknown): Date | null {
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatResetTime(value: unknown): string {
  const parsed = toDate(value)
  if (!parsed) {
    return 'Unavailable'
  }

  const now = new Date()
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()

  if (isToday) {
    return parsed.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0
  }

  return Math.max(0, Math.min(100, percent))
}

function getRemainingPercent(usedPercent: number): number {
  return clampPercent(100 - clampPercent(usedPercent))
}

function readUsageSnapshot(organization: Organization | undefined): UsageSnapshot | null {
  const usage = (organization as { usage?: unknown } | undefined)?.usage
  if (!usage || typeof usage !== 'object') {
    return null
  }

  return usage as UsageSnapshot
}

function resolveResetAt(usage: UsageSnapshot): Date | null {
  const exhaustedPeriods = [usage.weekly, usage.monthly].filter((period) => period.usedCents >= period.limitCents)
  const resetCandidates = exhaustedPeriods
    .map((period) => toDate(period.periodEndUtc))
    .filter((value): value is Date => value !== null)

  if (resetCandidates.length === 0) {
    return null
  }

  return resetCandidates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest))
}

function getProgressFillStyle(remainingPercent: number) {
  return {
    width: `${remainingPercent}%`,
    background:
      'linear-gradient(90deg, color-mix(in srgb, #ffb300 84%, white 16%) 0%, color-mix(in srgb, #ffb300 84%, white 16%) 55%, color-mix(in srgb, #ffb300 62%, white 38%) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.28)',
  }
}

function UsageLimitRow({ label, usedPercent, periodEndUtc, exhausted }: UsageLimitRowProps) {
  const remainingPercent = getRemainingPercent(usedPercent)
  const roundedRemainingPercent = Math.round(remainingPercent)
  const resetTime = formatResetTime(periodEndUtc)
  const progressFillStyle = getProgressFillStyle(remainingPercent)
  const progressTrackStyle = {
    borderColor: 'color-mix(in srgb, var(--palette-amber) 36%, var(--outline))',
    background: 'color-mix(in srgb, var(--palette-amber) 14%, var(--editor))',
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">{label}</p>
        <p className="text-[1.75rem] font-semibold tracking-tight text-foreground">
          {roundedRemainingPercent}% <span className="text-[0.72em] font-medium text-foreground">remaining</span>
        </p>
      </div>

      <div
        className="relative mt-1.5 h-3 overflow-hidden rounded-md border"
        style={progressTrackStyle}
        role="progressbar"
        aria-label={`${label} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedRemainingPercent}
      >
        <div className="h-full rounded-md transition-[width] duration-300 ease-out" style={progressFillStyle} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-foreground-muted">Resets {resetTime}</p>
        {exhausted ? (
          <span className="rounded-full border border-status-error/40 bg-status-error/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-status-error">
            Limit reached
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function UsageSection({ workspaceId, isOpen }: UsageSectionProps) {
  const { data: organization, isLoading, isError, error, refetch } = useOrganization(workspaceId)
  const usage = readUsageSnapshot(organization)

  const weeklyExhausted = Boolean(usage && usage.weekly.usedCents >= usage.weekly.limitCents)
  const monthlyExhausted = Boolean(usage && usage.monthly.usedCents >= usage.monthly.limitCents)
  const resetAt = usage?.isOutOfUsage ? resolveResetAt(usage) : null

  return (
    <section
      className="space-y-4 rounded-xl border border-outline bg-editor/60 p-4 sm:p-5"
      data-testid="organization-usage-section"
    >
      {isLoading && isOpen ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-40 rounded-md bg-block-highlight animate-pulse" />
            <div className="h-7 rounded-full bg-block-highlight animate-pulse" />
            <div className="h-3 w-28 rounded-md bg-block-highlight animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-40 rounded-md bg-block-highlight animate-pulse" />
            <div className="h-7 rounded-full bg-block-highlight animate-pulse" />
            <div className="h-3 w-28 rounded-md bg-block-highlight animate-pulse" />
          </div>
        </div>
      ) : isError ? (
        <div className="space-y-2 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error">
          <p>{error instanceof Error ? error.message : 'Unable to load usage.'}</p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : usage ? (
        <>
          <div className="divide-y divide-outline/70">
            <UsageLimitRow
              label="Weekly usage limit"
              usedPercent={usage.weekly.percent}
              periodEndUtc={usage.weekly.periodEndUtc}
              exhausted={weeklyExhausted}
            />
            <UsageLimitRow
              label="Monthly usage limit"
              usedPercent={usage.monthly.percent}
              periodEndUtc={usage.monthly.periodEndUtc}
              exhausted={monthlyExhausted}
            />
          </div>

          {usage.isOutOfUsage ? (
            <div
              className="space-y-1 rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2"
              data-testid="organization-usage-blocked"
            >
              <p className="text-xs font-medium text-status-error">Out of usage right now.</p>
              <p className="text-xs text-status-error">
                {resetAt
                  ? `You can run agents again after ${formatResetTime(resetAt)}.`
                  : 'You can run agents again when the current usage window resets.'}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-md border border-dashed border-outline bg-canvas px-3 py-2 text-xs text-foreground-muted">
          Usage data is not available yet.
        </div>
      )}
    </section>
  )
}
