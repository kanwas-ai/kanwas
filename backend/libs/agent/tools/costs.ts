import { createSpanId, withToolCallTraceContext } from '../tracing/posthog.js'
import type { ToolContext } from './context.js'

/**
 * Cost information for external API calls
 */
export interface ToolCostInfo {
  /** Cost in USD per request */
  cost: number
  /** Source identifier for analytics (e.g., 'parallel_search') */
  source: string
}

/**
 * Per-request costs for Parallel.ai API calls
 * Used for PostHog AI span cost tracking
 *
 * Pricing (as of Dec 2024):
 * - Search: $5.00 per 1,000 requests = $0.005/request
 * - Extract: $1.00 per 1,000 results = $0.001/request
 */
export const PARALLEL_COSTS: Record<string, ToolCostInfo> = {
  web_search: { cost: 0.005, source: 'parallel_search' },
  web_fetch: { cost: 0.001, source: 'parallel_extract' },
}

/**
 * E2B sandbox pricing (as of Dec 2024)
 * https://e2b.dev/docs/sandbox/metrics
 *
 * CPU pricing per vCPU:
 * - 1 vCPU: $0.000014/s
 * - 2 vCPU (default): $0.000028/s
 * - etc.
 *
 * Memory pricing:
 * - $0.0000045/GiB/s
 *
 * Storage: Free for Hobby/Pro plans (10-20 GiB)
 */
export const E2B_PRICING = {
  /** Cost per vCPU per second ($0.000014/s per vCPU) */
  CPU_PER_VCPU_PER_SECOND: 0.000014,
  /** Cost per GiB of memory per second */
  MEMORY_PER_GIB_PER_SECOND: 0.0000045,
}

export function emitToolCostSpan(params: {
  context: ToolContext
  toolName: string
  toolCallId?: string
  costUsd: number
  costSource: string
  properties?: Record<string, unknown>
}): void {
  const { context } = params
  const traceIdentity = context.traceIdentity
  const traceContext = withToolCallTraceContext(context.traceContext, params.toolCallId)

  context.posthogService.captureAiSpan({
    ...traceIdentity,
    traceId: traceContext.traceId,
    sessionId: traceContext.sessionId,
    spanId: createSpanId(),
    parentId: traceContext.activeParentSpanId,
    spanName: `${params.toolName}-cost`,
    status: 'completed',
    output: {
      costUsd: params.costUsd,
      costSource: params.costSource,
    },
    properties: {
      tool_name: params.toolName,
      tool_call_id: traceContext.toolCallId,
      subagent_id: traceContext.subagentId,
      cost_usd: params.costUsd,
      cost_source: params.costSource,
      ...params.properties,
    },
  })
}
