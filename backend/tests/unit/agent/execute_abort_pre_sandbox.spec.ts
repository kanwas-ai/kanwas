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

test.group('CanvasAgent execute cancellation timing', () => {
  test('does not create sandbox when already aborted before execute starts', async ({ assert }) => {
    const createInvocationSandbox = sinon.spy(async () => {
      throw new Error('sandbox should not be created')
    })

    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'test-model',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {
        createInvocationSandbox,
      } as any,
      posthogService: {
        captureAiTrace: () => undefined,
        captureAiSpan: () => undefined,
        wrapModelWithTracing: (model: unknown) => model,
      } as any,
    })

    agent.getState().abort('cancel-before-execute')

    const definition = CanvasAgent.getProductAgentFlowDefinition('test-model', mockProvider)
    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['MAIN SYSTEM'],
      subagentPromptByName: {
        explore: 'EXPLORE SYSTEM',
        external: 'EXTERNAL SYSTEM',
      },
      provider: mockProvider,
    })

    await agent.execute('Do work', createContext(), flow)

    assert.isTrue(createInvocationSandbox.notCalled)

    const executionItem = agent
      .getState()
      .getTimeline()
      .find((item) => item.type === 'execution_completed') as { summary?: string } | undefined

    assert.exists(executionItem)
    assert.equal(executionItem?.summary, 'Execution stopped by user')
  })
})
