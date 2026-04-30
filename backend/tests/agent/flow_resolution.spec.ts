import { test } from '@japa/runner'
import { generateText, ToolLoopAgent, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { createAnthropicProvider, createOpenAIProvider } from '#agent/providers/index'
import { CanvasAgent } from '#agent/index'
import { resolveProductAgentFlow } from '#agent/flow'
import type { ProviderConfig } from '#agent/providers/types'
import env from '#start/env'

/**
 * Live smoke tests for flow resolution + tool calling.
 *
 * Verifies that resolved flow configurations (system prompts with
 * cache breakpoints, generation options) work end-to-end with real APIs.
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

function resolveMinimalFlow(provider: ProviderConfig, model: string) {
  return resolveProductAgentFlow({
    definition: CanvasAgent.getProductAgentFlowDefinition(model, provider),
    mainSystemPrompts: ['You are a test assistant. Always use available tools when asked. Be extremely brief.'],
    subagentPromptByName: { explore: 'Test explorer', external: 'Test external' },
    provider,
  })
}

const weatherTool = (onCall: () => void) =>
  tool({
    description: 'Get the current weather for a city',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      onCall()
      return `Weather in ${city}: 22°C, sunny`
    },
  })

const mathTool = (schema: z.ZodType) =>
  tool({
    description: 'Provide the structured response',
    inputSchema: schema,
    execute: async (input) => input,
  })

/**
 * Run a tool loop via ToolLoopAgent.stream() — same path as the real agent.
 *
 */
async function runStreamingToolLoop(opts: {
  model: any
  tools: any
  messages: any[]
  providerOptions: any
  maxSteps: number
}) {
  const agent = new ToolLoopAgent({
    model: opts.model,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps),
    providerOptions: opts.providerOptions,
  })

  const stream = await agent.stream({ messages: opts.messages })
  for await (const chunk of stream.fullStream) {
    void chunk
  }
  const steps = await stream.steps
  return { steps, text: steps.map((s: any) => s.text || '').join('') }
}

test.group('Live: Anthropic tool calling through resolved flow', () => {
  test('model calls a tool and receives the result', async ({ assert }) => {
    const provider = createAnthropicProvider(ANTHROPIC_KEY!)
    const modelId = provider.modelTiers.medium
    const model = provider.createModel(modelId)
    const flow = resolveMinimalFlow(provider, modelId)

    let toolWasCalled = false
    const tools = {
      get_weather: weatherTool(() => {
        toolWasCalled = true
      }),
    }

    const systemMessages = flow.main.systemPrompts.map((p) => ({
      role: p.role,
      content: p.content,
      providerOptions: p.providerOptions,
    }))

    const result = await generateText({
      model,
      messages: [
        ...systemMessages,
        { role: 'user', content: 'What is the weather in Prague? Use the get_weather tool.' },
      ] as any,
      tools,
      providerOptions: flow.main.providerOptions as any,
      stopWhen: stepCountIs(3),
    })

    assert.isTrue(toolWasCalled, 'Tool should have been called')
    assert.isAbove(result.steps.length, 1, 'Should have multiple steps (tool call + response)')
  })
    .skip(!hasAnthropic, 'no real ANTHROPIC_API_KEY')
    .timeout(30_000)

  test('structured output via tool_choice', async ({ assert }) => {
    const provider = createAnthropicProvider(ANTHROPIC_KEY!)
    const model = provider.createModel(provider.modelTiers.medium)

    const schema = z.object({ answer: z.number(), explanation: z.string() })

    const result = await generateText({
      model,
      system: 'You are a math assistant.',
      messages: [{ role: 'user', content: 'What is 7 * 8?' }] as any,
      tools: { structured_response: mathTool(schema) },
      toolChoice: { type: 'tool', toolName: 'structured_response' },
      stopWhen: stepCountIs(1),
    })

    const toolCall = result.steps[0]?.toolCalls?.[0] as any
    assert.isDefined(toolCall, 'Should have a tool call')
    const parsed = schema.parse(toolCall.args ?? toolCall.input)
    assert.equal(parsed.answer, 56)
  })
    .skip(!hasAnthropic, 'no real ANTHROPIC_API_KEY')
    .timeout(15_000)
})

test.group('Live: OpenAI tool calling through resolved flow', () => {
  test('model calls a tool and receives the result', async ({ assert }) => {
    const provider = createOpenAIProvider(OPENAI_KEY!)
    const modelId = provider.modelTiers.medium
    const model = provider.createModel(modelId)
    const flow = resolveMinimalFlow(provider, modelId)

    let toolWasCalled = false
    const tools = {
      get_weather: weatherTool(() => {
        toolWasCalled = true
      }),
    }

    const systemMessages = flow.main.systemPrompts.map((p) => ({
      role: p.role,
      content: p.content,
      providerOptions: p.providerOptions,
    }))

    // Use streaming tool loop
    const result = await runStreamingToolLoop({
      model,
      tools,
      messages: [
        ...systemMessages,
        { role: 'user', content: 'What is the weather in Prague? Use the get_weather tool.' },
      ],
      providerOptions: flow.main.providerOptions,
      maxSteps: 3,
    })

    assert.isTrue(toolWasCalled, 'Tool should have been called')
    assert.isAbove(result.steps.length, 1, 'Should have multiple steps (tool call + response)')
  })
    .skip(!hasOpenai, 'no real OPENAI_API_KEY')
    .timeout(60_000)

  test('structured output via tool_choice', async ({ assert }) => {
    const provider = createOpenAIProvider(OPENAI_KEY!)
    const modelId = provider.modelTiers.medium
    const model = provider.createModel(modelId)

    const schema = z.object({ answer: z.number(), explanation: z.string() })

    // Use streaming tool loop
    const agent = new ToolLoopAgent({
      model,
      tools: { structured_response: mathTool(schema) },
      toolChoice: { type: 'tool', toolName: 'structured_response' },
      stopWhen: stepCountIs(1),
      providerOptions: provider.generationOptions({ modelId, flowHint: 'execute' }) as any,
    })

    const stream = await agent.stream({
      messages: [
        { role: 'system', content: 'You are a math assistant.' },
        { role: 'user', content: 'What is 7 * 8?' },
      ],
    })
    for await (const chunk of stream.fullStream) {
      void chunk
    }
    const steps = await stream.steps

    const toolCall = steps[0]?.toolCalls?.[0] as any
    assert.isDefined(toolCall, 'Should have a tool call')
    const parsed = schema.parse(toolCall.args ?? toolCall.input)
    assert.equal(parsed.answer, 56)
  })
    .skip(!hasOpenai, 'no real OPENAI_API_KEY')
    .timeout(60_000)
})
