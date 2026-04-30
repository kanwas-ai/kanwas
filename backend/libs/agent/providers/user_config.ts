import agentConfig from '#config/agent'
import { resolveEffectiveLlmConfig, type LlmDefaultConfigFields } from '#services/llm_default_config_service'
import type { GlobalUserConfig } from '#services/user_config_service'
import { createProviderFromConfig } from './index.js'
import type { ProviderConfig, ProviderRuntimeOptions, ProviderSelection } from './types.js'
import {
  DEFAULT_LLM_PROVIDER,
  normalizeLlmModel,
  normalizeLlmProvider,
  normalizeOpenAIReasoningEffort,
  type LlmProviderName,
  type OpenAIReasoningEffort,
} from 'shared/llm-config'

type UserLlmConfigKey = 'llmProvider' | 'llmModel' | 'reasoningEffort'

const USER_LLM_CONFIG_KEYS = [
  'llmProvider',
  'llmModel',
  'reasoningEffort',
] as const satisfies readonly UserLlmConfigKey[]

export interface UserLlmConfigUpdates {
  llmProvider?: LlmProviderName | null
  llmModel?: string | null
  reasoningEffort?: OpenAIReasoningEffort | null
}

export class InvalidUserLlmConfigError extends Error {}

export function hasUserLlmOverrides(
  config: Pick<GlobalUserConfig, UserLlmConfigKey>,
  defaultConfig: LlmDefaultConfigFields = {}
): boolean {
  const selection = getProviderSelectionFromUserConfig(config, defaultConfig)
  return !!(selection.provider || selection.model || selection.reasoningEffort)
}

export function getProviderSelectionFromUserConfig(
  config: Pick<GlobalUserConfig, UserLlmConfigKey>,
  defaultConfig: LlmDefaultConfigFields = {}
): ProviderSelection {
  const effectiveConfig = resolveEffectiveLlmConfig(config, defaultConfig)
  const provider = normalizeLlmProvider(effectiveConfig.llmProvider)
  const model = normalizeLlmModel(effectiveConfig.llmModel)
  const reasoningEffort = resolveReasoningEffort(effectiveConfig.reasoningEffort, provider)

  return {
    provider,
    model,
    reasoningEffort,
  }
}

export function resolveProviderFromUserConfig(
  config: Pick<GlobalUserConfig, UserLlmConfigKey>,
  runtimeOptions: ProviderRuntimeOptions = {},
  defaultConfig: LlmDefaultConfigFields = {}
): ProviderConfig {
  return createProviderFromConfig(
    agentConfig,
    getProviderSelectionFromUserConfig(config, defaultConfig),
    runtimeOptions
  )
}

export function normalizeUserLlmConfigUpdates(
  input: Record<string, unknown>,
  currentConfig: Pick<GlobalUserConfig, UserLlmConfigKey> = {}
): UserLlmConfigUpdates {
  const unknownKeys = Object.keys(input).filter((key) => !USER_LLM_CONFIG_KEYS.includes(key as UserLlmConfigKey))

  if (unknownKeys.length > 0) {
    throw new InvalidUserLlmConfigError(`Unsupported LLM config fields: ${unknownKeys.join(', ')}`)
  }

  const updates: UserLlmConfigUpdates = {}

  if (Object.prototype.hasOwnProperty.call(input, 'llmProvider')) {
    updates.llmProvider = normalizeNullableProvider(input.llmProvider)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'llmModel')) {
    updates.llmModel = normalizeNullableModel(input.llmModel)
  } else if (didProviderChange(updates, currentConfig)) {
    updates.llmModel = null
  }

  if (Object.prototype.hasOwnProperty.call(input, 'reasoningEffort')) {
    updates.reasoningEffort = normalizeNullableReasoningEffort(
      input.reasoningEffort,
      resolveEffectiveProvider(updates, currentConfig)
    )
  } else if (
    didProviderChange(updates, currentConfig) &&
    resolveEffectiveProvider(updates, currentConfig) !== 'openai'
  ) {
    updates.reasoningEffort = null
  }

  return updates
}

function normalizeNullableProvider(value: unknown): LlmProviderName | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const provider = normalizeLlmProvider(value)
  if (!provider) {
    throw new InvalidUserLlmConfigError('Invalid provider. Use anthropic or openai.')
  }

  return provider
}

function normalizeNullableModel(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const model = normalizeLlmModel(value)
  if (!model) {
    throw new InvalidUserLlmConfigError('Invalid model override.')
  }

  return model
}

function normalizeNullableReasoningEffort(value: unknown, provider: LlmProviderName): OpenAIReasoningEffort | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (provider !== 'openai') {
    throw new InvalidUserLlmConfigError('Reasoning overrides are only supported for OpenAI.')
  }

  const reasoningEffort = normalizeOpenAIReasoningEffort(value)
  if (!reasoningEffort) {
    throw new InvalidUserLlmConfigError('Invalid OpenAI reasoning effort override.')
  }

  return reasoningEffort
}

function resolveEffectiveProvider(
  updates: UserLlmConfigUpdates,
  currentConfig: Pick<GlobalUserConfig, UserLlmConfigKey>
): LlmProviderName {
  if (updates.llmProvider !== undefined) {
    return updates.llmProvider ?? DEFAULT_LLM_PROVIDER
  }

  return normalizeLlmProvider(currentConfig.llmProvider) ?? DEFAULT_LLM_PROVIDER
}

function resolveReasoningEffort(value: unknown, provider?: LlmProviderName): OpenAIReasoningEffort | undefined {
  if ((provider ?? DEFAULT_LLM_PROVIDER) !== 'openai') {
    return undefined
  }

  return normalizeOpenAIReasoningEffort(value)
}

function didProviderChange(
  updates: UserLlmConfigUpdates,
  currentConfig: Pick<GlobalUserConfig, UserLlmConfigKey>
): boolean {
  if (updates.llmProvider === undefined) {
    return false
  }

  return updates.llmProvider !== (normalizeLlmProvider(currentConfig.llmProvider) ?? null)
}
