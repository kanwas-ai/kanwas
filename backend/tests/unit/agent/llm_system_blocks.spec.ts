import { test } from '@japa/runner'
import sinon from 'sinon'
import { ToolLoopAgent, type ModelMessage } from 'ai'
import { LLM } from '#agent/llm'
import { CanvasAgent } from '#agent/index'
import { createAnthropicProvider } from '#agent/providers/index'
import type { ResolvedProductAgentFlow } from '#agent/flow'
import type { ToolContext } from '#agent/tools/context'

const mockProvider = createAnthropicProvider('test-key')

function createMockPosthogService() {
  return {
    wrapModelWithTracing: (model: unknown) => model,
    captureAiGeneration: () => undefined,
    captureAiSpan: () => undefined,
  }
}

function createMockFlow(): ResolvedProductAgentFlow {
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

  return {
    ...flow,
    subagents: flow.subagents.map((subagent) =>
      subagent.name === 'external'
        ? {
            ...subagent,
            enableComposio: false,
          }
        : subagent
    ),
  }
}

function createMockToolContext(flow: ResolvedProductAgentFlow): ToolContext {
  const posthogService = createMockPosthogService()

  return {
    state: {
      currentContext: {
        userId: 'user-1',
        workspaceId: 'workspace-1',
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
      sessionId: 'session-1',
      activeParentSpanId: 'parent-span-1',
    },
    traceIdentity: {
      distinctId: 'user-1',
      workspaceId: 'workspace-1',
      organizationId: 'organization-1',
      invocationId: 'invocation-1',
      correlationId: 'correlation-1',
    },
    providerName: 'anthropic',
    supportsNativeTools: true,
    userId: 'user-1',
    abortSignal: new AbortController().signal,
  }
}

test.group('LLM system block ordering', (group) => {
  let streamStub: sinon.SinonStub
  let streamCalls: ModelMessage[][]
  let instructionCalls: ModelMessage[][]
  let originalAnthropicApiKey: string | undefined

  group.setup(() => {
    originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  group.teardown(() => {
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
      return
    }

    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  })

  group.each.setup(() => {
    streamCalls = []
    instructionCalls = []

    streamStub = sinon.stub(ToolLoopAgent.prototype, 'stream').callsFake(async function (this: any, ...args: any[]) {
      const [{ messages }] = args as [{ messages: ModelMessage[] }]
      const instructions = this?.settings?.instructions
      if (typeof instructions === 'string') {
        instructionCalls.push([{ role: 'system', content: instructions } as ModelMessage])
      } else if (Array.isArray(instructions)) {
        instructionCalls.push(instructions as ModelMessage[])
      } else if (instructions) {
        instructionCalls.push([instructions as ModelMessage])
      } else {
        instructionCalls.push([])
      }
      streamCalls.push(messages)

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

  test('should keep only the base system block for main LLM prompt', async ({ assert }) => {
    const llm = new LLM({
      provider: mockProvider,
      model: 'test-model',
      posthogService: createMockPosthogService() as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)

    await llm.generateWithTools({
      messages: [{ role: 'user', content: 'Hello' } as ModelMessage],
      systemPrompts: flow.main.systemPrompts,
      stopWhen: flow.main.stopWhen,
      providerOptions: flow.main.providerOptions,
      context,
      abortSignal: context.abortSignal,
    })

    const sentMessages = streamCalls[0]
    const sentInstructions = instructionCalls[0]
    assert.exists(sentMessages)
    assert.exists(sentInstructions)
    assert.equal(sentInstructions[0].role, 'system')
    assert.equal((sentInstructions[0] as any).content, 'MAIN SYSTEM')
    assert.lengthOf(sentInstructions, 1)
    assert.equal(sentMessages[0].role, 'user')
  })

  test('should keep base and objective system blocks for explore subagent', async ({ assert }) => {
    const llm = new LLM({
      provider: mockProvider,
      model: 'test-model',
      posthogService: createMockPosthogService() as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)

    await llm.runSubagent({
      agentType: 'explore',
      objective: 'Inspect workspace',
      context,
      workspaceTree: 'root/\n  note.md\n',
    })

    const sentMessages = streamCalls[0]
    const sentInstructions = instructionCalls[0]
    assert.exists(sentMessages)
    assert.exists(sentInstructions)
    assert.equal(sentInstructions[0].role, 'system')
    assert.equal((sentInstructions[0] as any).content, 'EXPLORE SYSTEM')
    assert.equal(sentInstructions[1].role, 'system')
    assert.equal((sentInstructions[1] as any).content, '## Current Objective\n\nInspect workspace')
    assert.lengthOf(sentInstructions, 2)
    assert.equal(sentMessages[0].role, 'user')
  })

  test('should keep base and objective system blocks for external subagent', async ({ assert }) => {
    const llm = new LLM({
      provider: mockProvider,
      model: 'test-model',
      posthogService: createMockPosthogService() as any,
    })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)

    await llm.runSubagent({
      agentType: 'external',
      objective: 'Call external service',
      context,
    })

    const sentMessages = streamCalls[0]
    const sentInstructions = instructionCalls[0]
    assert.exists(sentMessages)
    assert.exists(sentInstructions)
    assert.equal(sentInstructions[0].role, 'system')
    assert.equal((sentInstructions[0] as any).content, 'EXTERNAL SYSTEM')
    assert.equal(sentInstructions[1].role, 'system')
    assert.equal((sentInstructions[1] as any).content, '## Current Objective\n\nCall external service')
    assert.lengthOf(sentInstructions, 2)
    assert.equal(sentMessages[0].role, 'user')
  })

  test('should not emit manual generation events for explore subagent', async ({ assert }) => {
    let generationCount = 0
    const posthogService = {
      wrapModelWithTracing: (model: unknown) => model,
      captureAiGeneration: () => {
        generationCount += 1
      },
      captureAiSpan: () => undefined,
    }

    const llm = new LLM({ provider: mockProvider, model: 'test-model', posthogService: posthogService as any })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)
    context.posthogService = posthogService as any

    await llm.runSubagent({
      agentType: 'explore',
      objective: 'Inspect workspace',
      context,
      workspaceTree: 'root/\n  note.md\n',
    })

    assert.equal(generationCount, 0)
  })

  test('should not emit manual generation events for main LLM flow', async ({ assert }) => {
    let generationCount = 0
    const posthogService = {
      wrapModelWithTracing: (model: unknown) => model,
      captureAiGeneration: () => {
        generationCount += 1
      },
      captureAiSpan: () => undefined,
    }

    const llm = new LLM({ provider: mockProvider, model: 'test-model', posthogService: posthogService as any })
    const flow = createMockFlow()
    const context = createMockToolContext(flow)
    context.posthogService = posthogService as any

    await llm.generateWithTools({
      messages: [{ role: 'user', content: 'Hello' } as ModelMessage],
      systemPrompts: flow.main.systemPrompts,
      stopWhen: flow.main.stopWhen,
      providerOptions: flow.main.providerOptions,
      context,
      abortSignal: context.abortSignal,
    })

    assert.equal(generationCount, 0)
  })
})
