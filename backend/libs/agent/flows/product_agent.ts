import type { ProviderConfig } from '../providers/types.js'
import type { ProductAgentFlowDefinition } from './shared.js'
import { createMainAgentFlowDefinition } from './main_agent_base.js'

export function createProductAgentFlowDefinition(model: string, provider: ProviderConfig): ProductAgentFlowDefinition {
  return createMainAgentFlowDefinition({
    name: 'product-agent',
    model,
    provider,
    mainPromptNames: ['default_base'],
    includeSuggestNextTasksTool: false,
  })
}
