import { createOpenAI } from '@ai-sdk/openai'
import type { ModelMessage } from 'ai'
import {
  OPENAI_DEFAULT_MODEL_TIERS,
  OPENAI_DEFAULT_SUBAGENT_MODEL_TIERS,
  normalizeOpenAIReasoningEffort,
  normalizeOpenAIServiceTier,
  type OpenAIReasoningEffort,
} from 'shared/llm-config'
import type {
  AgentProviderCallOptions,
  AgentProviderMessageOptions,
  AgentProviderPromptOptions,
  FlowHint,
  OpenAIMessagePhase,
  OpenAITextVerbosity,
  ProviderConfig,
  ProviderGenerationOptionsInput,
  ProviderOverrideOptions,
  ProviderRuntimeOptions,
} from './types.js'
import { normalizeModelOverride, resolveModelTiers } from './helpers.js'
import { createOpenAILoggingFetch } from './openai_logging.js'

const HINT_SETTINGS: Record<
  Exclude<FlowHint, 'utility'>,
  { effort: OpenAIReasoningEffort; verbosity: OpenAITextVerbosity }
> = {
  execute: { effort: 'high', verbosity: 'low' },
  plan: { effort: 'high', verbosity: 'low' },
  explore: { effort: 'high', verbosity: 'low' },
  external: { effort: 'medium', verbosity: 'low' },
  generate: { effort: 'xhigh', verbosity: 'low' },
}

const DEFAULT_SETTINGS: { effort: OpenAIReasoningEffort; verbosity: OpenAITextVerbosity } = {
  effort: 'high',
  verbosity: 'low',
}
const OPENAI_REASONING_SUMMARY = 'auto' as const

const OPENAI_GENERATION_OPTIONS = {
  store: false,
  instructions: 'Follow the system messages provided in the conversation.',
} as const

/**
 * Returns true when the baseURL points to a local/third-party OpenAI-compatible
 * server (e.g. LM Studio, Ollama, llama.cpp) rather than api.openai.com.
 */
function isCompatibilityMode(baseURL?: string): boolean {
  if (!baseURL) return false
  try {
    const url = new URL(baseURL)
    return url.hostname !== 'api.openai.com'
  } catch {
    return false
  }
}

export function createOpenAIProvider(
  apiKey: string,
  overrides: ProviderOverrideOptions = {},
  runtimeOptions: ProviderRuntimeOptions = {},
  baseURL?: string
): ProviderConfig {
  const modelOverride = normalizeModelOverride(overrides.model)
  const reasoningEffortOverride = normalizeOpenAIReasoningEffort(overrides.reasoningEffort)
  const serviceTierOverride = normalizeOpenAIServiceTier(overrides.serviceTier)
  const modelTiers = resolveModelTiers(OPENAI_DEFAULT_MODEL_TIERS, modelOverride)
  const compatMode = isCompatibilityMode(baseURL)

  const customFetch = runtimeOptions.logger ? createOpenAILoggingFetch(runtimeOptions.logger) : undefined

  const openai = createOpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(customFetch ? { fetch: customFetch } : {}),
  })

  return {
    name: 'openai',

    createModel(modelId: string) {
      // OpenAI Responses API is only available on api.openai.com.
      // For local/compatible servers (LM Studio, Ollama, etc.) use the
      // standard Chat Completions endpoint instead.
      return compatMode ? openai.chat(modelId) : openai.responses(modelId)
    },

    generationOptions(input: ProviderGenerationOptionsInput): AgentProviderCallOptions {
      // Reasoning-effort and extended generation options are OpenAI-only.
      // Skip them in compatibility mode to avoid 400 errors from local servers.
      if (compatMode) {
        return {}
      }

      const flowHint = input.flowHint
      if (flowHint === 'utility') {
        return {
          openai: {
            ...(reasoningEffortOverride ? { reasoningEffort: reasoningEffortOverride } : {}),
            ...(serviceTierOverride ? { serviceTier: serviceTierOverride } : {}),
            textVerbosity: 'medium',
            ...OPENAI_GENERATION_OPTIONS,
          },
        }
      }
      const settings = flowHint ? HINT_SETTINGS[flowHint] : DEFAULT_SETTINGS
      const resolvedReasoningEffort = reasoningEffortOverride ?? settings.effort
      return {
        openai: {
          reasoningEffort: resolvedReasoningEffort,
          ...(resolvedReasoningEffort !== 'none' ? { reasoningSummary: OPENAI_REASONING_SUMMARY } : {}),
          ...(serviceTierOverride ? { serviceTier: serviceTierOverride } : {}),
          textVerbosity: settings.verbosity,
          ...OPENAI_GENERATION_OPTIONS,
        },
      }
    },

    promptOptions(): AgentProviderPromptOptions {
      return {
        openai: { promptCacheRetention: '24h' },
      }
    },

    formatMessages(messages: ModelMessage[]): ModelMessage[] {
      if (messages.length === 0) return messages

      const result = [...messages]

      // Find the last assistant message and mark it as final_answer.
      // All earlier assistant messages get phase: 'commentary'.
      // This prevents the model from treating preambles as final answers and stopping early.
      let lastAssistantIdx = -1
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].role === 'assistant') {
          lastAssistantIdx = i
          break
        }
      }

      for (let i = 0; i < result.length; i++) {
        if (result[i].role !== 'assistant') continue

        const phase: OpenAIMessagePhase = i === lastAssistantIdx ? 'final_answer' : 'commentary'
        const existing = (result[i] as ModelMessage & { providerOptions?: AgentProviderMessageOptions }).providerOptions
        result[i] = {
          ...result[i],
          providerOptions: {
            ...(existing || {}),
            openai: {
              ...(existing?.openai || {}),
              phase,
            },
          },
        } as ModelMessage
      }

      return result
    },

    supportsThinking: !compatMode,
    supportsCaching: !compatMode,
    supportsNativeTools: true,

    modelTiers,
    subagentModelTiers: OPENAI_DEFAULT_SUBAGENT_MODEL_TIERS,
  }
}
