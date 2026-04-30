import { createSpanId, type TraceContext, type TraceIdentity } from './tracing/posthog.js'
import type { SandboxManager } from './sandbox/index.js'
import type PostHogService from '#services/posthog_service'

export function finishExecutionTrace(params: {
  posthogService: PostHogService
  traceIdentity: TraceIdentity
  traceContext: TraceContext
  traceStatus: 'completed' | 'failed' | 'cancelled'
  traceError: string | undefined
  traceInput: unknown
  traceOutput: unknown
  traceProperties?: Record<string, unknown>
}): void {
  const isError = params.traceStatus === 'failed'

  params.posthogService.captureAiTrace({
    ...params.traceIdentity,
    traceId: params.traceContext.traceId,
    sessionId: params.traceContext.sessionId,
    traceName: 'agent-execution',
    status: params.traceStatus,
    input: params.traceInput,
    isError,
    error: params.traceError,
    output: params.traceOutput,
    properties: params.traceProperties,
  })
}

export async function captureSandboxCostSpan(params: {
  sandboxManager: SandboxManager
  posthogService: PostHogService
  traceIdentity: TraceIdentity
  traceContext: TraceContext
}): Promise<void> {
  if (!params.sandboxManager?.isInitialized()) {
    return
  }

  try {
    const sandboxMetrics = await params.sandboxManager.getMetricsAndCost()
    if (!sandboxMetrics) {
      return
    }

    params.posthogService.captureAiSpan({
      ...params.traceIdentity,
      traceId: params.traceContext.traceId,
      sessionId: params.traceContext.sessionId,
      spanId: createSpanId(),
      parentId: params.traceContext.activeParentSpanId,
      spanName: 'sandbox-session-cost',
      status: 'completed',
      output: {
        cost: sandboxMetrics.totalCostUsd,
        duration: sandboxMetrics.durationSeconds,
      },
      properties: {
        cost_usd: sandboxMetrics.totalCostUsd,
        cost_source: 'e2b_sandbox',
        provider: 'e2b',
        duration_seconds: sandboxMetrics.durationSeconds,
        avg_cpu_percent: Math.round(sandboxMetrics.avgCpuPercent * 100) / 100,
        max_memory_mib: Math.round(sandboxMetrics.maxMemoryBytes / (1024 * 1024)),
        cpu_count: sandboxMetrics.cpuCount,
      },
    })
  } catch {
    // Don't fail agent execution for metrics collection errors.
  }
}
