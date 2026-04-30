import { test } from '@japa/runner'
import { EventStream, State, type AgentEvent } from '#agent/index'
import { createMainToolLoopStreamingHandlers } from '#agent/llm/main_streaming'
import { promptManager } from '#agent/prompt_manager'
import { createOpenAIProvider } from '#agent/providers/openai'
import { createAnthropicProvider } from '#agent/providers/anthropic'
import type { AgentProviderCallOptions } from '#agent/providers/types'
import {
  createProductAgentFlowDefinition,
  createWorkspaceSuggestedTaskFlowDefinition,
  resolveProductAgentFlow,
} from '#agent/flow'
import { z } from 'zod'

const FAKE_OPENAI_KEY = 'test-openai-key'

function getOpenAIOptions(options: AgentProviderCallOptions) {
  if (!options.openai) {
    throw new Error('Expected OpenAI provider options')
  }

  return options.openai
}

// ============================================================================
// Step 2: generationOptions(flowHint)
// ============================================================================

test.group('OpenAI generationOptions with flowHint', () => {
  const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
  const modelId = provider.modelTiers.medium

  test('execute hint returns high effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'execute' }))
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('plan hint returns high effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'plan' }))
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('explore hint returns high effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'explore' }))
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('external hint returns medium effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'external' }))
    assert.equal(openai.reasoningEffort, 'medium')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('generate hint returns xhigh effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'generate' }))
    assert.equal(openai.reasoningEffort, 'xhigh')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('no hint defaults to high effort and low verbosity', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId }))
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.reasoningSummary, 'auto')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('utility hint keeps medium verbosity without reasoning summaries', ({ assert }) => {
    const openai = getOpenAIOptions(provider.generationOptions({ modelId, flowHint: 'utility' }))
    assert.equal(openai.textVerbosity, 'medium')
    assert.notProperty(openai, 'reasoningSummary')
  })
})

test.group('Anthropic generationOptions follow model capabilities', () => {
  const provider = createAnthropicProvider('test-key')
  const adaptiveModelId = provider.modelTiers.medium
  const utilityModelId = provider.modelTiers.small

  test('returns same adaptive thinking for Sonnet regardless of hint', ({ assert }) => {
    const noHint = provider.generationOptions({ modelId: adaptiveModelId })
    const execute = provider.generationOptions({ modelId: adaptiveModelId, flowHint: 'execute' })
    const plan = provider.generationOptions({ modelId: adaptiveModelId, flowHint: 'plan' })
    const explore = provider.generationOptions({ modelId: adaptiveModelId, flowHint: 'explore' })
    const external = provider.generationOptions({ modelId: adaptiveModelId, flowHint: 'external' })
    const generate = provider.generationOptions({ modelId: adaptiveModelId, flowHint: 'generate' })

    assert.deepEqual(noHint, execute)
    assert.deepEqual(noHint, plan)
    assert.deepEqual(noHint, explore)
    assert.deepEqual(noHint, external)
    assert.deepEqual(noHint, generate)
    assert.deepEqual(noHint, {
      anthropic: {
        thinking: { type: 'adaptive' },
      },
    })
  })

  test('returns no thinking options for Haiku utility calls', ({ assert }) => {
    const opts = provider.generationOptions({ modelId: utilityModelId, flowHint: 'utility' })
    assert.deepEqual(opts, {})
  })
})

// ============================================================================
// Step 2: Flow definitions pass correct hints
// ============================================================================

test.group('Flow definitions pass correct flowHints', () => {
  test('product agent main flow uses execute hint', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const flow = createProductAgentFlowDefinition('gpt-5.4', provider)

    // Main agent should use 'execute' hint → high/low
    const openai = getOpenAIOptions(flow.providerOptions)
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('explore subagent uses explore hint', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const flow = createProductAgentFlowDefinition('gpt-5.4', provider)
    const explore = flow.subagents.find((s) => s.name === 'explore')!

    assert.equal(explore.model, 'small')
    assert.equal(explore.modelId, provider.modelTiers.small)
    assert.equal(explore.maxOutputTokens, 800)
    const openai = getOpenAIOptions(explore.providerOptions)
    assert.equal(openai.reasoningEffort, 'high')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('external subagent uses external hint', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const flow = createProductAgentFlowDefinition('gpt-5.4', provider)
    const external = flow.subagents.find((s) => s.name === 'external')!

    assert.equal(external.model, 'medium')
    assert.equal(external.modelId, provider.modelTiers.medium)
    assert.isUndefined(external.maxOutputTokens)
    const openai = getOpenAIOptions(external.providerOptions)
    assert.equal(openai.reasoningEffort, 'medium')
    assert.equal(openai.textVerbosity, 'low')
  })

  test('suggested tasks flow uses generate hint', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const flow = createWorkspaceSuggestedTaskFlowDefinition({
      model: 'gpt-5.4',
      responseSchema: z.object({ tasks: z.array(z.string()) }),
      provider,
    })

    const openai = getOpenAIOptions(flow.providerOptions)
    assert.equal(openai.reasoningEffort, 'xhigh')
    assert.equal(openai.textVerbosity, 'low')
  })
})

// ============================================================================
// Step 3: Phase parameter on OpenAI assistant messages
// ============================================================================

test.group('OpenAI formatMessages phase annotations', () => {
  const provider = createOpenAIProvider(FAKE_OPENAI_KEY)

  test('annotates last assistant message as final_answer', ({ assert }) => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'thinking...' },
      { role: 'user', content: 'continue' },
      { role: 'assistant', content: 'done' },
    ] as any[]

    const result = provider.formatMessages(messages)

    assert.equal((result[1] as any).providerOptions.openai.phase, 'commentary')
    assert.equal((result[3] as any).providerOptions.openai.phase, 'final_answer')
  })

  test('single assistant message gets final_answer', ({ assert }) => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'response' },
    ] as any[]

    const result = provider.formatMessages(messages)
    assert.equal((result[1] as any).providerOptions.openai.phase, 'final_answer')
  })

  test('does not annotate user messages', ({ assert }) => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'response' },
    ] as any[]

    const result = provider.formatMessages(messages)
    assert.notProperty(result[0] as any, 'providerOptions')
  })

  test('handles empty messages array', ({ assert }) => {
    const result = provider.formatMessages([])
    assert.deepEqual(result, [])
  })

  test('preserves existing providerOptions on assistant messages', ({ assert }) => {
    const messages = [
      {
        role: 'assistant',
        content: 'response',
        providerOptions: { openai: { custom: true } },
      },
    ] as any[]

    const result = provider.formatMessages(messages)
    assert.equal((result[0] as any).providerOptions.openai.phase, 'final_answer')
    assert.equal((result[0] as any).providerOptions.openai.custom, true)
  })
})

test.group('Anthropic formatMessages unchanged', () => {
  test('does not add phase annotations', ({ assert }) => {
    const provider = createAnthropicProvider('test-key')
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'response' },
    ] as any[]

    const result = provider.formatMessages(messages)

    // Anthropic only adds cache control to last message, no phase
    assert.notProperty((result[1] as any).providerOptions?.openai || {}, 'phase')
  })
})

// ============================================================================
// Step 4: Provider-specific prompt files
// ============================================================================

test.group('provider-specific prompt files', () => {
  test('OpenAI default base prompt keeps shell guidance concise', ({ assert }) => {
    promptManager.clearCache()

    const prompt = promptManager.getPrompt('default_base', {}, 'openai')

    assert.notInclude(prompt, '## OpenAI Execution Rules')
    assert.notInclude(prompt, 'tool_persistence')
    assert.notInclude(prompt, 'ask_question_guidance')
    assert.notInclude(prompt, 'output_contract')
    assert.include(prompt, 'verification')
    assert.include(prompt, '- `read_file` for normal workspace reads and directory listings')
    assert.include(prompt, '- `write_file` to create new Markdown or YAML files in `/workspace`')
    assert.include(prompt, '- `edit_file` to change existing Markdown or YAML files')
    assert.include(prompt, '- `delete_file` to delete existing Markdown or YAML files')
    assert.include(
      prompt,
      '- `shell` for moves, renames, extraction, verification, non-text deletes, and non-text operations'
    )
    assert.notInclude(prompt, '`action.commands`')
    assert.notInclude(prompt, 'current working directory carries over')
    assert.notInclude(prompt, 'set `workdir` to `/workspace`')
    assert.notInclude(prompt, '["bash", "-lc", "..."]')
    assert.notInclude(prompt, '`progress()`')
    assert.notInclude(prompt, '- **progress**:')
  })

  test('Anthropic default base prompt stays free of OpenAI-specific guidance', ({ assert }) => {
    promptManager.clearCache()

    const prompt = promptManager.getPrompt('default_base', {}, 'anthropic')

    assert.notInclude(prompt, 'tool_persistence')
    assert.notInclude(prompt, 'ask_question_guidance')
  })

  test('shared prompt files fall back to the unsuffixed version for both providers', ({ assert }) => {
    promptManager.clearCache()

    const openaiPrompt = promptManager.getPrompt('workspace_suggested_tasks', {}, 'openai')
    const anthropicPrompt = promptManager.getPrompt('workspace_suggested_tasks', {}, 'anthropic')

    assert.equal(openaiPrompt, anthropicPrompt)
  })

  test('resolveProductAgentFlow does not append extra provider sections', ({ assert }) => {
    const provider = createOpenAIProvider(FAKE_OPENAI_KEY)
    const definition = createProductAgentFlowDefinition('gpt-5.4', provider)

    const resolved = resolveProductAgentFlow({
      definition,
      mainSystemPrompts: ['Base system prompt'],
      subagentPromptByName: { explore: 'Explorer prompt', external: 'External prompt' },
      provider,
    })

    assert.equal(resolved.main.systemPrompts.length, 1)
    assert.include(resolved.main.systemPrompts[0].content, 'Base system prompt')
  })
})

// ============================================================================
// Step 5: OpenAI phase-aware text routing
// ============================================================================

function createStreamingHarness(providerName: 'anthropic' | 'openai' = 'openai') {
  const eventStream = new EventStream()
  const state = new State(eventStream)
  const events: AgentEvent[] = []

  eventStream.on('agent_event', (event: AgentEvent) => {
    events.push(event)
  })

  const handlers = createMainToolLoopStreamingHandlers({
    state,
    eventStream,
    providerName,
  } as any)

  return { handlers, events, state }
}

test.group('OpenAI phase-aware text routing', () => {
  test('commentary phase streams as progress and persists a progress item', ({ assert }) => {
    const { handlers, state, events } = createStreamingHarness('openai')

    handlers.onChunk({ type: 'text-start', id: 'msg_1', providerMetadata: { openai: { phase: 'commentary' } } })
    handlers.onChunk({ type: 'text-delta', id: 'msg_1', text: 'I will read the file first.' })
    handlers.onChunk({ type: 'text-end', id: 'msg_1', providerMetadata: { openai: { phase: 'commentary' } } })

    const progressItems = state.getTimeline().filter((i) => i.type === 'progress')
    assert.equal(progressItems.length, 1)
    assert.equal((progressItems[0] as any).message, 'I will read the file first.')
    assert.equal((progressItems[0] as any).streaming, false)

    const progressEvents = events.filter((event) => event.type === 'progress_streaming')
    assert.equal(progressEvents.length, 1)
    assert.equal(
      progressEvents[0]?.type === 'progress_streaming' ? progressEvents[0].streamingText : undefined,
      'I will read the file first.'
    )
  })

  test('final_answer phase streams as chat instead of progress', ({ assert }) => {
    const { handlers, state, events } = createStreamingHarness('openai')

    handlers.onChunk({ type: 'text-start', id: 'msg_2', providerMetadata: { openai: { phase: 'final_answer' } } })
    handlers.onChunk({ type: 'text-delta', id: 'msg_2', text: 'Here is my answer.' })
    handlers.onChunk({ type: 'text-end', id: 'msg_2', providerMetadata: { openai: { phase: 'final_answer' } } })

    const progressItems = state.getTimeline().filter((i) => i.type === 'progress')
    assert.equal(progressItems.length, 0)

    const chatEvents = events.filter((event) => event.type === 'chat_streaming')
    assert.equal(chatEvents.length, 1)
    assert.equal(
      chatEvents[0]?.type === 'chat_streaming' ? chatEvents[0].streamingText : undefined,
      'Here is my answer.'
    )
    assert.equal(handlers.getTextOutputItemId(), chatEvents[0]?.itemId)
  })

  test('missing OpenAI phase falls back to progress when a tool starts', ({ assert }) => {
    const { handlers, state, events } = createStreamingHarness('openai')

    handlers.onChunk({ type: 'text-start', id: 'msg_3' })
    handlers.onChunk({ type: 'text-delta', id: 'msg_3', text: 'Let me inspect the repo first.' })
    handlers.onChunk({ type: 'text-end', id: 'msg_3' })
    handlers.onChunk({ type: 'tool-input-start', id: 'tool_1', toolName: 'shell' })

    const progressItems = state.getTimeline().filter((i) => i.type === 'progress')
    assert.equal(progressItems.length, 1)
    assert.equal((progressItems[0] as any).message, 'Let me inspect the repo first.')

    const progressEvents = events.filter((event) => event.type === 'progress_streaming')
    assert.equal(progressEvents.length, 0)
  })

  test('missing OpenAI phase falls back to chat at step end', ({ assert }) => {
    const { handlers, state, events } = createStreamingHarness('openai')

    handlers.onChunk({ type: 'text-start', id: 'msg_4' })
    handlers.onChunk({ type: 'text-delta', id: 'msg_4', text: 'Answer with unknown phase.' })
    handlers.onChunk({ type: 'text-end', id: 'msg_4' })
    handlers.onChunk({ type: 'finish-step' })

    const progressItems = state.getTimeline().filter((i) => i.type === 'progress')
    assert.equal(progressItems.length, 0)

    const chatEvents = events.filter((event) => event.type === 'chat_streaming')
    assert.equal(chatEvents.length, 1)
    assert.equal(
      chatEvents[0]?.type === 'chat_streaming' ? chatEvents[0].streamingText : undefined,
      'Answer with unknown phase.'
    )
  })

  test('Anthropic text streams as chat, not progress', ({ assert }) => {
    const { handlers, state, events } = createStreamingHarness('anthropic')

    handlers.onChunk({ type: 'text-delta', id: 'msg_5', text: 'Some text' })

    const progressItems = state.getTimeline().filter((i) => i.type === 'progress')
    assert.equal(progressItems.length, 0)

    const chatEvents = events.filter((event) => event.type === 'chat_streaming')
    assert.equal(chatEvents.length, 1)
    assert.equal(chatEvents[0]?.type === 'chat_streaming' ? chatEvents[0].streamingText : undefined, 'Some text')
  })
})
