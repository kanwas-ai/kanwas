import { test } from '@japa/runner'
import { CanvasAgent } from '#agent/index'
import { createAnthropicProvider, createOpenAIProvider } from '#agent/providers/index'
import { resolveProductAgentFlow } from '#agent/flow'

test.group('Cache breakpoint consolidation — only last system block gets breakpoint', () => {
  test('Anthropic: multiple system blocks, only last has cacheControl', ({ assert }) => {
    const provider = createAnthropicProvider('test-key')
    const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', provider)

    const flow = resolveProductAgentFlow({
      definition,
      mainSystemPrompts: ['Block A', 'Block B'],
      subagentPromptByName: { explore: 'Explorer', external: 'External' },
      provider,
    })

    const prompts = flow.main.systemPrompts
    assert.equal(prompts.length, 2)

    for (let i = 0; i < prompts.length - 1; i++) {
      assert.isUndefined(prompts[i].providerOptions, `block ${i} should have no providerOptions`)
    }
    assert.equal((prompts[1].providerOptions as any)?.anthropic?.cacheControl?.type, 'ephemeral')
  })

  test('Anthropic subagent: breakpoint on last block only', ({ assert }) => {
    const provider = createAnthropicProvider('test-key')
    const definition = CanvasAgent.getProductAgentFlowDefinition('claude-sonnet-4-6', provider)

    const flow = resolveProductAgentFlow({
      definition,
      mainSystemPrompts: ['Main'],
      subagentPromptByName: { explore: 'Explorer prompt', external: 'External prompt' },
      provider,
    })

    const explore = flow.subagents.find((s) => s.name === 'explore')!
    for (let i = 0; i < explore.systemPrompts.length - 1; i++) {
      assert.isUndefined(explore.systemPrompts[i].providerOptions, `subagent block ${i} should have no providerOptions`)
    }
    const last = explore.systemPrompts[explore.systemPrompts.length - 1]
    assert.equal((last.providerOptions as any)?.anthropic?.cacheControl?.type, 'ephemeral')
  })

  test('OpenAI: system blocks do not carry prompt cache metadata', ({ assert }) => {
    const provider = createOpenAIProvider('test-openai-key')
    const definition = CanvasAgent.getProductAgentFlowDefinition('gpt-5.4', provider)

    const flow = resolveProductAgentFlow({
      definition,
      mainSystemPrompts: ['Base prompt'],
      subagentPromptByName: { explore: 'Explorer', external: 'External' },
      provider,
    })

    const prompts = flow.main.systemPrompts
    assert.equal(prompts.length, 1)
    assert.isUndefined(prompts[0].providerOptions)
  })
})
