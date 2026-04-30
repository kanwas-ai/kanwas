import type { ProviderConfig } from '../providers/types.js'
import type { ProductAgentFlowDefinition } from './shared.js'
import { createMainAgentFlowDefinition } from './main_agent_base.js'

export function createOnboardingFlowDefinition(model: string, provider: ProviderConfig): ProductAgentFlowDefinition {
  return createMainAgentFlowDefinition({
    name: 'onboarding',
    model,
    provider,
    mainPromptNames: ['default_base', 'onboarding_completion'],
    includeSuggestNextTasksTool: true,
  })
}
