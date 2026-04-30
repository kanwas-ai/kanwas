import { test } from '@japa/runner'
import sinon from 'sinon'
import { ToolLoopAgent, type ModelMessage } from 'ai'
import { LLM } from '#agent/llm'
import { CanvasAgent } from '#agent/index'
import { createOpenAIProvider } from '#agent/providers/openai'
import { buildOpenAIThreadContext } from '#agent/providers/runtime_options'
import type { ResolvedProductAgentFlow } from '#agent/flow'
import type { ToolContext } from '#agent/tools/context'

const FAKE_OPENAI_KEY = 'test-openai-key'
const mockProvider = createOpenAIProvider(FAKE_OPENAI_KEY)

function createMockPosthogService() {
  const spans: Record<string, any>[] = []

  return {
    spans,
    wrapModelWithTracing: (model: unknown) => model,
    captureAiGeneration: () => undefined,
    captureAiSpan: (payload: Record<string, any>) => {
      spans.push(payload)
    },
  }
}

function createMockFlow(): ResolvedProductAgentFlow {
  const definition = CanvasAgent.getProductAgentFlowDefinition(mockProvider.modelTiers.big, mockProvider)

  return CanvasAgent.resolveInvocationFlow({
    definition,
    mainSystemPrompts: ['MAIN SYSTEM'],
    subagentPromptByName: {
      explore: 'EXPLORE SYSTEM',
      external: 'EXTERNAL SYSTEM',
    },
    provider: mockProvider,
  })
}

function createMockToolContext(
  flow: ResolvedProductAgentFlow,
  posthogService: ReturnType<typeof createMockPosthogService> = createMockPosthogService()
): ToolContext {
  return {
    state: {
      currentContext: {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        aiSessionId: 'thread-1',
      },
      findTimelineItem: () => null,
      updateTimelineItem: () => undefined,
      addTimelineItem: () => 'timeline-item',
    } as any,
    eventStream: {
      emitEvent: () => undefined,
    } as any,
    llm: {} as any,
    sandboxManager: {} as any,
    agent: { source: 'main' },
    flow,
    workspaceDocumentService: {} as any,
    webSearchService: {} as any,
    posthogService: posthogService as any,
    traceContext: {
      traceId: 'trace-1',
      sessionId: 'thread-1',
      activeParentSpanId: 'parent-span-1',
    },
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
    abortSignal: new AbortController().signal,
  }
}

test.group('OpenAI thread lanes', (group) => {
  let streamStub: sinon.SinonStub
  let capturedHeaders: Record<string, string> | undefined
  let capturedProviderOptions: any
  let capturedMaxOutputTokens: number | undefined

  group.each.setup(() => {
    capturedHeaders = undefined
    capturedProviderOptions = undefined
    capturedMaxOutputTokens = undefined

    streamStub = sinon.stub(ToolLoopAgent.prototype, 'stream').callsFake(async function (this: any, ...args: any[]) {
      const [{ messages }] = args as [{ messages: ModelMessage[] }]
      capturedHeaders = this?.settings?.headers
      capturedProviderOptions = this?.settings?.providerOptions
      capturedMaxOutputTokens = this?.settings?.maxOutputTokens
      await this?.settings?.prepareStep?.({ stepNumber: 0, messages })

      return {
        fullStream: (async function* () {})(),
        response: Promise.resolve({ messages: [] }),
        steps: Promise.resolve([]),
        text: Promise.resolve('ok'),
      } as any
    })
  })

  group.each.teardown(() => {
    streamStub.restore()
  })

  test('main agent uses a stable main-lane thread identity', async ({ assert }) => {
    const llm = new LLM({
      provider: mockProvider,
      model: mockProvider.modelTiers.big,
      posthogService: createMockPosthogService() as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)
    const expectedThreadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-1',
      aiSessionId: 'thread-1',
      modelId: flow.main.model,
      agentSource: 'main',
      flowName: flow.name,
    })

    await llm.generateWithTools({
      messages: [{ role: 'user', content: 'Hello' } as ModelMessage],
      systemPrompts: flow.main.systemPrompts,
      stopWhen: flow.main.stopWhen,
      providerOptions: flow.main.providerOptions,
      context,
      abortSignal: context.abortSignal,
    })

    const expectedLaneId = 'kanwas|workspace:workspace-1|thread:thread-1|flow:product-agent|lane:main'

    assert.equal(expectedThreadContext?.laneId, expectedLaneId)
    assert.match(expectedThreadContext?.providerLaneKey ?? '', /^kwlane_v1_[A-Za-z0-9_-]+$/)
    assert.isAtMost(expectedThreadContext?.providerLaneKey.length ?? 0, 64)
    assert.deepEqual(capturedHeaders, expectedThreadContext?.headers)
    assert.equal(capturedProviderOptions?.openai?.promptCacheKey, expectedThreadContext?.providerLaneKey)
    assert.isUndefined(capturedMaxOutputTokens)
    assert.notEqual(expectedThreadContext?.providerLaneKey, expectedLaneId)
  })

  test('subagents use stable per-type lanes distinct from the main lane', async ({ assert }) => {
    const llm = new LLM({
      provider: mockProvider,
      model: mockProvider.modelTiers.big,
      posthogService: createMockPosthogService() as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)
    const expectedThreadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-1',
      aiSessionId: 'thread-1',
      modelId: mockProvider.modelTiers.medium,
      agentSource: 'subagent',
      flowName: flow.name,
      agentType: 'explore',
    })
    const mainThreadContext = buildOpenAIThreadContext({
      providerName: 'openai',
      workspaceId: 'workspace-1',
      aiSessionId: 'thread-1',
      modelId: flow.main.model,
      agentSource: 'main',
      flowName: flow.name,
    })

    await llm.runSubagent({
      agentType: 'explore',
      objective: 'Inspect the workspace',
      context,
      workspaceTree: 'root/\n  note.md\n',
      subagentId: 'subagent-1',
      toolCallId: 'tool-call-1',
    })

    const expectedLaneId = 'kanwas|workspace:workspace-1|thread:thread-1|flow:product-agent|lane:subagent:explore'

    assert.equal(expectedThreadContext?.laneId, expectedLaneId)
    assert.match(expectedThreadContext?.providerLaneKey ?? '', /^kwlane_v1_[A-Za-z0-9_-]+$/)
    assert.isAtMost(expectedThreadContext?.providerLaneKey.length ?? 0, 64)
    assert.deepEqual(capturedHeaders, expectedThreadContext?.headers)
    assert.equal(capturedProviderOptions?.openai?.promptCacheKey, expectedThreadContext?.providerLaneKey)
    assert.isUndefined(capturedMaxOutputTokens)
    assert.notEqual(expectedThreadContext?.providerLaneKey, expectedLaneId)
    assert.notEqual(expectedThreadContext?.providerLaneKey, mainThreadContext?.providerLaneKey)
  })

  test('main-agent span includes replay trace properties when provided', async ({ assert }) => {
    const posthogService = createMockPosthogService()
    const llm = new LLM({
      provider: mockProvider,
      model: mockProvider.modelTiers.big,
      posthogService: posthogService as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow, posthogService)

    await llm.generateWithTools({
      messages: [{ role: 'user', content: 'Hello again' } as ModelMessage],
      systemPrompts: flow.main.systemPrompts,
      stopWhen: flow.main.stopWhen,
      providerOptions: flow.main.providerOptions,
      context,
      abortSignal: context.abortSignal,
      traceProperties: {
        parent_messages_hash: 'abc123',
        replayed_messages_hash: 'abc123',
        replay_hash_match: true,
      },
    })

    const mainAgentSpan = posthogService.spans.find((span) => span.spanName === 'main-agent')

    assert.exists(mainAgentSpan)
    assert.equal(mainAgentSpan?.properties?.parent_messages_hash, 'abc123')
    assert.equal(mainAgentSpan?.properties?.replayed_messages_hash, 'abc123')
    assert.isTrue(mainAgentSpan?.properties?.replay_hash_match)
  })
})
