import { test } from '@japa/runner'
import sinon from 'sinon'
import { CanvasAgent } from '#agent/index'
import { createAnthropicProvider } from '#agent/providers/index'

const mockProvider = createAnthropicProvider('test-key')

test.group('CanvasAgent resolveFlow cleanup', () => {
  test('does not open workspace connections when flow resolution fails', async ({ assert }) => {
    const getWorkspaceDocumentSpy = sinon.spy()

    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'test-model',
      workspaceDocumentService: {
        getWorkspaceDocument: getWorkspaceDocumentSpy,
      } as any,
      webSearchService: {} as any,
      sandboxRegistry: {} as any,
      posthogService: {} as any,
    })

    const buildSystemPromptsStub = sinon
      .stub(agent as any, 'buildSystemPrompts')
      .rejects(new Error('flow-build-failure'))

    const context = {
      canvasId: null,
      workspaceId: 'workspace-1',
      organizationId: 'org-1',
      userId: 'user-1',
      uploadedFiles: null,
      agentMode: 'thinking' as const,
      yoloMode: false,
      selectedText: null,
      authToken: 'token',
      authTokenId: 'token-id',
      correlationId: 'corr-1',
      invocationId: 'inv-1',
      aiSessionId: 'session-1',
      invocationSource: null,
      workspaceTree: null,
      canvasPath: null,
      activeCanvasContext: null,
      selectedNodePaths: null,
      mentionedNodePaths: null,
    }

    try {
      await assert.rejects(() => agent.resolveFlow(context), 'flow-build-failure')
      assert.isFalse(getWorkspaceDocumentSpy.called)
    } finally {
      buildSystemPromptsStub.restore()
    }
  })
})
