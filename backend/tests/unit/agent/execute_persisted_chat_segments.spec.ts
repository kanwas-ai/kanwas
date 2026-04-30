import { test } from '@japa/runner'
import sinon from 'sinon'
import { CanvasAgent, type Context } from '#agent/index'
import { createAnthropicProvider } from '#agent/providers/index'

const mockProvider = createAnthropicProvider('test-key')

function createContext(): Context {
  return {
    canvasId: null,
    workspaceId: 'workspace-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    uploadedFiles: null,
    agentMode: 'thinking',
    yoloMode: false,
    selectedText: null,
    authToken: 'token',
    authTokenId: 'token-id',
    correlationId: 'corr-1',
    invocationId: 'invocation-1',
    aiSessionId: 'session-1',
    invocationSource: null,
    workspaceTree: null,
    canvasPath: null,
    activeCanvasContext: null,
    selectedNodePaths: null,
    mentionedNodePaths: null,
  }
}

test.group('CanvasAgent persisted chat segments', () => {
  test('stores the invocation id on user message timeline items', async ({ assert }) => {
    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'test-model',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {
        createInvocationSandbox: async () => ({
          isInitialized: () => false,
        }),
      } as any,
      posthogService: {
        captureAiTrace: () => undefined,
        captureAiSpan: () => undefined,
        wrapModelWithTracing: (model: unknown) => model,
      } as any,
    })

    const definition = CanvasAgent.getProductAgentFlowDefinition('test-model', mockProvider)
    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['MAIN SYSTEM'],
      subagentPromptByName: Object.fromEntries(
        definition.subagents.map((subagent) => [subagent.name, `SYSTEM: ${subagent.name}`])
      ),
      provider: mockProvider,
    })

    const generateWithToolsStub = sinon.stub((agent as any).llm, 'generateWithTools').resolves({
      messages: [],
      iterations: 1,
      toolResults: [],
      isTerminal: true,
      textOutput: 'Done',
      textOutputItemId: 'chat_1',
      hasPersistedChatOutput: false,
    })

    try {
      await agent.execute('do some thinking', createContext(), flow)
    } finally {
      generateWithToolsStub.restore()
    }

    const userMessageItem = agent
      .getState()
      .getTimeline()
      .find((item) => item.type === 'user_message')
    assert.exists(userMessageItem)
    assert.equal(userMessageItem?.type, 'user_message')
    assert.equal(userMessageItem?.type === 'user_message' ? userMessageItem.invocationId : undefined, 'invocation-1')
  })

  test('adds connected external tools to the LLM user message without changing the timeline user message', async ({
    assert,
  }) => {
    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'test-model',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {
        createInvocationSandbox: async () => ({
          isInitialized: () => false,
        }),
      } as any,
      posthogService: {
        captureAiTrace: () => undefined,
        captureAiSpan: () => undefined,
        wrapModelWithTracing: (model: unknown) => model,
      } as any,
    })

    const definition = CanvasAgent.getProductAgentFlowDefinition('test-model', mockProvider)
    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['MAIN SYSTEM'],
      subagentPromptByName: Object.fromEntries(
        definition.subagents.map((subagent) => [subagent.name, `SYSTEM: ${subagent.name}`])
      ),
      provider: mockProvider,
    })

    let llmUserMessage: unknown
    const generateWithToolsStub = sinon
      .stub((agent as any).llm, 'generateWithTools')
      .callsFake(async (options: any) => {
        llmUserMessage = options.messages[0]?.content

        return {
          messages: [],
          iterations: 1,
          toolResults: [],
          isTerminal: true,
          textOutput: 'Done',
          textOutputItemId: 'chat_1',
          hasPersistedChatOutput: false,
        }
      })

    try {
      await agent.execute(
        'check my connected tools',
        {
          ...createContext(),
          connectedExternalToolsLookupCompleted: true,
          connectedExternalTools: [{ toolkit: 'slack', displayName: 'Slack' }],
        },
        flow
      )
    } finally {
      generateWithToolsStub.restore()
    }

    assert.isString(llmUserMessage)
    assert.include(llmUserMessage as string, '<connected_external_tools>\n- Slack\n</connected_external_tools>')
    assert.include(llmUserMessage as string, '<task>\ncheck my connected tools\n</task>')

    const userMessageItem = agent
      .getState()
      .getTimeline()
      .find((item) => item.type === 'user_message')

    assert.equal(
      userMessageItem?.type === 'user_message' ? userMessageItem.message : undefined,
      'check my connected tools'
    )
  })

  test('does not require a second final chat item when assistant text was already flushed mid-run', async ({
    assert,
  }) => {
    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'test-model',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {
        createInvocationSandbox: async () => ({
          isInitialized: () => false,
        }),
      } as any,
      posthogService: {
        captureAiTrace: () => undefined,
        captureAiSpan: () => undefined,
        wrapModelWithTracing: (model: unknown) => model,
      } as any,
    })

    const definition = CanvasAgent.getProductAgentFlowDefinition('test-model', mockProvider)
    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['MAIN SYSTEM'],
      subagentPromptByName: Object.fromEntries(
        definition.subagents.map((subagent) => [subagent.name, `SYSTEM: ${subagent.name}`])
      ),
      provider: mockProvider,
    })

    const generateWithToolsStub = sinon
      .stub((agent as any).llm, 'generateWithTools')
      .callsFake(async (options: any) => {
        options.context.state.addTimelineItem(
          {
            type: 'chat',
            message: "I've got your context loaded. What should I chew on?",
            timestamp: Date.now(),
          },
          'chat',
          'chat_1'
        )

        return {
          messages: [],
          iterations: 1,
          toolResults: [],
          isTerminal: true,
          textOutput: undefined,
          textOutputItemId: undefined,
          hasPersistedChatOutput: true,
        }
      })

    try {
      await agent.execute('do some thinking', createContext(), flow)
    } finally {
      generateWithToolsStub.restore()
    }

    const chatItems = agent
      .getState()
      .getTimeline()
      .filter((item) => item.type === 'chat')
    assert.lengthOf(chatItems, 1)
    assert.equal(chatItems[0]?.id, 'chat_1')
    assert.equal(
      chatItems[0]?.type === 'chat' ? chatItems[0].message : undefined,
      "I've got your context loaded. What should I chew on?"
    )

    const executionItem = agent
      .getState()
      .getTimeline()
      .find((item) => item.type === 'execution_completed') as { summary?: string } | undefined

    assert.exists(executionItem)
    assert.equal(executionItem?.summary, 'Completed')
  })
})
