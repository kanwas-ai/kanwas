import { test } from '@japa/runner'
import { generateText, streamText, stepCountIs } from 'ai'
import { createAnthropicProvider } from '#agent/providers/index'
import { createOpenAIProvider } from '#agent/providers/index'
import env from '#start/env'

/**
 * Live smoke tests for provider formatMessages.
 *
 * Verifies that formatMessages output is accepted by the real API —
 * cache breakpoints (Anthropic), phase annotations (OpenAI) don't
 * cause rejections or silent failures.
 *
 * Run with real API keys:
 *   ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... pnpm test:agent
 *
 * Without real keys, tests are skipped (not failed).
 */

const ANTHROPIC_KEY = env.get('ANTHROPIC_API_KEY')
const OPENAI_KEY = env.get('OPENAI_API_KEY')

function isRealKey(key: string | undefined): boolean {
  return !!key && !key.startsWith('test-')
}

const hasAnthropic = isRealKey(ANTHROPIC_KEY)
const hasOpenai = isRealKey(OPENAI_KEY) && isRealKey(OPENAI_KEY)

/** Drain a streamText result and return the final text + usage. */
async function drainStream(stream: Awaited<ReturnType<typeof streamText>>) {
  for await (const chunk of stream.fullStream) {
    void chunk
  }
  return { text: await stream.text, usage: await stream.usage }
}

test.group('Live: Anthropic formatMessages accepted by API', () => {
  const provider = hasAnthropic ? createAnthropicProvider(ANTHROPIC_KEY!) : null

  test('basic completion with cache breakpoint on system prompt', async ({ assert }) => {
    const model = provider!.createModel(provider!.modelTiers.small)

    const systemPrompts = [
      {
        role: 'system' as const,
        content: 'You are a test assistant. Be extremely brief.',
        providerOptions: provider!.promptOptions(),
      },
    ]

    const messages = provider!.formatMessages([{ role: 'user', content: 'Reply with exactly: PONG' } as any])

    const result = await generateText({
      model,
      messages: [...systemPrompts, ...messages] as any,
      stopWhen: stepCountIs(1),
    })

    assert.include(result.text.toUpperCase(), 'PONG')
  })
    .skip(!hasAnthropic, 'no real ANTHROPIC_API_KEY')
    .timeout(15_000)

  test('formatMessages cache breakpoint on conversation messages accepted', async ({ assert }) => {
    const model = provider!.createModel(provider!.modelTiers.small)

    const messages = provider!.formatMessages([
      { role: 'user', content: 'Say A' } as any,
      { role: 'assistant', content: 'A' } as any,
      { role: 'user', content: 'Now say B' } as any,
    ])

    const result = await generateText({
      model,
      messages: messages as any,
      stopWhen: stepCountIs(1),
    })

    assert.isNotEmpty(result.text)
  })
    .skip(!hasAnthropic, 'no real ANTHROPIC_API_KEY')
    .timeout(15_000)
})

test.group('Live: OpenAI formatMessages accepted by API', () => {
  const provider = hasOpenai ? createOpenAIProvider(OPENAI_KEY!) : null

  test('basic completion with system prompt and generation options', async ({ assert }) => {
    const modelId = provider!.modelTiers.medium
    const model = provider!.createModel(modelId)

    const systemPrompts = [
      {
        role: 'system' as const,
        content: 'You are a test assistant. Be extremely brief.',
        providerOptions: provider!.promptOptions(),
      },
    ]

    const messages = provider!.formatMessages([{ role: 'user', content: 'Reply with exactly: PONG' } as any])

    // Use streamText
    const stream = await streamText({
      model,
      messages: [...systemPrompts, ...messages] as any,
      providerOptions: provider!.generationOptions({ modelId, flowHint: 'execute' }) as any,
      stopWhen: stepCountIs(1),
    })

    const { text } = await drainStream(stream)
    assert.include(text.toUpperCase(), 'PONG')
  })
    .skip(!hasOpenai, 'no real OPENAI_API_KEY')
    .timeout(60_000)

  test('phase annotations on multi-turn conversation accepted', async ({ assert }) => {
    const modelId = provider!.modelTiers.medium
    const model = provider!.createModel(modelId)

    const messages = provider!.formatMessages([
      { role: 'user', content: 'Say A' } as any,
      { role: 'assistant', content: 'A' } as any,
      { role: 'user', content: 'Now say B' } as any,
    ])

    // Verify phase annotations were applied before sending
    const assistantMsg = messages.find((m) => m.role === 'assistant') as any
    assert.equal(assistantMsg.providerOptions?.openai?.phase, 'final_answer')

    const stream = await streamText({
      model,
      messages: messages as any,
      providerOptions: provider!.generationOptions({ modelId, flowHint: 'execute' }) as any,
      stopWhen: stepCountIs(1),
    })

    const { text } = await drainStream(stream)
    assert.isNotEmpty(text)
  })
    .skip(!hasOpenai, 'no real OPENAI_API_KEY')
    .timeout(60_000)
})
