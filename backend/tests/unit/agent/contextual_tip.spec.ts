import { test } from '@japa/runner'
import { State } from '#agent/state'
import { contextualTipTool } from '#agent/tools/contextual_tip'
import type { ToolContext } from '#agent/tools/context'

function createToolContext(
  options: { agentMode?: 'thinking' | 'direct'; dismissedTipIds?: string[] } = {}
): ToolContext {
  const state = new State()
  state.setEventStream({ emitEvent: () => undefined } as any)
  state.currentContext = {
    ...state.currentContext,
    agentMode: options.agentMode ?? 'thinking',
    dismissedTipIds: options.dismissedTipIds ?? [],
  }

  return {
    state,
    eventStream: { emitEvent: () => undefined } as any,
    llm: {} as any,
    sandboxManager: {} as any,
    agent: { source: 'main' },
    flow: {} as any,
    workspaceDocumentService: {} as any,
    webSearchService: {} as any,
    posthogService: {} as any,
    traceContext: { traceId: 'trace-1', sessionId: 'session-1' },
    traceIdentity: {
      distinctId: 'user-1',
      workspaceId: 'workspace-1',
      organizationId: 'organization-1',
      invocationId: 'invocation-1',
      correlationId: 'correlation-1',
    },
    providerName: 'openai',
    supportsNativeTools: true,
    userId: 'user-1',
  } as ToolContext
}

function execContext(context: ToolContext, toolCallId = 'tip-tool-call') {
  return { toolCallId, experimental_context: context }
}

test.group('contextual_tip tool', () => {
  test('shows the direct mode tip in thinking mode', async ({ assert }) => {
    const context = createToolContext({ agentMode: 'thinking' })

    const result = await (contextualTipTool as any).execute({ tipId: 'direct_mode_available' }, execContext(context))

    const tipItems = context.state.getTimeline().filter((item) => item.type === 'contextual_tip')

    assert.equal(result, 'Tip shown')
    assert.lengthOf(tipItems, 1)
    assert.deepInclude(tipItems[0], {
      id: 'tip-tool-call',
      type: 'contextual_tip',
      tipId: 'direct_mode_available',
    })
  })

  test('blocks the direct mode tip outside thinking mode', async ({ assert }) => {
    const context = createToolContext({ agentMode: 'direct' })

    const result = await (contextualTipTool as any).execute({ tipId: 'direct_mode_available' }, execContext(context))

    assert.equal(result, 'Direct mode tip is only available in thinking mode')
    assert.lengthOf(context.state.getTimeline(), 0)
  })

  test('respects dismissed direct mode tips', async ({ assert }) => {
    const context = createToolContext({
      agentMode: 'thinking',
      dismissedTipIds: ['direct_mode_available'],
    })

    const result = await (contextualTipTool as any).execute({ tipId: 'direct_mode_available' }, execContext(context))

    assert.equal(result, 'Tip already dismissed by user')
    assert.lengthOf(context.state.getTimeline(), 0)
  })
})
