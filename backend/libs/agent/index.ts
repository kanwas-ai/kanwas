// Main exports
export { CanvasAgent } from './agent.js'
export type { AgentExecuteOptions } from './agent.js'
export { State } from './state.js'
export { EventStream } from './events.js'
export { AGENT_MODES, DEFAULT_AGENT_MODE, normalizeAgentMode } from './modes.js'
export type { AgentMode } from './modes.js'

// Tool exports (Vercel AI SDK format)
export { coreTools, utilityTools, createNativeTools } from './tools/index.js'
export type { ToolContext } from './tools/index.js'

// Provider exports
export type { ProviderConfig, ProviderName } from './providers/types.js'
export {
  createProvider,
  createProviderFromConfig,
  createAnthropicProvider,
  createOpenAIProvider,
} from './providers/index.js'

// Type exports
export type {
  // Configuration
  AgentConfig,

  // Documents
  Document,
  Context,

  // ReAct Loop
  ToolCall,

  // Other
  ConnectedExternalTool,
  AgentError,
} from './types.js'

// Event types
export type { AgentEvent, AgentEventType } from './events.js'

// State and timeline types
export type { SerializedState, ConversationItem } from './state.js'
export type {
  UserMessageItem,
  ThinkingItem,
  ProgressItem,
  ChatItem,
  ExecutionCompletedItem,
  ErrorItem,
  AskQuestionItem,
  RepositionFilesItem,
  Question,
  SuggestedTask,
  SuggestedTasksItem,
  ContextualTipItem,
} from './types.js'
