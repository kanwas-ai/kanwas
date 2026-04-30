import { CanvasAgent, AgentEvent, type Context, type AgentExecuteOptions } from '#agent/index'
import type { ResolvedProductAgentFlow } from '#agent/flow'
import type { NativeGenerateResult } from '#agent/llm'
import WorkspaceDocumentService from '#services/workspace_document_service'
import WebSearchService from '#services/web_search_service'
import { SandboxRegistry } from '#services/sandbox_registry'
import PostHogService from '#services/posthog_service'
import { createAnthropicProvider } from '#agent/providers/index'
import app from '@adonisjs/core/services/app'

export class MockCanvasAgent extends CanvasAgent {
  private mockEvents: AgentEvent[] = []
  private executeCalled = false
  private lastQuery: string = ''
  private lastContext: Context | undefined = undefined
  private lastFlow: ResolvedProductAgentFlow | undefined = undefined
  private loadStateCalled = false
  private lastLoadedState: any = null
  private executionDelay: number = 0
  private resolveFlowDelay: number = 0
  private abortedAtExecuteStart = false

  constructor() {
    // Pass minimal config to parent - won't be used in mock
    super({
      provider: createAnthropicProvider('mock'),
      model: 'mock',
      workspaceDocumentService: {} as WorkspaceDocumentService, // Mock service
      webSearchService: new WebSearchService('mock-api-key'), // Mock service
      sandboxRegistry: {} as SandboxRegistry,
      posthogService: {} as PostHogService,
    })
  }

  /**
   * Set mock events that will be yielded when execute is called
   */
  setMockEvents(events: AgentEvent[]): void {
    this.mockEvents = events
  }

  /**
   * Set execution delay in milliseconds (for testing cancellation during execution)
   */
  setExecutionDelay(ms: number): void {
    this.executionDelay = ms
  }

  /**
   * Set resolveFlow delay in milliseconds (for testing cancellation before execute starts)
   */
  setResolveFlowDelay(ms: number): void {
    this.resolveFlowDelay = ms
  }

  /**
   * Override execute to emit mock events instead of real execution
   */
  async execute(
    userMessage: string,
    context: Context,
    flow?: ResolvedProductAgentFlow,
    _sessionId?: string,
    _options: AgentExecuteOptions = {}
  ): Promise<NativeGenerateResult | null> {
    this.executeCalled = true
    this.lastQuery = userMessage
    this.lastContext = context
    this.lastFlow = flow

    // Initialize abort controller (same as real agent does)
    this.getState().createAbortController()
    this.abortedAtExecuteStart = this.getState().isAborted

    const sandboxRegistry = await app.container.make(SandboxRegistry)
    await sandboxRegistry.createInvocationSandbox({
      invocationId: context.invocationId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      authToken: context.authToken,
      authTokenId: context.authTokenId,
      correlationId: context.correlationId,
    })

    // If delay is set, wait (allows cancel command to be sent during execution)
    if (this.executionDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executionDelay))
    }

    for (const event of this.mockEvents) {
      // Emit event via eventStream
      this.getEventStream().emitEvent(event)
    }

    return null
  }

  async resolveFlow(context: Context): Promise<ResolvedProductAgentFlow> {
    if (this.resolveFlowDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.resolveFlowDelay))
    }

    const mockProvider = createAnthropicProvider('mock')
    const definition = CanvasAgent.getInvocationFlowDefinition({
      model: 'mock-model',
      provider: mockProvider,
      invocationSource: context.invocationSource,
    })
    const subagentPromptByName = Object.fromEntries(
      definition.subagents.map((subagent) => [subagent.name, `Mock prompt for ${subagent.name}`])
    )

    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['Mock system prompt'],
      subagentPromptByName,
      provider: mockProvider,
    })

    this.lastFlow = flow
    return flow
  }

  /**
   * Get information about how execute was called
   */
  getExecutionInfo() {
    return {
      called: this.executeCalled,
      query: this.lastQuery,
      context: this.lastContext,
      flow: this.lastFlow,
      abortedAtExecuteStart: this.abortedAtExecuteStart,
    }
  }

  /**
   * Override loadState to track when state is loaded
   */
  loadState(state: any): void {
    this.loadStateCalled = true
    this.lastLoadedState = state
    super.loadState(state)
  }

  /**
   * Get information about loadState calls
   */
  getLoadStateInfo() {
    return {
      called: this.loadStateCalled,
      state: this.lastLoadedState,
    }
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.executeCalled = false
    this.lastQuery = ''
    this.lastContext = undefined
    this.lastFlow = undefined
    this.mockEvents = []
    this.loadStateCalled = false
    this.lastLoadedState = null
    this.executionDelay = 0
    this.resolveFlowDelay = 0
    this.abortedAtExecuteStart = false
  }
}

/**
 * Helper to create default mock events for testing
 * Note: Events now only contain { type, itemId, timestamp }
 * All data should be in the timeline state
 */
export function createMockAgentEvents(): AgentEvent[] {
  return [
    {
      type: 'thinking',
      itemId: 'item-1',
      timestamp: Date.now(),
    },
    {
      type: 'chat',
      itemId: 'item-2',
      timestamp: Date.now(),
    },
    {
      type: 'execution_completed',
      itemId: 'item-3',
      timestamp: Date.now(),
    },
  ]
}
