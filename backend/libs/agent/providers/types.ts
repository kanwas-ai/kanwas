import type { AnthropicProviderOptions } from '@ai-sdk/anthropic'
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import type { LanguageModel, ModelMessage } from 'ai'
import type { ContextualLoggerContract } from '#contracts/contextual_logger'
import type { ModelTier, SubagentType } from '../types.js'
import type { LlmProviderName, OpenAIReasoningEffort } from 'shared/llm-config'

export type ProviderName = LlmProviderName
export type ProviderReasoningEffort = OpenAIReasoningEffort

type BaseProviderOptions = Record<string, Record<string, unknown>>

export type AgentProviderCallOptions = BaseProviderOptions & {
  anthropic?: AnthropicProviderOptions
  openai?: OpenAIResponsesProviderOptions
}

export type AgentProviderPromptOptions = BaseProviderOptions & {
  anthropic?: Pick<AnthropicProviderOptions, 'cacheControl'>
  openai?: Pick<OpenAIResponsesProviderOptions, 'promptCacheRetention'>
}

export type AgentProviderMessageOptions = BaseProviderOptions & {
  anthropic?: Pick<AnthropicProviderOptions, 'cacheControl'>
  openai?: {
    phase?: 'commentary' | 'final_answer'
  }
}

export type OpenAITextVerbosity = NonNullable<OpenAIResponsesProviderOptions['textVerbosity']>
export type OpenAIMessagePhase = NonNullable<NonNullable<AgentProviderMessageOptions['openai']>['phase']>

export interface ProviderOverrideOptions {
  model?: string
  reasoningEffort?: ProviderReasoningEffort
}

export interface ProviderRuntimeOptions {
  logger?: ContextualLoggerContract
}

export interface ProviderSelection {
  provider?: ProviderName
  model?: string
  reasoningEffort?: string
}

/** Describes the task shape so the provider can pick appropriate generation settings. */
export type FlowHint = 'execute' | 'plan' | 'explore' | 'external' | 'generate' | 'utility'

export interface ProviderGenerationOptionsInput {
  /** Concrete model ID for this call; some providers vary options by model capability. */
  modelId: string
  flowHint?: FlowHint
}

export interface ProviderConfig {
  /** Provider identifier */
  name: ProviderName
  /** Create a Vercel AI SDK model instance for the given model ID */
  createModel(modelId: string): LanguageModel
  /** Provider-specific generation options (e.g. thinking, effort, verbosity) */
  generationOptions(input: ProviderGenerationOptionsInput): AgentProviderCallOptions
  /** Provider-specific per-system-prompt-block metadata (e.g. cache control) */
  promptOptions(): AgentProviderPromptOptions
  /** Transform conversation messages before sending (e.g. cache breakpoints, phase annotations) */
  formatMessages(messages: ModelMessage[]): ModelMessage[]
  /** Whether the provider supports extended/adaptive thinking (reasoning chunks in streaming) */
  supportsThinking: boolean
  /** Whether the provider supports prompt caching (reduces cost for repeated system prompts) */
  supportsCaching: boolean
  /** Whether the provider supports native tool types (e.g. Anthropic bash_20250124, OpenAI shell).
   *  When false, standard JSON-schema tools are used instead. */
  supportsNativeTools: boolean
  /** Map abstract model tiers to concrete model IDs */
  modelTiers: Record<ModelTier, string>
  /** Default abstract model tier for each subagent role */
  subagentModelTiers: Record<SubagentType, ModelTier>
}
