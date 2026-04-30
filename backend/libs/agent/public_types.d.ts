import type { ModelMessage } from 'ai'

export type AgentMode = 'thinking' | 'direct'
export type SubagentType = 'explore' | 'external'

export type ModelTier = 'small' | 'medium' | 'big'

export type AgentSource = 'main' | 'subagent'

export interface AgentInfo {
  source: AgentSource
  executionId?: string
}

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
  userId: string
  userName?: string | null
  auditActor?: string
  auditTimestamp?: string
  uploadedFiles: UploadedFile[] | null
  agentMode: AgentMode
  yoloMode: boolean
  selectedText: SelectedText | null
  authToken: string
  authTokenId: string | number | BigInt
  correlationId: string
  invocationId: string
  aiSessionId: string
  invocationSource: string | null
  workspaceTree: string | null
  canvasPath: string | null
  activeCanvasContext: string | null
  selectedNodePaths: string[] | null
  mentionedNodePaths: string[] | null
  connectedExternalTools?: ConnectedExternalTool[] | null
  connectedExternalToolsLookupCompleted?: boolean
  dismissedTipIds?: string[]
}

export interface AgentError {
  code: string
  message: string
  details?: unknown
  timestamp: number
}

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

export interface BaseToolItem {
  id: string
  timestamp: number
  agent?: AgentInfo
}

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
  streamingText?: string
  reportOutputText?: string
  subagentId?: string
  lineCount?: number
}

export type AgentEvent = ToolStreamingEvent | NonToolStreamingAgentEvent

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
  canvasPath: string | null
  workspaceId: string
  timestamp: number
}

export interface ThinkingItem extends BaseToolItem {
  type: 'thinking'
  thought: string
  streaming?: boolean
  duration?: number
}

export interface ProgressItem extends BaseToolItem {
  type: 'progress'
  message: string
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
  streamingStatus?: string
  linesRead?: number
  totalLines?: number
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
  output?: string
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
  connector?: string
  label?: string
}

export type Provider = 'anthropic' | 'openai'

export interface SerializedState {
  timeline: ConversationItem[]
  provider: Provider
  messages?: ModelMessage[]
  anthropicMessages?: ModelMessage[]
}
