import { randomUUID } from 'node:crypto'
import type { Context } from '../types.js'

export interface TraceContext {
  traceId: string
  sessionId: string
  activeParentSpanId?: string
  subagentId?: string
  toolCallId?: string
}

export interface TraceIdentity {
  distinctId: string
  workspaceId: string
  organizationId: string
  invocationId: string
  correlationId: string
}

export function createRootTraceContext(invocationId: string, sessionId: string): TraceContext {
  return {
    traceId: invocationId,
    sessionId,
  }
}

export function createSubagentTraceContext(params: {
  parent: TraceContext
  subagentId: string
  subagentSpanId: string
  toolCallId?: string
}): TraceContext {
  return {
    ...params.parent,
    activeParentSpanId: params.subagentSpanId,
    subagentId: params.subagentId,
    toolCallId: params.toolCallId,
  }
}

export function withToolCallTraceContext(traceContext: TraceContext, toolCallId: string | undefined): TraceContext {
  if (!toolCallId) {
    return traceContext
  }

  return {
    ...traceContext,
    toolCallId,
  }
}

export function buildTraceIdentity(context: Context): TraceIdentity {
  return {
    distinctId: context.userId,
    workspaceId: context.workspaceId,
    organizationId: context.organizationId,
    invocationId: context.invocationId,
    correlationId: context.correlationId,
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function createSpanId(): string {
  return randomUUID()
}
