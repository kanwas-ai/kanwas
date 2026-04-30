import type PostHogService from '#services/posthog_service'
import { createSpanId, type TraceContext, type TraceIdentity } from './posthog.js'

type StepLike = {
  toolCalls?: unknown[]
  toolResults?: unknown[]
}

type ToolCallLike = {
  toolName?: string
  name?: string
  toolCallId?: string
  id?: string
  input?: unknown
  args?: unknown
  arguments?: unknown
}

type ToolResultLike = {
  output?: unknown
  isError?: boolean
  error?: unknown
  errorText?: unknown
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }

  return null
}

function toToolCall(value: unknown): ToolCallLike {
  const obj = asObject(value)
  if (!obj) {
    return {}
  }

  return {
    toolName: typeof obj.toolName === 'string' ? obj.toolName : undefined,
    name: typeof obj.name === 'string' ? obj.name : undefined,
    toolCallId: typeof obj.toolCallId === 'string' ? obj.toolCallId : undefined,
    id: typeof obj.id === 'string' ? obj.id : undefined,
    input: obj.input,
    args: obj.args,
    arguments: obj.arguments,
  }
}

function toToolResult(value: unknown): ToolResultLike {
  const obj = asObject(value)
  if (!obj) {
    return {}
  }

  return {
    output: obj.output,
    isError: typeof obj.isError === 'boolean' ? obj.isError : undefined,
    error: obj.error,
    errorText: obj.errorText,
  }
}

function getToolError(result: ToolResultLike): string | undefined {
  if (typeof result.errorText === 'string' && result.errorText.length > 0) {
    return result.errorText
  }

  if (typeof result.error === 'string' && result.error.length > 0) {
    return result.error
  }

  if (result.error instanceof Error) {
    return result.error.message
  }

  return undefined
}

export function captureToolCallSpansFromStep(params: {
  posthogService: PostHogService
  traceIdentity: TraceIdentity
  traceContext: TraceContext
  step: unknown
  stepIndex: number
  parentId?: string
  properties?: Record<string, unknown>
  skipToolNames?: string[]
}): void {
  const {
    posthogService,
    traceIdentity,
    traceContext,
    step: stepValue,
    stepIndex,
    properties,
    parentId,
    skipToolNames,
  } = params
  const skipped = new Set(skipToolNames ?? [])

  const step = (asObject(stepValue) ?? {}) as StepLike
  const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : []
  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : []

  for (const [toolIndex, toolCallValue] of toolCalls.entries()) {
    const toolCall = toToolCall(toolCallValue)
    const toolResult = toToolResult(toolResults[toolIndex])

    const toolName = toolCall.toolName ?? toolCall.name ?? 'unknown'
    if (skipped.has(toolName)) {
      continue
    }

    const toolCallId = toolCall.toolCallId ?? toolCall.id
    const spanId = toolCallId ?? createSpanId()
    const input = toolCall.input ?? toolCall.args ?? toolCall.arguments
    const output = toolResult.output
    const isError = Boolean(toolResult.isError || toolResult.error || toolResult.errorText)
    const status: 'completed' | 'failed' = isError ? 'failed' : 'completed'
    const error = isError ? getToolError(toolResult) : undefined

    posthogService.captureAiSpan({
      ...traceIdentity,
      traceId: traceContext.traceId,
      sessionId: traceContext.sessionId,
      spanId,
      parentId: parentId ?? traceContext.activeParentSpanId,
      spanName: `tool:${toolName}`,
      status,
      input,
      output,
      isError,
      error,
      properties: {
        tool_name: toolName,
        tool_call_id: toolCallId,
        step_index: stepIndex,
        tool_index: toolIndex,
        ...properties,
      },
    })
  }
}

export function captureToolCallSpansFromSteps(params: {
  posthogService: PostHogService
  traceIdentity: TraceIdentity
  traceContext: TraceContext
  steps: unknown[]
  parentId?: string
  properties?: Record<string, unknown>
  skipToolNames?: string[]
}): void {
  const { posthogService, traceIdentity, traceContext, steps, properties, parentId, skipToolNames } = params

  for (const [stepIndex, stepValue] of steps.entries()) {
    captureToolCallSpansFromStep({
      posthogService,
      traceIdentity,
      traceContext,
      step: stepValue,
      stepIndex,
      parentId,
      properties,
      skipToolNames,
    })
  }
}
