import { test } from '@japa/runner'
import {
  getProviderSelectionFromUserConfig,
  hasUserLlmOverrides,
  normalizeUserLlmConfigUpdates,
} from '#agent/providers/user_config'

test.group('user_llm_config', () => {
  test('normalizes OpenAI overrides', ({ assert }) => {
    const updates = normalizeUserLlmConfigUpdates({
      llmProvider: 'openai',
      llmModel: ' gpt-5.4 ',
      reasoningEffort: ' high ',
    })

    assert.deepEqual(updates, {
      llmProvider: 'openai',
      llmModel: 'gpt-5.4',
      reasoningEffort: 'high',
    })
  })

  test('rejects reasoning overrides when effective provider is Anthropic', ({ assert }) => {
    assert.throws(() => normalizeUserLlmConfigUpdates({ llmProvider: 'anthropic', reasoningEffort: 'high' }), /OpenAI/)
  })

  test('allows clearing fields with nulls', ({ assert }) => {
    const updates = normalizeUserLlmConfigUpdates({
      llmProvider: null,
      llmModel: null,
      reasoningEffort: null,
    })

    assert.deepEqual(updates, {
      llmProvider: null,
      llmModel: null,
      reasoningEffort: null,
    })
  })

  test('clears stale reasoning when switching away from OpenAI', ({ assert }) => {
    const updates = normalizeUserLlmConfigUpdates(
      { llmProvider: 'anthropic' },
      { llmProvider: 'openai', llmModel: 'gpt-5.4', reasoningEffort: 'high' }
    )

    assert.deepEqual(updates, {
      llmProvider: 'anthropic',
      llmModel: null,
      reasoningEffort: null,
    })
  })

  test('rejects unknown config keys', ({ assert }) => {
    assert.throws(
      () => normalizeUserLlmConfigUpdates({ notAllowed: true }),
      /Unsupported LLM config fields: notAllowed/
    )
  })

  test('provider selection drops stale reasoning overrides for Anthropic', ({ assert }) => {
    const selection = getProviderSelectionFromUserConfig({
      llmProvider: 'anthropic',
      reasoningEffort: 'high',
    })

    assert.deepEqual(selection, {
      provider: 'anthropic',
      model: undefined,
      reasoningEffort: undefined,
    })
  })

  test('reasoning-only overrides are valid under the system OpenAI default', ({ assert }) => {
    assert.isTrue(hasUserLlmOverrides({ reasoningEffort: 'high' }))
  })

  test('provider selection inherits admin defaults', ({ assert }) => {
    const selection = getProviderSelectionFromUserConfig({}, { llmProvider: 'openai', llmModel: 'gpt-5.5' })

    assert.deepEqual(selection, {
      provider: 'openai',
      model: 'gpt-5.5',
      reasoningEffort: undefined,
    })
    assert.isTrue(hasUserLlmOverrides({}, { llmProvider: 'openai', llmModel: 'gpt-5.5' }))
  })
})
