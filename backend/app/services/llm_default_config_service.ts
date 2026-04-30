import LlmDefaultConfig from '#models/llm_default_config'
import {
  DEFAULT_LLM_PROVIDER,
  normalizeLlmModel,
  normalizeLlmProvider,
  normalizeReasoningEffortForProvider,
  type LlmProviderName,
  type OpenAIReasoningEffort,
} from 'shared/llm-config'

const SINGLETON_ID = 'global'
const LLM_DEFAULT_CONFIG_KEYS = ['llmProvider', 'llmModel'] as const

type LlmDefaultConfigKey = (typeof LLM_DEFAULT_CONFIG_KEYS)[number]

export interface LlmDefaultConfigFields {
  llmProvider?: LlmProviderName | null
  llmModel?: string | null
}

export interface LlmConfigFields extends LlmDefaultConfigFields {
  reasoningEffort?: OpenAIReasoningEffort | null
}

export class InvalidLlmDefaultConfigError extends Error {}

export default class LlmDefaultConfigService {
  async getConfig(): Promise<LlmDefaultConfigFields> {
    const row = await LlmDefaultConfig.find(SINGLETON_ID)
    return row ? serializeConfig(row) : {}
  }

  async updateConfig(input: Record<string, unknown>): Promise<LlmDefaultConfigFields> {
    let row = await LlmDefaultConfig.find(SINGLETON_ID)
    const existingConfig = row ? serializeConfig(row) : {}
    const updates = normalizeLlmDefaultConfigUpdates(input, existingConfig)

    if (!row && !hasStoredConfigValues(updates)) {
      return {}
    }

    if (!row) {
      row = await LlmDefaultConfig.create({
        id: SINGLETON_ID,
        llmProvider: updates.llmProvider ?? null,
        llmModel: updates.llmModel ?? null,
      })
    } else {
      if (updates.llmProvider !== undefined) {
        row.llmProvider = updates.llmProvider
      }

      if (updates.llmModel !== undefined) {
        row.llmModel = updates.llmModel
      }

      await row.save()
    }

    return serializeConfig(row)
  }
}

export function normalizeLlmDefaultConfigUpdates(
  input: Record<string, unknown>,
  currentConfig: LlmDefaultConfigFields = {}
): LlmDefaultConfigFields {
  const unknownKeys = Object.keys(input).filter((key) => !LLM_DEFAULT_CONFIG_KEYS.includes(key as LlmDefaultConfigKey))

  if (unknownKeys.length > 0) {
    throw new InvalidLlmDefaultConfigError(`Unsupported LLM default config fields: ${unknownKeys.join(', ')}`)
  }

  const updates: LlmDefaultConfigFields = {}

  if (Object.prototype.hasOwnProperty.call(input, 'llmProvider')) {
    updates.llmProvider = normalizeNullableProvider(input.llmProvider)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'llmModel')) {
    updates.llmModel = normalizeNullableModel(input.llmModel)
  } else if (didProviderChange(updates, currentConfig)) {
    updates.llmModel = null
  }

  return updates
}

export function resolveEffectiveLlmConfig(
  userConfig: LlmConfigFields = {},
  defaultConfig: LlmDefaultConfigFields = {}
): LlmConfigFields {
  const userProvider = normalizeLlmProvider(userConfig.llmProvider)
  const defaultProvider = normalizeLlmProvider(defaultConfig.llmProvider)
  const effectiveProvider = userProvider ?? defaultProvider
  const effectiveProviderForModel = effectiveProvider ?? DEFAULT_LLM_PROVIDER

  const userModel = normalizeLlmModel(userConfig.llmModel)
  const defaultModel = normalizeLlmModel(defaultConfig.llmModel)
  const defaultModelProvider = defaultModel ? (defaultProvider ?? DEFAULT_LLM_PROVIDER) : undefined
  const inheritedModel = defaultModel && effectiveProviderForModel === defaultModelProvider ? defaultModel : undefined

  return {
    llmProvider: effectiveProvider,
    llmModel: userModel ?? inheritedModel,
    reasoningEffort: normalizeReasoningEffortForProvider(userConfig.reasoningEffort, effectiveProvider),
  }
}

function normalizeNullableProvider(value: unknown): LlmProviderName | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const provider = normalizeLlmProvider(value)
  if (!provider) {
    throw new InvalidLlmDefaultConfigError('Invalid provider. Use anthropic or openai.')
  }

  return provider
}

function normalizeNullableModel(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const model = normalizeLlmModel(value)
  if (!model) {
    throw new InvalidLlmDefaultConfigError('Invalid model override.')
  }

  return model
}

function didProviderChange(updates: LlmDefaultConfigFields, currentConfig: LlmDefaultConfigFields): boolean {
  if (updates.llmProvider === undefined) {
    return false
  }

  return updates.llmProvider !== (normalizeLlmProvider(currentConfig.llmProvider) ?? null)
}

function hasStoredConfigValues(config: LlmDefaultConfigFields): boolean {
  return Object.values(config).some((value) => value !== null && value !== undefined)
}

function serializeConfig(row: LlmDefaultConfig): LlmDefaultConfigFields {
  const config: LlmDefaultConfigFields = {}

  if (row.llmProvider) {
    config.llmProvider = row.llmProvider
  }

  if (row.llmModel) {
    config.llmModel = row.llmModel
  }

  return config
}
