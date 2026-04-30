import type {
  Context,
  ConversationItem,
  SerializedState,
  UserMessageItem,
  WorkingContextItem,
  ThinkingItem,
  ProgressItem,
  WebSearchItem,
  ComposioSearchItem,
  ComposioToolItem,
  ComposioWorkbenchItem,
  ComposioBashItem,
  ComposioSchemaItem,
  ChatItem,
  ErrorItem,
  TextEditorItem,
  RepositionFilesItem,
  BashItem,
  WebFetchItem,
  SubagentExecutionItem,
  ReportOutputItem,
  ExecutionCompletedItem,
  SkillActivatedItem,
  SkillCreatedItem,
  AskQuestionItem,
  SuggestedTasksItem,
  ContextualTipItem,
  AgentEvent,
  AgentEventType,
  Provider,
} from './types.d.ts'

import type { ModelMessage } from 'ai'
import type { EventStream } from './events.js'
import { DEFAULT_LLM_PROVIDER } from 'shared/llm-config'

// Re-export state types from types.ts
export type { SerializedState, ConversationItem } from './types.d.ts'

export class State {
  private timeline: ConversationItem[] = []
  private context: Context
  private eventStream: EventStream | null = null
  private lastAgentEvent: AgentEvent | null = null

  // Provider and message storage
  private provider: Provider = DEFAULT_LLM_PROVIDER
  private messages: ModelMessage[] = []

  // Abort controller for cancellation
  private abortController: AbortController | null = null
  private hasPendingAbort = false
  private pendingAbortReason: string | undefined

  constructor(eventStream?: EventStream) {
    this.context = {
      canvasId: null,
      workspaceId: '',
      organizationId: '',
      userId: '',
      userName: null,
      uploadedFiles: null,
      agentMode: 'thinking',
      yoloMode: false,
      selectedText: null,
      authToken: '',
      authTokenId: 0,
      correlationId: '',
      invocationId: '',
      aiSessionId: '',
      invocationSource: null,
      workspaceTree: null,
      canvasPath: null,
      activeCanvasContext: null,
      selectedNodePaths: null,
      mentionedNodePaths: null,
    }
    this.eventStream = eventStream || null
  }

  setEventStream(eventStream: EventStream): void {
    this.eventStream = eventStream
  }

  get currentContext(): Readonly<Context> {
    return this.context
  }

  set currentContext(context: Context) {
    this.context = context
  }

  get currentProvider(): Provider {
    return this.provider
  }

  setProvider(provider: Provider): void {
    this.provider = provider
  }

  getTimeline(): ReadonlyArray<ConversationItem> {
    return this.timeline
  }

  // Timeline management with automatic event emission
  addTimelineItem(
    item:
      | Omit<UserMessageItem, 'id'>
      | Omit<WorkingContextItem, 'id'>
      | Omit<ThinkingItem, 'id'>
      | Omit<ProgressItem, 'id'>
      | Omit<WebSearchItem, 'id'>
      | Omit<ComposioSearchItem, 'id'>
      | Omit<ComposioToolItem, 'id'>
      | Omit<ComposioWorkbenchItem, 'id'>
      | Omit<ComposioBashItem, 'id'>
      | Omit<ComposioSchemaItem, 'id'>
      | Omit<ChatItem, 'id'>
      | Omit<ErrorItem, 'id'>
      | Omit<TextEditorItem, 'id'>
      | Omit<RepositionFilesItem, 'id'>
      | Omit<BashItem, 'id'>
      | Omit<WebFetchItem, 'id'>
      | Omit<SubagentExecutionItem, 'id'>
      | Omit<ReportOutputItem, 'id'>
      | Omit<ExecutionCompletedItem, 'id'>
      | Omit<SkillActivatedItem, 'id'>
      | Omit<SkillCreatedItem, 'id'>
      | Omit<AskQuestionItem, 'id'>
      | Omit<SuggestedTasksItem, 'id'>
      | Omit<ContextualTipItem, 'id'>,
    eventType: Exclude<AgentEventType, 'tool_streaming'>,
    customId?: string
  ): string {
    const id = customId || this.generateId()
    const newItem = { ...item, id } as ConversationItem
    this.timeline.push(newItem)

    const event: AgentEvent = {
      type: eventType,
      itemId: id,
      timestamp: Date.now(),
    }

    this.lastAgentEvent = event

    if (this.eventStream) {
      this.eventStream.emitEvent(event)
    }

    return id
  }

  updateTimelineItem(
    id: string,
    updates: Partial<
      | Omit<ThinkingItem, 'id'>
      | Omit<ProgressItem, 'id'>
      | Omit<WebSearchItem, 'id'>
      | Omit<ComposioSearchItem, 'id'>
      | Omit<ComposioToolItem, 'id'>
      | Omit<ComposioWorkbenchItem, 'id'>
      | Omit<ComposioBashItem, 'id'>
      | Omit<ComposioSchemaItem, 'id'>
      | Omit<TextEditorItem, 'id'>
      | Omit<RepositionFilesItem, 'id'>
      | Omit<BashItem, 'id'>
      | Omit<WebFetchItem, 'id'>
      | Omit<SubagentExecutionItem, 'id'>
      | Omit<ReportOutputItem, 'id'>
      | Omit<AskQuestionItem, 'id'>
      | Omit<SuggestedTasksItem, 'id'>
    >,
    eventType: Exclude<AgentEventType, 'tool_streaming'>
  ): void {
    const index = this.timeline.findIndex((item) => item.id === id)
    if (index !== -1) {
      this.timeline[index] = { ...this.timeline[index], ...updates } as ConversationItem
    }

    const event: AgentEvent = {
      type: eventType,
      itemId: id,
      timestamp: Date.now(),
    }

    this.lastAgentEvent = event

    if (this.eventStream) {
      this.eventStream.emitEvent(event)
    }
  }

  findTimelineItem(id: string): ConversationItem | undefined {
    return this.timeline.find((item) => item.id === id)
  }

  removeTimelineItem(id: string): void {
    const index = this.timeline.findIndex((item) => item.id === id)
    if (index !== -1) {
      this.timeline.splice(index, 1)
    }
  }

  failActiveToolItems(reason: string): boolean {
    const activeToolStatuses = new Set([
      'executing',
      'searching',
      'fetching',
      'initializing',
      'in_progress',
      'running',
      'loading',
    ])
    let changed = false

    this.timeline = this.timeline.map((item) => {
      switch (item.type) {
        case 'web_search':
        case 'composio_search':
        case 'composio_tool':
        case 'composio_workbench':
        case 'composio_bash':
        case 'composio_schema':
        case 'text_editor':
        case 'reposition_files':
        case 'bash':
        case 'web_fetch':
        case 'subagent_execution': {
          if (!activeToolStatuses.has(item.status)) {
            return item
          }

          changed = true
          return {
            ...item,
            status: 'failed',
            error: item.error ?? reason,
          }
        }

        case 'suggested_tasks': {
          if (!activeToolStatuses.has(item.status)) {
            return item
          }

          changed = true
          return {
            ...item,
            status: 'failed',
            error: item.error ?? reason,
          }
        }

        default:
          return item
      }
    })

    return changed
  }

  // Abort controller management
  createAbortController(): AbortController {
    this.abortController = new AbortController()

    if (this.hasPendingAbort) {
      this.abortController.abort(this.pendingAbortReason)
      this.hasPendingAbort = false
      this.pendingAbortReason = undefined
    }

    return this.abortController
  }

  abort(reason?: string): void {
    if (this.abortController) {
      this.abortController.abort(reason)
      return
    }

    this.hasPendingAbort = true
    this.pendingAbortReason = reason
  }

  get abortSignal(): AbortSignal | undefined {
    return this.abortController?.signal
  }

  get isAborted(): boolean {
    if (this.hasPendingAbort) {
      return true
    }

    return this.abortController?.signal.aborted ?? false
  }

  // State management
  clear(): void {
    this.timeline = []
    this.context = {
      canvasId: null,
      workspaceId: '',
      organizationId: '',
      userId: '',
      userName: null,
      uploadedFiles: null,
      agentMode: 'thinking',
      yoloMode: false,
      selectedText: null,
      authToken: '',
      authTokenId: 0,
      correlationId: '',
      invocationId: '',
      aiSessionId: '',
      invocationSource: null,
      workspaceTree: null,
      canvasPath: null,
      activeCanvasContext: null,
      selectedNodePaths: null,
      mentionedNodePaths: null,
    }
    this.provider = DEFAULT_LLM_PROVIDER
    this.messages = []
    this.abortController = null
    this.hasPendingAbort = false
    this.pendingAbortReason = undefined
  }

  getLastAgentEvent(): AgentEvent | null {
    return this.lastAgentEvent
  }

  // Serialization
  toJSON(): SerializedState {
    return {
      timeline: [...this.timeline],
      provider: this.provider,
      messages: this.messages.length > 0 ? [...this.messages] : undefined,
    }
  }

  static fromJSON(data: SerializedState): State {
    const state = new State()
    state.timeline = data.timeline
    state.provider = data.provider || DEFAULT_LLM_PROVIDER
    // Backward compat: old persisted states used `anthropicMessages`
    state.messages = data.messages || data.anthropicMessages || []
    return state
  }

  getMessages(): ModelMessage[] {
    return [...this.messages]
  }

  replaceMessages(messages: ModelMessage[]): void {
    this.messages = [...messages]
  }

  addMessage(message: ModelMessage, metadata?: { planId?: string; stepId?: string }): void {
    this.messages.push(message)

    // Also store metadata if needed (for debugging/tracking)
    if (metadata) {
      // Can be used for tracking which plan/step this message belongs to
    }
  }

  prependMessage(message: ModelMessage): void {
    this.messages.unshift(message)
  }

  get hasConversation(): boolean {
    return this.timeline.length > 0 || this.messages.length > 0
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}
