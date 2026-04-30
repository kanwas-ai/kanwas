import { test } from '@japa/runner'
import { createAnthropicProvider, createOpenAIProvider, createProviderFromConfig } from '#agent/providers/index'

const FAKE_OPENAI_KEY = 'test-openai-key'

test.group('Provider model tiers and overrides', () => {
  test('OpenAI defaults to generic GPT-5.4 tiers', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)

    assert.deepEqual(provider.modelTiers, {
      small: 'gpt-5.4-mini',
      medium: 'gpt-5.4',
      big: 'gpt-5.4',
    })
    assert.deepEqual(provider.subagentModelTiers, {
      explore: 'small',
      external: 'medium',
    })
  })

  test('OpenAI applies model and reasoning overrides', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY, {
      model: 'gpt-5.4-mini',
      reasoningEffort: 'low',
    })
    const modelId = provider.modelTiers.big

    assert.deepEqual(provider.modelTiers, {
      small: 'gpt-5.4-mini',
      medium: 'gpt-5.4-mini',
      big: 'gpt-5.4-mini',
    })
    assert.equal((provider.generationOptions({ modelId, flowHint: 'execute' }) as any).openai.reasoningEffort, 'low')
    assert.equal((provider.generationOptions({ modelId, flowHint: 'execute' }) as any).openai.reasoningSummary, 'auto')
    assert.equal((provider.generationOptions({ modelId, flowHint: 'utility' }) as any).openai.reasoningEffort, 'low')
  })

  test('OpenAI disables reasoning summaries when reasoning effort override is none', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY, {
      reasoningEffort: 'none',
    })
    const modelId = provider.modelTiers.big

    assert.equal((provider.generationOptions({ modelId, flowHint: 'execute' }) as any).openai.reasoningEffort, 'none')
    assert.notProperty((provider.generationOptions({ modelId, flowHint: 'execute' }) as any).openai, 'reasoningSummary')
  })

  test('OpenAI ignores invalid reasoning override values', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY, {
      reasoningEffort: 'definitely-not-valid' as any,
    })
    const modelId = provider.modelTiers.big

    assert.equal((provider.generationOptions({ modelId, flowHint: 'execute' }) as any).openai.reasoningEffort, 'high')
  })

  test('Anthropic uses adaptive thinking only for Sonnet/Opus 4.6 models', ({ assert }) => {
    const provider = createAnthropicProvider('test-key', {
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'medium',
    })
    const modelId = provider.modelTiers.big

    assert.deepEqual(provider.modelTiers, {
      small: 'claude-sonnet-4-6',
      medium: 'claude-sonnet-4-6',
      big: 'claude-sonnet-4-6',
    })
    assert.deepEqual(provider.subagentModelTiers, {
      explore: 'medium',
      external: 'medium',
    })
    assert.deepEqual(provider.generationOptions({ modelId, flowHint: 'execute' }), {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    })
    assert.deepEqual(provider.generationOptions({ modelId: provider.modelTiers.small, flowHint: 'utility' }), {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    })
  })

  test('Anthropic leaves Haiku utility calls without adaptive thinking', ({ assert }) => {
    const provider = createAnthropicProvider('test-key')

    assert.deepEqual(provider.generationOptions({ modelId: provider.modelTiers.small, flowHint: 'utility' }), {})
    assert.deepEqual(provider.generationOptions({ modelId: provider.modelTiers.big, flowHint: 'execute' }), {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    })
  })

  test('createProviderFromConfig trims and forwards user overrides', ({ assert }) => {
    const provider = createProviderFromConfig(
      {
        anthropicApiKey: 'test-key',
        openaiApiKey: FAKE_OPENAI_KEY,
      },
      {
        provider: 'openai',
        model: ' gpt-5.4 ',
        reasoningEffort: ' low ',
      }
    )

    assert.equal(provider.name, 'openai')
    assert.equal(provider.modelTiers.big, 'gpt-5.4')
    assert.equal(
      (provider.generationOptions({ modelId: provider.modelTiers.big, flowHint: 'execute' }) as any).openai
        .reasoningEffort,
      'low'
    )
  })
})
