export type LlmProviderName = 'anthropic' | 'openai'
export type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type LlmModelTier = 'small' | 'medium' | 'big'
export type LlmSubagentType = 'explore' | 'external'
export type ThinkingMode = 'adaptive'

export interface ProviderExecutionDefaults {
  modelId: string
  reasoningEffort?: OpenAIReasoningEffort
  thinkingMode?: ThinkingMode
}

export interface LlmProviderDefaults {
  main: ProviderExecutionDefaults
  explore: ProviderExecutionDefaults
  external: ProviderExecutionDefaults
}

export interface LlmProviderMetadata {
  label: string
  adminLabel: string
  supportsReasoningEffortOverride: boolean
  reasoningEffortOptions: readonly OpenAIReasoningEffort[]
  defaults: LlmProviderDefaults
}

export const DEFAULT_LLM_PROVIDER: LlmProviderName = 'openai'

export const OPENAI_REASONING_EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

export const OPENAI_DEFAULT_MODEL_TIERS: Record<LlmModelTier, string> = {
  small: 'gpt-5.4-mini',
  medium: 'gpt-5.4',
  big: 'gpt-5.4',
}

export const OPENAI_DEFAULT_SUBAGENT_MODEL_TIERS: Record<LlmSubagentType, LlmModelTier> = {
  explore: 'small',
  external: 'medium',
}

export const ANTHROPIC_DEFAULT_MODEL_TIERS: Record<LlmModelTier, string> = {
  small: 'claude-haiku-4-5',
  medium: 'claude-sonnet-4-6',
  big: 'claude-opus-4-6',
}

export const ANTHROPIC_DEFAULT_SUBAGENT_MODEL_TIERS: Record<LlmSubagentType, LlmModelTier> = {
  explore: 'medium',
  external: 'medium',
}

export const LLM_PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
] as const

export const LLM_PROVIDER_METADATA: Record<LlmProviderName, LlmProviderMetadata> = {
  anthropic: {
    label: 'Anthropic',
    adminLabel: 'Anthropic',
    supportsReasoningEffortOverride: false,
    reasoningEffortOptions: [],
    defaults: {
      main: { modelId: ANTHROPIC_DEFAULT_MODEL_TIERS.big, thinkingMode: 'adaptive' },
      explore: { modelId: ANTHROPIC_DEFAULT_MODEL_TIERS.medium, thinkingMode: 'adaptive' },
      external: { modelId: ANTHROPIC_DEFAULT_MODEL_TIERS.medium, thinkingMode: 'adaptive' },
    },
  },
  openai: {
    label: 'OpenAI',
    adminLabel: 'OpenAI',
    supportsReasoningEffortOverride: true,
    reasoningEffortOptions: OPENAI_REASONING_EFFORT_OPTIONS,
    defaults: {
      main: { modelId: OPENAI_DEFAULT_MODEL_TIERS.big, reasoningEffort: 'high' },
      explore: { modelId: OPENAI_DEFAULT_MODEL_TIERS.small, reasoningEffort: 'high' },
      external: { modelId: OPENAI_DEFAULT_MODEL_TIERS.medium, reasoningEffort: 'medium' },
    },
  },
}

export function getEffectiveLlmProvider(provider?: LlmProviderName): LlmProviderName {
  return provider ?? DEFAULT_LLM_PROVIDER
}

export function getLlmProviderMetadata(provider?: LlmProviderName): LlmProviderMetadata {
  return LLM_PROVIDER_METADATA[getEffectiveLlmProvider(provider)]
}

export function normalizeLlmProvider(value: unknown): LlmProviderName | undefined {
  return value === 'anthropic' || value === 'openai' ? value : undefined
}

export function normalizeLlmModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

export function normalizeOpenAIReasoningEffort(value: unknown): OpenAIReasoningEffort | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return isOpenAIReasoningEffort(normalized) ? normalized : undefined
}

export function normalizeReasoningEffortForProvider(
  value: unknown,
  provider?: LlmProviderName
): OpenAIReasoningEffort | undefined {
  return getEffectiveLlmProvider(provider) === 'openai' ? normalizeOpenAIReasoningEffort(value) : undefined
}

export function supportsReasoningEffortOverride(provider?: LlmProviderName): boolean {
  return getLlmProviderMetadata(provider).supportsReasoningEffortOverride
}

export function getReasoningEffortOptions(provider?: LlmProviderName): readonly OpenAIReasoningEffort[] {
  return getLlmProviderMetadata(provider).reasoningEffortOptions
}

export function isAnthropicAdaptiveThinkingModel(modelId: string): boolean {
  return modelId.startsWith('claude-opus-4-6') || modelId.startsWith('claude-sonnet-4-6')
}

export function getLlmDefaultsHelpText(provider?: LlmProviderName): string {
  const metadata = getLlmProviderMetadata(provider)
  const defaultsText = [
    `main agent ${describeDefaults(metadata.defaults.main)}`,
    `external subagent ${describeDefaults(metadata.defaults.external)}`,
    `explorer subagent ${describeDefaults(metadata.defaults.explore)}`,
  ].join(', ')

  if (provider) {
    if (provider === 'openai') {
      return `Leave model and reasoning blank to use ${metadata.adminLabel} defaults: ${defaultsText}. Overrides apply everywhere.`
    }

    return `Leave model blank to use ${metadata.adminLabel} defaults: ${defaultsText}. Anthropic uses adaptive thinking automatically on Sonnet/Opus 4.6, so no reasoning override is needed.`
  }

  return `Leave provider blank to use the system default provider (${metadata.adminLabel}). Leave model blank to use its defaults: ${defaultsText}. Reasoning overrides are only available for OpenAI.`
}

function isOpenAIReasoningEffort(value: string): value is OpenAIReasoningEffort {
  return (OPENAI_REASONING_EFFORT_OPTIONS as readonly string[]).includes(value)
}

function describeDefaults(defaults: ProviderExecutionDefaults): string {
  if (defaults.reasoningEffort) {
    return `${defaults.modelId} with ${defaults.reasoningEffort} reasoning`
  }

  if (defaults.thinkingMode === 'adaptive') {
    return `${defaults.modelId} with adaptive thinking`
  }

  return defaults.modelId
}
