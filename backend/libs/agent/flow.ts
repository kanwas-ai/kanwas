export {
  getSubagentFlow,
  getSubagentNames,
  resolveProductAgentFlow,
  WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
} from './flows/shared.js'
export type {
  AgentFlowName,
  FlowSystemPromptBlock,
  ProductAgentFlowDefinition,
  ProductAgentSubagentDefinition,
  ResolvedMainAgentFlow,
  ResolvedProductAgentFlow,
  ResolvedSubagentFlow,
} from './flows/shared.js'
export { createProductAgentFlowDefinition } from './flows/product_agent.js'
export { createOnboardingFlowDefinition } from './flows/onboarding.js'
export { createWorkspaceSuggestedTaskFlowDefinition } from './flows/workspace_suggested_tasks.js'
