import { test } from '@japa/runner'
import sinon from 'sinon'
import { CanvasAgent } from '#agent/index'
import { getSubagentFlow, getSubagentNames } from '#agent/flow'
import { createAnthropicProvider, createOpenAIProvider } from '#agent/providers/index'
import { SUGGEST_NEXT_TASKS_TOOL_NAME } from '#agent/tools/suggest_next_tasks'
import SkillService from '#services/skill_service'

const mockProvider = createAnthropicProvider('test-key')
const FAKE_OPENAI_KEY = 'test-openai-key'

test.group('Product agent flow', () => {
  test('builds base and selected mode as separate main system prompt blocks', async ({ assert }) => {
    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'claude-sonnet-4-6',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {} as any,
      posthogService: {} as any,
    })
    const skillStub = sinon.stub(SkillService.prototype, 'getSkillDescriptionsForPrompt').resolves(null)

    try {
      agent.getState().currentContext = {
        ...agent.getState().currentContext,
        userId: 'user-1',
        agentMode: 'direct',
      }

      const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', mockProvider)
      const prompts = await (agent as any).buildSystemPrompts(definition)

      assert.lengthOf(prompts, 2)
      assert.notInclude(prompts[0], 'You are in **Direct** behavior.')
      assert.include(prompts[1], 'You are in **Direct** behavior.')
    } finally {
      skillStub.restore()
    }
  })

  test('keeps onboarding completion prompt after the selected mode prompt', async ({ assert }) => {
    const agent = new CanvasAgent({
      provider: mockProvider,
      model: 'claude-sonnet-4-6',
      workspaceDocumentService: {} as any,
      webSearchService: {} as any,
      sandboxRegistry: {} as any,
      posthogService: {} as any,
    })
    const skillStub = sinon.stub(SkillService.prototype, 'getSkillDescriptionsForPrompt').resolves(null)

    try {
      agent.getState().currentContext = {
        ...agent.getState().currentContext,
        userId: 'user-1',
        agentMode: 'thinking',
      }

      const definition = CanvasAgent.getOnboardingFlowDefinition('claude-sonnet-4-6', mockProvider)
      const prompts = await (agent as any).buildSystemPrompts(definition)

      assert.lengthOf(prompts, 3)
      assert.notInclude(prompts[0], '## You are in thinking mode')
      assert.include(prompts[1], '## You are in thinking mode')
      assert.include(prompts[2], 'onboarding')
    } finally {
      skillStub.restore()
    }
  })

  test('exposes a product-agent base definition', async ({ assert }) => {
    const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', mockProvider)

    assert.equal(definition.name, 'product-agent')
    assert.deepEqual(definition.mainPromptNames, ['default_base'])
    assert.equal(definition.model, 'claude-sonnet-4-6')
    assert.equal(definition.maxIterations, 50)
    assert.lengthOf(definition.subagents, 2)
    assert.deepEqual(
      definition.subagents.map((subagent) => subagent.name),
      ['explore', 'external']
    )
  })

  test('resolves invocation-scoped prompts, subagent dispatch metadata, and stop conditions', async ({ assert }) => {
    const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', mockProvider)

    const flow = CanvasAgent.resolveInvocationFlow({
      definition,
      mainSystemPrompts: ['MAIN PROMPT', 'SKILL PROMPT'],
      subagentPromptByName: {
        explore: 'EXPLORE PROMPT',
        external: 'EXTERNAL PROMPT',
      },
      provider: mockProvider,
    })

    assert.equal(flow.name, 'product-agent')
    assert.equal(flow.main.systemPrompts[0].content, 'MAIN PROMPT')
    assert.equal(flow.main.systemPrompts[1].content, 'SKILL PROMPT')
    assert.equal((flow.main.systemPrompts[1] as any).providerOptions?.anthropic?.cacheControl?.type, 'ephemeral')
    assert.lengthOf(flow.main.stopWhen, 2)

    const subagentNames = getSubagentNames(flow)
    assert.deepEqual(subagentNames, ['explore', 'external'])

    const exploreSubagent = getSubagentFlow(flow, 'explore')
    assert.exists(exploreSubagent)
    assert.equal(exploreSubagent!.description, 'Workspace exploration - finds files, patterns, and gathers context')
    assert.equal(exploreSubagent!.model, 'medium')
    assert.equal(exploreSubagent!.modelId, mockProvider.modelTiers.medium)
    assert.equal(exploreSubagent!.maxOutputTokens, 800)
    assert.equal(exploreSubagent!.systemPrompts[0].content, 'EXPLORE PROMPT')
    assert.lengthOf(exploreSubagent!.stopWhen, 2)

    const externalSubagent = getSubagentFlow(flow, 'external')
    assert.exists(externalSubagent)
    assert.equal(externalSubagent!.model, 'medium')
    assert.equal(externalSubagent!.modelId, mockProvider.modelTiers.medium)
    assert.isUndefined(externalSubagent!.maxOutputTokens)
    assert.equal(externalSubagent!.systemPrompts[0].content, 'EXTERNAL PROMPT')
    assert.equal(externalSubagent!.enableComposio, true)
    assert.lengthOf(externalSubagent!.stopWhen, 2)
  })

  test('exposes a dedicated onboarding definition with onboarding prompts and suggested tasks tool', async ({
    assert,
  }) => {
    const definition = CanvasAgent.getOnboardingFlowDefinition('claude-sonnet-4-6', mockProvider)

    assert.equal(definition.name, 'onboarding')
    assert.deepEqual(definition.mainPromptNames, ['default_base', 'onboarding_completion'])
    assert.exists((definition.buildTools({} as any) as any)[SUGGEST_NEXT_TASKS_TOOL_NAME])
  })

  test('selects the onboarding definition only for onboarding invocations', async ({ assert }) => {
    const productDefinition = CanvasAgent.getInvocationFlowDefinition({
      model: 'claude-sonnet-4-6',
      provider: mockProvider,
      invocationSource: null,
    })
    const onboardingDefinition = CanvasAgent.getInvocationFlowDefinition({
      model: 'claude-sonnet-4-6',
      provider: mockProvider,
      invocationSource: 'onboarding',
    })

    assert.equal(productDefinition.name, 'product-agent')
    assert.isUndefined((productDefinition.buildTools({} as any) as any)[SUGGEST_NEXT_TASKS_TOOL_NAME])
    assert.equal(onboardingDefinition.name, 'onboarding')
    assert.exists((onboardingDefinition.buildTools({} as any) as any)[SUGGEST_NEXT_TASKS_TOOL_NAME])
  })

  test('keeps progress tool for Anthropic main agents', async ({ assert }) => {
    const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', mockProvider)
    const tools = definition.buildTools({} as any) as any

    assert.exists(tools.progress)
    assert.exists(tools.start_task)
  })

  test('omits progress tool for OpenAI main agents', async ({ assert }) => {
    const openAIProvider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const definition = CanvasAgent.getProductAgentFlowDefinition('gpt-5.4', openAIProvider)
    const tools = definition.buildTools({} as any) as any

    assert.isUndefined(tools.progress)
    assert.exists(tools.start_task)
  })
})
