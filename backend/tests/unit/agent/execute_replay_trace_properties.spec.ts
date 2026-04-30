import { test } from '@japa/runner'
import sinon from 'sinon'
import type { ModelMessage } from 'ai'
import { CanvasAgent, type Context } from '#agent/index'
import { createAnthropicProvider } from '#agent/providers/index'
import { buildMessagesHash } from '#agent/messages_hash'

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

test.group('CanvasAgent replay trace properties', () => {
  test('emits replay hash comparison on the root trace for follow-up invocations', async ({ assert }) => {
    const traces: Record<string, any>[] = []
    const posthogService = {
      captureAiTrace: (payload: Record<string, any>) => {
        traces.push(payload)
      },
      captureAiSpan: () => undefined,
      wrapModelWithTracing: (model: unknown) => model,
    }

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
      posthogService: posthogService as any,
    })

    const parentMessages: ModelMessage[] = [
      { role: 'user', content: 'Initial request' },
      { role: 'assistant', content: 'Working on it' },
    ]
    const expectedReplayHash = buildMessagesHash(parentMessages)

    agent.loadState({
      timeline: [],
      provider: 'anthropic',
      anthropicMessages: parentMessages,
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
      await agent.execute('Continue the task', createContext(), flow)
    } finally {
      generateWithToolsStub.restore()
    }

    assert.lengthOf(traces, 1)
    assert.equal(traces[0]?.properties?.parent_messages_hash, expectedReplayHash)
    assert.equal(traces[0]?.properties?.replayed_messages_hash, expectedReplayHash)
    assert.isTrue(traces[0]?.properties?.replay_hash_match)
  })
})
