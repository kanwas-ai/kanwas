import { test } from '@japa/runner'
import { normalizeLlmDefaultConfigUpdates, resolveEffectiveLlmConfig } from '#services/llm_default_config_service'

test.group('LlmDefaultConfigService', () => {
  test('inherits global OpenAI model when user has no LLM override', ({ assert }) => {
    const config = resolveEffectiveLlmConfig({}, { llmProvider: 'openai', llmModel: 'gpt-5.5' })

    assert.deepEqual(config, {
      llmProvider: 'openai',
      llmModel: 'gpt-5.5',
      reasoningEffort: undefined,
    })
  })

  test('keeps per-user model stronger than global model', ({ assert }) => {
    const config = resolveEffectiveLlmConfig(
      { llmProvider: 'openai', llmModel: 'gpt-5.4-mini' },
      { llmProvider: 'openai', llmModel: 'gpt-5.5' }
    )

    assert.deepEqual(config, {
      llmProvider: 'openai',
      llmModel: 'gpt-5.4-mini',
      reasoningEffort: undefined,
    })
  })

  test('does not apply OpenAI global model to per-user Anthropic provider', ({ assert }) => {
    const config = resolveEffectiveLlmConfig(
      { llmProvider: 'anthropic' },
      { llmProvider: 'openai', llmModel: 'gpt-5.5' }
    )

    assert.deepEqual(config, {
      llmProvider: 'anthropic',
      llmModel: undefined,
      reasoningEffort: undefined,
    })
  })

  test('keeps per-user OpenAI reasoning override with global OpenAI model', ({ assert }) => {
    const config = resolveEffectiveLlmConfig(
      { reasoningEffort: 'high' },
      { llmProvider: 'openai', llmModel: 'gpt-5.5' }
    )

    assert.deepEqual(config, {
      llmProvider: 'openai',
      llmModel: 'gpt-5.5',
      reasoningEffort: 'high',
    })
  })

  test('normalizes default config updates', ({ assert }) => {
    const updates = normalizeLlmDefaultConfigUpdates({
      llmProvider: 'openai',
      llmModel: ' gpt-5.5 ',
    })

    assert.deepEqual(updates, {
      llmProvider: 'openai',
      llmModel: 'gpt-5.5',
    })
  })

  test('clears default model when default provider changes without a model payload', ({ assert }) => {
    const updates = normalizeLlmDefaultConfigUpdates(
      { llmProvider: 'anthropic' },
      { llmProvider: 'openai', llmModel: 'gpt-5.5' }
    )

    assert.deepEqual(updates, {
      llmProvider: 'anthropic',
      llmModel: null,
    })
  })

  test('rejects unknown default config fields', ({ assert }) => {
    assert.throws(
      () => normalizeLlmDefaultConfigUpdates({ reasoningEffort: 'high' }),
      /Unsupported LLM default config fields: reasoningEffort/
    )
  })
})
