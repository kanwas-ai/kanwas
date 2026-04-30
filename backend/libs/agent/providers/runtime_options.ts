import { createHash } from 'node:crypto'
import type { AgentProviderCallOptions, ProviderName } from './types.js'

type RuntimeProviderOptionsInput = {
  providerName: ProviderName
  baseOptions?: AgentProviderCallOptions
  workspaceId?: string | null
  aiSessionId?: string | null
  modelId: string
  agentSource: 'main' | 'subagent'
  flowName?: string
  agentType?: string
}

export type OpenAIThreadContext = {
  laneId: string
  providerLaneKey: string
  headers: Record<string, string>
}

export function applyRuntimeProviderOptions(input: RuntimeProviderOptionsInput): AgentProviderCallOptions {
  const runtimeOptions = getRuntimeProviderOptions(input)
  return mergeProviderCallOptions(input.baseOptions ?? {}, runtimeOptions)
}

function getRuntimeProviderOptions(input: RuntimeProviderOptionsInput): AgentProviderCallOptions {
  if (input.providerName !== 'openai') {
    return {}
  }

  const threadContext = buildOpenAIThreadContext(input)
  if (!threadContext) {
    return {}
  }

  return {
    openai: {
      promptCacheKey: threadContext.providerLaneKey,
    },
  }
}

export function buildOpenAIThreadContext(input: RuntimeProviderOptionsInput): OpenAIThreadContext | undefined {
  const workspaceId = normalizeKeyPart(input.workspaceId)
  const aiSessionId = normalizeKeyPart(input.aiSessionId)

  if (!workspaceId || !aiSessionId) {
    return undefined
  }

  const parts = ['kanwas', `workspace:${workspaceId}`, `thread:${aiSessionId}`]

  const flowName = normalizeKeyPart(input.flowName)
  if (flowName) {
    parts.push(`flow:${flowName}`)
  }

  const laneId = buildLaneId(input, parts)
  const providerLaneKey = buildProviderLaneKey(laneId)

  return {
    laneId,
    providerLaneKey,
    headers: {
      'conversation_id': providerLaneKey,
      'session_id': providerLaneKey,
      'x-client-request-id': providerLaneKey,
    },
  }
}

function buildLaneId(input: RuntimeProviderOptionsInput, baseParts: string[]): string {
  if (input.agentSource === 'main') {
    return [...baseParts, 'lane:main'].join('|')
  }

  const agentType = normalizeKeyPart(input.agentType) ?? 'unknown'
  return [...baseParts, `lane:subagent:${agentType}`].join('|')
}

function normalizeKeyPart(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function buildProviderLaneKey(laneId: string): string {
  return `kwlane_v1_${createHash('sha256').update(laneId).digest('base64url')}`
}

function mergeProviderCallOptions(
  base: AgentProviderCallOptions,
  runtime: AgentProviderCallOptions
): AgentProviderCallOptions {
  const merged: AgentProviderCallOptions = { ...base }

  for (const [key, value] of Object.entries(runtime)) {
    const current = merged[key]

    if (isRecord(current) && isRecord(value)) {
      merged[key] = { ...current, ...value }
      continue
    }

    merged[key] = value as Record<string, unknown>
  }

  return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
