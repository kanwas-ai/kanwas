import { DateTime } from 'luxon'
import type { OrganizationUsagePeriodType } from '#models/organization_usage_period'

const WEEK_IN_MILLISECONDS = 7 * 24 * 60 * 60 * 1000

export interface OrganizationUsageWindow {
  periodType: OrganizationUsagePeriodType
  periodStartUtc: DateTime
  periodEndUtc: DateTime
}

export interface OrganizationUsageWindows {
  weekly: OrganizationUsageWindow
  monthly: OrganizationUsageWindow
}

function assertValidUtcTimestamp(value: DateTime, field: string): DateTime {
  const normalized = value.toUTC()

  if (!normalized.isValid) {
    throw new Error(`Invalid DateTime for ${field}`)
  }

  return normalized
}

export function resolveWeeklyUsageWindow(
  anchorUtc: DateTime,
  timestampUtc: DateTime = DateTime.utc()
): OrganizationUsageWindow {
  const normalizedAnchor = assertValidUtcTimestamp(anchorUtc, 'anchorUtc')
  const normalizedTimestamp = assertValidUtcTimestamp(timestampUtc, 'timestampUtc')

  const elapsedMilliseconds = normalizedTimestamp.toMillis() - normalizedAnchor.toMillis()
  const bucketOffset = Math.floor(elapsedMilliseconds / WEEK_IN_MILLISECONDS)
  const periodStartUtc = normalizedAnchor.plus({ milliseconds: bucketOffset * WEEK_IN_MILLISECONDS })
  const periodEndUtc = periodStartUtc.plus({ days: 7 })

  return {
    periodType: 'weekly_7d',
    periodStartUtc,
    periodEndUtc,
  }
}

export function resolveMonthlyBillingCycleWindow(
  anchorUtc: DateTime,
  timestampUtc: DateTime = DateTime.utc()
): OrganizationUsageWindow {
  const normalizedAnchor = assertValidUtcTimestamp(anchorUtc, 'anchorUtc')
  const normalizedTimestamp = assertValidUtcTimestamp(timestampUtc, 'timestampUtc')

  let monthOffset =
    (normalizedTimestamp.year - normalizedAnchor.year) * 12 + (normalizedTimestamp.month - normalizedAnchor.month)

  let periodStartUtc = normalizedAnchor.plus({ months: monthOffset })
  if (normalizedTimestamp < periodStartUtc) {
    monthOffset -= 1
    periodStartUtc = normalizedAnchor.plus({ months: monthOffset })
  }

  // Compute period end from the original anchor + offset to avoid gaps for short-month anchors.
  // Example: Jan 31 anchor -> Feb 28 start should end at Mar 31 (not Mar 28).
  const periodEndUtc = normalizedAnchor.plus({ months: monthOffset + 1 })

  return {
    periodType: 'monthly_billing_cycle',
    periodStartUtc,
    periodEndUtc,
  }
}

export function resolveOrganizationUsageWindows(
  anchorUtc: DateTime,
  timestampUtc: DateTime = DateTime.utc()
): OrganizationUsageWindows {
  return {
    weekly: resolveWeeklyUsageWindow(anchorUtc, timestampUtc),
    monthly: resolveMonthlyBillingCycleWindow(anchorUtc, timestampUtc),
  }
}
