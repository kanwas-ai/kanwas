import { createAnthropic } from '@ai-sdk/anthropic'
import type { ModelMessage } from 'ai'
import {
  ANTHROPIC_DEFAULT_MODEL_TIERS,
  ANTHROPIC_DEFAULT_SUBAGENT_MODEL_TIERS,
  isAnthropicAdaptiveThinkingModel,
} from 'shared/llm-config'
import type {
  AgentProviderCallOptions,
  AgentProviderMessageOptions,
  AgentProviderPromptOptions,
  ProviderConfig,
  ProviderGenerationOptionsInput,
  ProviderOverrideOptions,
} from './types.js'
import { normalizeModelOverride, resolveModelTiers } from './helpers.js'

export function createAnthropicProvider(apiKey: string, overrides: ProviderOverrideOptions = {}): ProviderConfig {
  const modelOverride = normalizeModelOverride(overrides.model)
  const modelTiers = resolveModelTiers(ANTHROPIC_DEFAULT_MODEL_TIERS, modelOverride)
  const anthropic = createAnthropic({ apiKey })

  return {
    name: 'anthropic',

    createModel(modelId: string) {
      return anthropic(modelId)
    },

    generationOptions(input: ProviderGenerationOptionsInput): AgentProviderCallOptions {
      if (!isAnthropicAdaptiveThinkingModel(input.modelId)) {
        return {}
      }

      return {
        anthropic: {
          thinking: { type: 'adaptive' as const },
        },
      }
    },

    promptOptions(): AgentProviderPromptOptions {
      return {
        anthropic: { cacheControl: { type: 'ephemeral' as const } },
      }
    },

    formatMessages(messages: ModelMessage[]): ModelMessage[] {
      if (messages.length === 0) return messages

      const result = [...messages]
      const lastIdx = result.length - 1
      const currentProviderOptions = (
        result[lastIdx] as ModelMessage & {
          providerOptions?: AgentProviderMessageOptions
        }
      ).providerOptions

      result[lastIdx] = {
        ...result[lastIdx],
        providerOptions: {
          ...(currentProviderOptions || {}),
          anthropic: {
            ...(currentProviderOptions?.anthropic || {}),
            cacheControl: { type: 'ephemeral' },
          },
        },
      } as ModelMessage

      return result
    },

    supportsThinking: true,
    supportsCaching: true,
    supportsNativeTools: true,

    modelTiers,
    subagentModelTiers: ANTHROPIC_DEFAULT_SUBAGENT_MODEL_TIERS,
  }
}
