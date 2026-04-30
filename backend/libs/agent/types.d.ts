import type { ModelMessage } from 'ai'
import type { LLMInterface } from './llm.js'
import type { State } from './state.js'
import type { EventStream } from './events.js'
import type { ProviderConfig } from './providers/types.js'
import type { AgentMode } from './modes.js'

// ============================================================================
// Configuration Types
// ============================================================================
export interface AgentConfig {
  provider: ProviderConfig
  model: string
  workspaceDocumentService: import('#services/workspace_document_service').default
  webSearchService: import('#services/web_search_service').default
  sandboxRegistry: import('#services/sandbox_registry').SandboxRegistry
  posthogService: import('#services/posthog_service').default
}

// ============================================================================
// Subagent Types
// ============================================================================
export type SubagentType = 'explore' | 'external'

export type ModelTier = 'small' | 'medium' | 'big'

export type AgentSource = 'main' | 'subagent'

export interface AgentInfo {
  source: AgentSource
  executionId?: string // Only set when source === 'subagent'
}

// ============================================================================
// Context Types
// ============================================================================
export interface Document {
  id: string
  name: string
  markdown: string
  html: string
}

export interface UploadedFile {
  id: string
  filename: string
  path: string
  mimeType: string
  size: number
}

export interface SelectedText {
  nodeId: string
  nodeName: string
  text: string
}

export interface ConnectedExternalTool {
  toolkit: string
  displayName: string
}

export interface Context {
  canvasId: string | null
  workspaceId: string
  organizationId: string
  userId: string // User who initiated the invocation
  /** Display name for the user who initiated the invocation */
  userName?: string | null
  /** Actor for backend-originated frontend node creation payloads */
  auditActor?: string
  /** ISO-8601 timestamp for backend-originated frontend node creation payloads */
  auditTimestamp?: string
  uploadedFiles: UploadedFile[] | null
  agentMode: AgentMode
  yoloMode: boolean
  selectedText: SelectedText | null
  /** Auth token for sandbox to use when calling backend APIs (e.g., file uploads) */
  authToken: string
  /** Token identifier for cleanup */
  authTokenId: string | number | BigInt
  /** Correlation ID for end-to-end tracing across services */
  correlationId: string
  /** Unique invocation ID for AI trace ID (each execution = new trace) */
  invocationId: string
  /** Root invocation ID for AI session ID (groups conversation thread) */
  aiSessionId: string
  /** Persisted invocation source, used for onboarding-specific behavior */
  invocationSource: string | null
  /** Pre-computed workspace tree string from frontend (avoids a live Yjs server connection) */
  workspaceTree: string | null
  /** Pre-computed canvas path from frontend */
  canvasPath: string | null
  /** Pre-computed active canvas layout context from frontend */
  activeCanvasContext: string | null
  /** Pre-computed selected node paths from frontend */
  selectedNodePaths: string[] | null
  /** Pre-computed mentioned node paths from frontend */
  mentionedNodePaths: string[] | null
  /** Connected external services available through Composio for this workspace/user. */
  connectedExternalTools?: ConnectedExternalTool[] | null
  /** True when the Composio lookup completed, even if no tools are connected. */
  connectedExternalToolsLookupCompleted?: boolean
  /** Tip IDs the user has already dismissed (loaded from global user config) */
  dismissedTipIds?: string[]
}

// ============================================================================
// Error Types
// ============================================================================
export interface AgentError {
  code: string
  message: string
  details?: unknown
  timestamp: number
}

// ============================================================================
// Ask Question Types
// ============================================================================
export interface QuestionOption {
  id: string
  label: string
  description: string
}

export interface Question {
  id: string
  text: string
  options: QuestionOption[]
  multiSelect: boolean
}

// ============================================================================
// ReAct Loop Types
// ============================================================================
export interface ToolCall {
  name: string
  args: Record<string, any>
}

export interface SuggestedTask {
  id: string
  emoji: string
  headline: string
  description: string
  prompt: string
  source?: string
}

// ============================================================================
// Base Tool Item (for agent context propagation)
// ============================================================================
export interface BaseToolItem {
  id: string
  timestamp: number
  agent?: AgentInfo
}

// ============================================================================
// Event Types
// ============================================================================
export type AgentEventType =
  | 'working_context'
  | 'clarification_requested'
  | 'clarification_received'
  | 'conversation_continued'
  | 'chat'
  | 'chat_streaming'
  | 'thinking'
  | 'thinking_streaming'
  | 'progress'
  | 'progress_streaming'
  | 'tool_streaming'
  | 'web_search_started'
  | 'web_search_completed'
  | 'web_search_failed'
  | 'composio_action'
  | 'text_editor_started'
  | 'text_editor_progress'
  | 'text_editor_completed'
  | 'text_editor_failed'
  | 'reposition_files_started'
  | 'reposition_files_progress'
  | 'reposition_files_completed'
  | 'reposition_files_failed'
  | 'bash_started'
  | 'bash_output'
  | 'bash_completed'
  | 'bash_failed'
  | 'web_fetch_started'
  | 'web_fetch_completed'
  | 'web_fetch_failed'
  | 'skill_activated'
  | 'skill_created'
  | 'error'
  | 'user_message'
  | 'execution_interrupted'
  | 'execution_completed'
  | 'subagent_started'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'report_output_streaming'
  | 'report_output_completed'
  | 'ask_question_created'
  | 'ask_question_answered'
  | 'ask_question_cancelled'
  | 'suggested_tasks_started'
  | 'suggested_tasks_completed'
  | 'suggested_tasks_failed'
  | 'contextual_tip'

export interface BaseAgentEvent {
  itemId: string
  timestamp: number
}

export type ToolStreamingPhase = 'question_generation'

export interface ToolStreamingPatchSet {
  text?: string
  toolName?: string
  filePath?: string
  urls?: string[]
  paths?: string[]
  animationKey?: string
  markdownBody?: string
  markdownAppend?: string
  command?: string
  contentLength?: number
  lineCount?: number
  objective?: string
  phase?: ToolStreamingPhase
}

export type ToolStreamingPatchField = keyof ToolStreamingPatchSet

export interface ToolStreamingPatch {
  set?: Partial<ToolStreamingPatchSet>
  clear?: ToolStreamingPatchField[]
}

export interface ToolStreamingEvent extends BaseAgentEvent {
  type: 'tool_streaming'
  toolPatch: ToolStreamingPatch
}

export interface NonToolStreamingAgentEvent extends BaseAgentEvent {
  type: Exclude<AgentEventType, 'tool_streaming'>
  /** Partial text for streaming events */
  streamingText?: string
  /** Report output text during streaming */
  reportOutputText?: string
  /** Subagent ID for report output events */
  subagentId?: string
  /** Number of lines in streamed report output */
  lineCount?: number
}

export type AgentEvent = ToolStreamingEvent | NonToolStreamingAgentEvent

// ============================================================================
// Timeline Types (new state management)
// ============================================================================
export type ConversationItem =
  | UserMessageItem
  | WorkingContextItem
  | ThinkingItem
  | ProgressItem
  | WebSearchItem
  | ComposioSearchItem
  | ComposioToolItem
  | ComposioWorkbenchItem
  | ComposioBashItem
  | ComposioSchemaItem
  | ChatItem
  | ErrorItem
  | TextEditorItem
  | RepositionFilesItem
  | BashItem
  | WebFetchItem
  | SubagentExecutionItem
  | ReportOutputItem
  | ExecutionCompletedItem
  | SkillActivatedItem
  | SkillCreatedItem
  | AskQuestionItem
  | SuggestedTasksItem
  | ContextualTipItem

export interface UserMessageItem {
  id: string
  type: 'user_message'
  message: string
  timestamp: number
  invocationId?: string
  uploadedFiles?: UploadedFile[]
  mentions?: Array<{ id: string; label: string }>
}

export interface WorkingContextItem {
  id: string
  type: 'working_context'
  canvasId: string | null
  canvasPath: string | null // Human-readable path, e.g., "/workspace/templates/emails/"
  workspaceId: string
  timestamp: number
}

export interface ThinkingItem extends BaseToolItem {
  type: 'thinking'
  thought: string
  /** True while streaming, false when complete */
  streaming?: boolean
  /** Duration in milliseconds (set when complete) */
  duration?: number
}

export interface ProgressItem extends BaseToolItem {
  type: 'progress'
  message: string
  /** True while streaming, false when complete */
  streaming?: boolean
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebFetchResult {
  title: string
  url: string
  contentLength: number
  publishDate?: string
}

export interface WebSearchItem extends BaseToolItem {
  type: 'web_search'
  objective: string
  searchQueries?: string[]
  status: 'searching' | 'completed' | 'failed'
  resultsFound?: number
  results?: WebSearchResult[]
  error?: string
}

export interface ComposioSearchItem {
  id: string
  type: 'composio_search'
  useCase: string
  knownFields?: string
  timestamp: number
  status: 'searching' | 'completed' | 'failed'
  toolsFound?: number
  tools?: Array<{
    toolSlug: string
    description: string
    toolkit: string
  }>
  validatedPlan?: string[]
  error?: string
}

export interface ComposioToolItem {
  id: string
  type: 'composio_tool'
  toolkit: string
  timestamp: number
  status: 'initializing' | 'in_progress' | 'completed' | 'failed'
  thought?: string
  error?: string
  toolCount?: number
  tools?: Array<{
    slug: string
    displayName: string
    toolkit: string
  }>
}

export interface ComposioWorkbenchItem {
  id: string
  type: 'composio_workbench'
  codeDescription: string
  timestamp: number
  status: 'executing' | 'completed' | 'failed'
  thought?: string
  code?: string
  error?: string
}

export interface ComposioBashItem {
  id: string
  type: 'composio_bash'
  command: string
  timestamp: number
  status: 'executing' | 'completed' | 'failed'
  stdout?: string
  stderr?: string
  error?: string
}

export interface ComposioSchemaItem {
  id: string
  type: 'composio_schema'
  toolSlugs: string[]
  timestamp: number
  status: 'fetching' | 'completed' | 'failed'
  schemasFound?: number
  error?: string
}

export interface ChatItem {
  id: string
  type: 'chat'
  message: string
  timestamp: number
}

export interface ErrorItem {
  id: string
  type: 'error'
  error: AgentError
  timestamp: number
}

export interface TextEditorItem extends BaseToolItem {
  type: 'text_editor'
  command: 'view' | 'create' | 'str_replace' | 'insert' | 'delete'
  path: string
  animationKey?: string
  markdownBody?: string
  status: 'executing' | 'completed' | 'failed'
  error?: string
  rawError?: string
  patchInput?: string
  originalFileContent?: string
  /** Streaming progress message shown during execution (e.g., "Reading lines 1-50...", "Writing Introduction...") */
  streamingStatus?: string
  /** For view: lines read so far */
  linesRead?: number
  /** For view: total lines in file */
  totalLines?: number
  /** For view: specific line range requested [start, end] */
  viewRange?: [number, number]
}

export interface RepositionFilesItem extends BaseToolItem {
  type: 'reposition_files'
  paths: string[]
  status: 'executing' | 'completed' | 'failed'
  error?: string
  rawError?: string
}

export interface BashItem extends BaseToolItem {
  type: 'bash'
  command: string
  cwd: string
  status: 'executing' | 'completed' | 'failed'
  exitCode?: number
  error?: string
  /** Streaming output - last N lines for UI display (ephemeral, cleared on completion) */
  output?: string
  /** Total line count for "N more lines above" indicator */
  outputLineCount?: number
}

export interface WebFetchItem extends BaseToolItem {
  type: 'web_fetch'
  urls: string[]
  objective?: string
  status: 'fetching' | 'completed' | 'failed'
  contentLength?: number
  resultsFound?: number
  errorsFound?: number
  results?: WebFetchResult[]
  error?: string
}

export interface SubagentExecutionItem {
  id: string
  type: 'subagent_execution'
  agentType: SubagentType
  taskDescription: string
  taskObjective: string
  model: ModelTier
  status: 'running' | 'completed' | 'failed'
  timestamp: number
  subagentId: string
  iterationCount?: number
  error?: string
}

export interface ReportOutputItem extends BaseToolItem {
  type: 'report_output'
  subagentId: string
  content: string
  status: 'streaming' | 'completed'
  lineCount?: number
}

export interface ExecutionCompletedItem {
  id: string
  type: 'execution_completed'
  summary: string
  timestamp: number
}

export interface SkillActivatedItem {
  id: string
  type: 'skill_activated'
  skillName: string
  skillDescription: string
  args?: string
  timestamp: number
}

export interface SkillCreatedItem {
  id: string
  type: 'skill_created'
  skillName: string
  skillDescription: string
  timestamp: number
}

export interface AskQuestionItem extends BaseToolItem {
  type: 'ask_question'
  context?: string
  questions: Question[]
  status: 'pending' | 'answered' | 'skipped'
  answers?: Record<string, string[]>
}

export interface SuggestedTasksItem extends BaseToolItem {
  type: 'suggested_tasks'
  scope: 'local' | 'global'
  status: 'loading' | 'completed' | 'failed'
  hasPersistedCopy: boolean
  tasks: SuggestedTask[]
  error?: string
}

export interface ContextualTipItem extends BaseToolItem {
  type: 'contextual_tip'
  tipId: string
  /** For connect_tools: which connector to highlight (e.g., "slack", "github") */
  connector?: string
  /** Agent-generated action label (e.g., "Sync your Jira tickets") */
  label?: string
}

// ============================================================================
// Provider Types
// ============================================================================
export type Provider = 'anthropic' | 'openai'

export interface SerializedState {
  timeline: ConversationItem[]
  provider: Provider
  messages?: ModelMessage[]
  /** @deprecated Use `messages` instead. Kept for backward compatibility with persisted state. */
  anthropicMessages?: ModelMessage[]
}
