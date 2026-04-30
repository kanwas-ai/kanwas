import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import Organization from '#models/organization'
import OrganizationUsagePeriod, { type OrganizationUsagePeriodType } from '#models/organization_usage_period'
import PostHogUsageQueryService, { PostHogUsageQueryError } from '#services/posthog_usage_query_service'
import { ContextualLogger } from '#services/contextual_logger'
import organizationUsageConfig from '#config/organization_usage'
import { toError } from '#services/error_utils'
import {
  resolveOrganizationUsageWindows,
  type OrganizationUsageWindow,
  type OrganizationUsageWindows,
} from '#services/organization_usage_periods'

export interface UsagePeriodSnapshot {
  usedCents: number
  limitCents: number
  remainingCents: number
  percent: number
  periodStartUtc: DateTime
  periodEndUtc: DateTime
}

export interface OrganizationUsageSnapshot {
  weekly: UsagePeriodSnapshot
  monthly: UsagePeriodSnapshot
  isOutOfUsage: boolean
  lastSyncedAt: DateTime | null
}

export interface OrganizationUsageLimitGateResult {
  blocked: boolean
  reason: 'within_limits' | 'missing_snapshot' | 'stale_snapshot' | 'over_limit'
  blockedPeriodTypes: OrganizationUsagePeriodType[]
  resetAtUtc: DateTime | null
  message: string | null
  usage: OrganizationUsageSnapshot
}

@inject()
export default class OrganizationUsageService {
  private readonly logger = ContextualLogger.createFallback({ component: 'OrganizationUsageService' })
  private readonly staleCutoffMinutes = organizationUsageConfig.staleCutoffMinutes

  constructor(private readonly postHogUsageQueryService: PostHogUsageQueryService) {}

  async getCurrentUsageSnapshot(
    organization: Organization,
    now: DateTime = DateTime.utc()
  ): Promise<OrganizationUsageSnapshot> {
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)
    const rowsByType = await this.loadCurrentRows(organization.id, windows)
    return this.buildSnapshot(organization, windows, rowsByType)
  }

  async evaluateLimitGate(
    organization: Organization,
    now: DateTime = DateTime.utc()
  ): Promise<OrganizationUsageLimitGateResult> {
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)
    const rowsByType = await this.loadCurrentRows(organization.id, windows)
    const usage = this.buildSnapshot(organization, windows, rowsByType)

    const weeklyRow = rowsByType.get('weekly_7d')
    const monthlyRow = rowsByType.get('monthly_billing_cycle')

    if (!weeklyRow || !monthlyRow) {
      return {
        blocked: false,
        reason: 'missing_snapshot',
        blockedPeriodTypes: [],
        resetAtUtc: null,
        message: null,
        usage,
      }
    }

    if (this.isStale(weeklyRow, now) || this.isStale(monthlyRow, now)) {
      return {
        blocked: false,
        reason: 'stale_snapshot',
        blockedPeriodTypes: [],
        resetAtUtc: null,
        message: null,
        usage,
      }
    }

    const blockedPeriodTypes: OrganizationUsagePeriodType[] = []

    if (weeklyRow.totalCostCents >= organization.weeklyLimitCents) {
      blockedPeriodTypes.push('weekly_7d')
    }

    if (monthlyRow.totalCostCents >= organization.monthlyLimitCents) {
      blockedPeriodTypes.push('monthly_billing_cycle')
    }

    if (blockedPeriodTypes.length === 0) {
      return {
        blocked: false,
        reason: 'within_limits',
        blockedPeriodTypes,
        resetAtUtc: null,
        message: null,
        usage,
      }
    }

    const blockedWindowEnds = blockedPeriodTypes.map((periodType) => {
      return periodType === 'weekly_7d' ? windows.weekly.periodEndUtc : windows.monthly.periodEndUtc
    })
    const resetAtUtc = blockedWindowEnds.reduce(
      (latest, current) => {
        if (!latest || current.toMillis() > latest.toMillis()) {
          return current
        }

        return latest
      },
      null as DateTime | null
    )

    return {
      blocked: true,
      reason: 'over_limit',
      blockedPeriodTypes,
      resetAtUtc,
      message: this.buildBlockedMessage(blockedPeriodTypes, resetAtUtc),
      usage,
    }
  }

  async syncCurrentUsagePeriodsForOrganization(params: {
    organizationId: string
    invocationId?: string
    now?: DateTime
  }): Promise<void> {
    if (!this.postHogUsageQueryService.isConfigured()) {
      this.logger.warn(
        {
          operation: 'organization_usage_sync_skipped',
          reason: 'posthog_query_api_not_configured',
          organizationId: params.organizationId,
          invocationId: params.invocationId,
        },
        'Skipping organization usage sync'
      )
      return
    }

    const organization = await Organization.find(params.organizationId)
    if (!organization) {
      this.logger.warn(
        {
          operation: 'organization_usage_sync_skipped',
          reason: 'organization_not_found',
          organizationId: params.organizationId,
          invocationId: params.invocationId,
        },
        'Skipping organization usage sync'
      )
      return
    }

    const now = params.now?.toUTC() ?? DateTime.utc()
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)
    const periodWindows: OrganizationUsageWindow[] = [windows.weekly, windows.monthly]

    for (const periodWindow of periodWindows) {
      try {
        const totalCostCents = await this.postHogUsageQueryService.queryOrganizationPeriodTotalCents({
          organizationId: organization.id,
          organizationGroupKey: organization.id,
          periodType: periodWindow.periodType,
          periodStartUtc: periodWindow.periodStartUtc,
          periodEndUtc: periodWindow.periodEndUtc,
          invocationId: params.invocationId,
        })

        await OrganizationUsagePeriod.updateOrCreate(
          {
            organizationId: organization.id,
            periodType: periodWindow.periodType,
            periodStartUtc: periodWindow.periodStartUtc,
          },
          {
            periodEndUtc: periodWindow.periodEndUtc,
            totalCostCents,
            syncedAt: now,
          }
        )
      } catch (error) {
        const categorizedError = error instanceof PostHogUsageQueryError ? error.category : 'unknown'
        this.logger.error(
          {
            operation: 'organization_usage_sync_failed',
            organizationId: organization.id,
            invocationId: params.invocationId,
            periodType: periodWindow.periodType,
            periodStartUtc: periodWindow.periodStartUtc.toISO(),
            periodEndUtc: periodWindow.periodEndUtc.toISO(),
            category: categorizedError,
            err: toError(error),
          },
          'Failed to sync organization usage period'
        )
      }
    }
  }

  private async loadCurrentRows(
    organizationId: string,
    windows: OrganizationUsageWindows
  ): Promise<Map<OrganizationUsagePeriodType, OrganizationUsagePeriod>> {
    const rows = await OrganizationUsagePeriod.query()
      .where('organization_id', organizationId)
      .where((query) => {
        query
          .where((weeklyQuery) => {
            weeklyQuery
              .where('period_type', windows.weekly.periodType)
              .where('period_start_utc', windows.weekly.periodStartUtc.toJSDate())
          })
          .orWhere((monthlyQuery) => {
            monthlyQuery
              .where('period_type', windows.monthly.periodType)
              .where('period_start_utc', windows.monthly.periodStartUtc.toJSDate())
          })
      })

    const rowsByType = new Map<OrganizationUsagePeriodType, OrganizationUsagePeriod>()
    for (const row of rows) {
      rowsByType.set(row.periodType, row)
    }

    return rowsByType
  }

  private buildSnapshot(
    organization: Organization,
    windows: OrganizationUsageWindows,
    rowsByType: Map<OrganizationUsagePeriodType, OrganizationUsagePeriod>
  ): OrganizationUsageSnapshot {
    const weeklyRow = rowsByType.get('weekly_7d') ?? null
    const monthlyRow = rowsByType.get('monthly_billing_cycle') ?? null

    const weekly = this.buildPeriodSnapshot(windows.weekly, organization.weeklyLimitCents, weeklyRow)
    const monthly = this.buildPeriodSnapshot(windows.monthly, organization.monthlyLimitCents, monthlyRow)
    const lastSyncedAt = this.resolveLastSyncedAt([weeklyRow, monthlyRow])

    return {
      weekly,
      monthly,
      isOutOfUsage:
        weekly.usedCents >= organization.weeklyLimitCents || monthly.usedCents >= organization.monthlyLimitCents,
      lastSyncedAt,
    }
  }

  private buildPeriodSnapshot(
    window: OrganizationUsageWindow,
    limitCents: number,
    usageRow: OrganizationUsagePeriod | null
  ): UsagePeriodSnapshot {
    const usedCents = usageRow?.totalCostCents ?? 0
    const remainingCents = Math.max(limitCents - usedCents, 0)
    const rawPercent = limitCents <= 0 ? (usedCents > 0 ? 100 : 0) : (usedCents / limitCents) * 100
    const percent = Math.min(100, Math.max(0, Math.round(rawPercent * 100) / 100))

    return {
      usedCents,
      limitCents,
      remainingCents,
      percent,
      periodStartUtc: window.periodStartUtc,
      periodEndUtc: window.periodEndUtc,
    }
  }

  private resolveLastSyncedAt(rows: Array<OrganizationUsagePeriod | null>): DateTime | null {
    return rows.reduce(
      (latest, current) => {
        if (!current?.syncedAt) {
          return latest
        }

        if (!latest || current.syncedAt.toMillis() > latest.toMillis()) {
          return current.syncedAt
        }

        return latest
      },
      null as DateTime | null
    )
  }

  private isStale(row: OrganizationUsagePeriod, now: DateTime): boolean {
    if (!row.syncedAt?.isValid) {
      return true
    }

    const elapsedMillis = now.toMillis() - row.syncedAt.toUTC().toMillis()
    const cutoffMillis = this.staleCutoffMinutes * 60 * 1000
    return elapsedMillis > cutoffMillis
  }

  private buildBlockedMessage(blockedPeriodTypes: OrganizationUsagePeriodType[], resetAtUtc: DateTime | null): string {
    const resetAtText = resetAtUtc ? resetAtUtc.toUTC().toFormat("yyyy-LL-dd HH:mm 'UTC'") : 'a later time'

    if (blockedPeriodTypes.length === 2) {
      return `Your organization has reached its weekly and monthly usage limits. Please try again after ${resetAtText}.`
    }

    if (blockedPeriodTypes[0] === 'monthly_billing_cycle') {
      return `Your organization has reached its monthly usage limit. Please try again after ${resetAtText}.`
    }

    return `Your organization has reached its weekly usage limit. Please try again after ${resetAtText}.`
  }
}
