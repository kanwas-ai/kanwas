import type { OrganizationUsagePeriodType } from '#models/organization_usage_period'
import { ContextualLogger } from '#services/contextual_logger'
import organizationUsageConfig from '#config/organization_usage'
import env from '#start/env'
import { DateTime } from 'luxon'

const DEFAULT_MAX_RETRIES = 2
const RETRY_BACKOFF_BASE_MS = 250

const {
  host: POSTHOG_HOST,
  projectId: POSTHOG_PROJECT_ID,
  organizationGroupTypeIndex,
  queryTimeoutMs,
} = organizationUsageConfig.posthog

export type PostHogUsageQueryErrorCategory = 'auth' | 'timeout' | 'rate_limit' | 'query_validation'

export class PostHogUsageQueryError extends Error {
  constructor(
    public readonly category: PostHogUsageQueryErrorCategory,
    message: string,
    public readonly metadata: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'PostHogUsageQueryError'
  }
}

export interface OrganizationUsageQueryParams {
  organizationId: string
  organizationGroupKey: string
  periodType: OrganizationUsagePeriodType
  periodStartUtc: DateTime
  periodEndUtc: DateTime
  invocationId?: string
}

function formatUtcForHogQL(value: DateTime): string {
  return value.toUTC().toFormat('yyyy-LL-dd HH:mm:ss.SSS')
}

function resolveOrganizationGroupColumn(groupTypeIndex: number | null | undefined): string {
  if (typeof groupTypeIndex !== 'number' || !Number.isInteger(groupTypeIndex) || groupTypeIndex < 0) {
    return `$group_${organizationGroupTypeIndex}`
  }

  return `$group_${groupTypeIndex}`
}

export function escapeHogqlStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/'/g, "\\'")
}

export function buildOrganizationUsageHogqlQuery(params: {
  organizationGroupKey: string
  organizationGroupColumn?: string
  periodStartUtc: DateTime
  periodEndUtc: DateTime
}): string {
  const groupColumn = params.organizationGroupColumn ?? '$group_1'
  if (!/^\$group_\d+$/.test(groupColumn)) {
    throw new Error('Invalid organization group column')
  }

  const organizationGroupKey = escapeHogqlStringLiteral(params.organizationGroupKey)
  const periodStartUtc = escapeHogqlStringLiteral(formatUtcForHogQL(params.periodStartUtc))
  const periodEndUtc = escapeHogqlStringLiteral(formatUtcForHogQL(params.periodEndUtc))

  return `SELECT coalesce(sum(toFloat(properties.$ai_total_cost_usd)), 0) AS total_usd FROM events WHERE event = '$ai_generation' AND notEmpty(${groupColumn}) AND ${groupColumn} = '${organizationGroupKey}' AND timestamp >= toDateTime64('${periodStartUtc}', 3, 'UTC') AND timestamp < toDateTime64('${periodEndUtc}', 3, 'UTC')`
}

export function usdToCentsHalfUp(totalUsd: number): number {
  if (!Number.isFinite(totalUsd)) {
    throw new Error('totalUsd must be a finite number')
  }

  const cents = Math.round((totalUsd + Number.EPSILON) * 100)
  return Math.max(0, cents)
}

function parseNumeric(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Non-finite numeric value in PostHog response')
    }

    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      throw new Error('Non-numeric string value in PostHog response')
    }

    return parsed
  }

  throw new Error('Unsupported PostHog numeric value type')
}

function extractTotalUsd(payload: unknown): number {
  if (!payload || typeof payload !== 'object') {
    throw new Error('PostHog response payload must be an object')
  }

  const value = payload as {
    results?: unknown
    result?: unknown
    columns?: unknown
  }

  const rows = Array.isArray(value.results) ? value.results : Array.isArray(value.result) ? value.result : null

  if (!rows || rows.length === 0) {
    return 0
  }

  const firstRow = rows[0]
  if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
    if ('total_usd' in firstRow) {
      return parseNumeric((firstRow as Record<string, unknown>).total_usd)
    }
  }

  if (Array.isArray(firstRow)) {
    const columns = Array.isArray(value.columns) ? value.columns : null
    const totalUsdIndex = columns ? columns.findIndex((column) => column === 'total_usd') : -1
    const firstValue = totalUsdIndex >= 0 ? firstRow[totalUsdIndex] : firstRow[0]
    return parseNumeric(firstValue)
  }

  throw new Error('Unable to extract total_usd from PostHog response')
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function shouldRetryError(error: PostHogUsageQueryError): boolean {
  return error.category === 'timeout' || error.category === 'rate_limit'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default class PostHogUsageQueryService {
  private readonly logger = ContextualLogger.createFallback({ component: 'PostHogUsageQueryService' })
  private readonly host = POSTHOG_HOST.replace(/\/+$/, '')
  private readonly projectId = POSTHOG_PROJECT_ID
  private readonly queryApiKey = env.get('POSTHOG_QUERY_API_KEY') ?? null
  private readonly organizationGroupColumn = resolveOrganizationGroupColumn(organizationGroupTypeIndex)
  private readonly timeoutMs = queryTimeoutMs
  private readonly maxRetries = DEFAULT_MAX_RETRIES

  isConfigured(): boolean {
    return Boolean(this.queryApiKey)
  }

  async queryOrganizationPeriodTotalCents(params: OrganizationUsageQueryParams): Promise<number> {
    if (!this.queryApiKey) {
      throw new PostHogUsageQueryError('query_validation', 'PostHog usage query API is not configured', {
        missingQueryApiKey: true,
      })
    }

    const query = buildOrganizationUsageHogqlQuery({
      organizationGroupKey: params.organizationGroupKey,
      organizationGroupColumn: this.organizationGroupColumn,
      periodStartUtc: params.periodStartUtc,
      periodEndUtc: params.periodEndUtc,
    })

    const endpoint = `${this.host}/api/projects/${encodeURIComponent(this.projectId)}/query/`
    const requestBody = {
      query: {
        kind: 'HogQLQuery',
        query,
      },
      name: 'org_usage_period_total',
    }

    let attempt = 0
    while (true) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            'Authorization': `Bearer ${this.queryApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '')
          const category: PostHogUsageQueryErrorCategory =
            response.status === 401 || response.status === 403
              ? 'auth'
              : response.status === 429
                ? 'rate_limit'
                : response.status >= 500
                  ? 'timeout'
                  : 'query_validation'

          const error = new PostHogUsageQueryError(category, `PostHog query failed with status ${response.status}`, {
            status: response.status,
            bodyText,
            endpoint,
          })

          if (attempt < this.maxRetries && isRetriableStatus(response.status) && shouldRetryError(error)) {
            attempt += 1
            await sleep(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1))
            continue
          }

          throw error
        }

        const payload = await response.json()
        const totalUsd = extractTotalUsd(payload)
        return usdToCentsHalfUp(totalUsd)
      } catch (error) {
        const timeoutLike =
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message.includes('fetch failed'))

        const wrappedError =
          error instanceof PostHogUsageQueryError
            ? error
            : new PostHogUsageQueryError(
                timeoutLike ? 'timeout' : 'query_validation',
                timeoutLike ? 'PostHog query timed out' : 'PostHog query failed unexpectedly',
                {
                  cause: error instanceof Error ? error.message : String(error),
                }
              )

        if (attempt < this.maxRetries && shouldRetryError(wrappedError)) {
          attempt += 1
          this.logger.warn(
            {
              operation: 'posthog_usage_query_retry',
              attempt,
              category: wrappedError.category,
              organizationId: params.organizationId,
              periodType: params.periodType,
              invocationId: params.invocationId,
            },
            'Retrying PostHog usage query'
          )
          await sleep(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1))
          continue
        }

        throw wrappedError
      }
    }
  }
}
