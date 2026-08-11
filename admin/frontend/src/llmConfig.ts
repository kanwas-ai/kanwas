import {
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDER_OPTIONS,
  OPENAI_SERVICE_TIER_OPTIONS,
  getLlmDefaultsHelpText,
  getLlmProviderMetadata,
  getReasoningEffortOptions,
  normalizeLlmProvider,
  type LlmProviderName,
  type OpenAIReasoningEffort,
  type OpenAIServiceTier,
} from '../../../shared/src/llm-config.ts'

export type AdminLlmProviderValue = LlmProviderName | ''
export type AdminReasoningEffortValue = OpenAIReasoningEffort | ''
export type AdminServiceTierValue = OpenAIServiceTier | ''

export function getAdminProviderOptions() {
  return LLM_PROVIDER_OPTIONS
}

export function getAdminDefaultsHelpText(provider: string): string {
  return getLlmDefaultsHelpText(parseAdminProvider(provider))
}

export function getDefaultLabel(provider: string): string {
  return parseAdminProvider(provider) ? 'Provider default' : 'System default'
}

export function supportsReasoningOverrides(provider: string): boolean {
  return getLlmProviderMetadata(parseAdminProvider(provider)).supportsReasoningEffortOverride
}

export function getAdminReasoningOptions(provider: string): readonly OpenAIReasoningEffort[] {
  return getReasoningEffortOptions(parseAdminProvider(provider))
}

export function supportsServiceTierDefaults(provider: string): boolean {
  return (parseAdminProvider(provider) ?? DEFAULT_LLM_PROVIDER) === 'openai'
}

export function getAdminServiceTierOptions(): readonly OpenAIServiceTier[] {
  return OPENAI_SERVICE_TIER_OPTIONS
}

export function formatConfigOverride(config: Record<string, unknown>): string | null {
  const parts: string[] = []
  const provider = config.llmProvider ? parseAdminProvider(String(config.llmProvider)) : undefined
  const effectiveProvider = provider ?? DEFAULT_LLM_PROVIDER

  if (config.llmProvider) {
    parts.push(provider ? getLlmProviderMetadata(provider).adminLabel : String(config.llmProvider))
  }

  if (config.llmModel) {
    parts.push(String(config.llmModel))
  }

  if (config.reasoningEffort && provider === 'openai') {
    parts.push(`${String(config.reasoningEffort)} reasoning`)
  }

  if (config.llmServiceTier && effectiveProvider === 'openai') {
    parts.push(`${String(config.llmServiceTier)} service tier`)
  }

  return parts.length > 0 ? parts.join(' / ') : null
}

export function parseAdminProvider(value: string): LlmProviderName | undefined {
  return normalizeLlmProvider(value)
}
