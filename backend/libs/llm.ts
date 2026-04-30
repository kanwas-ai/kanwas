import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { z } from 'zod'
import type { ProviderConfig } from './agent/providers/types.js'

export interface LLMConfig {
  provider: ProviderConfig
  model: string
}

export interface CompleteTextOptions {
  prompt: string | ModelMessage[]
  systemPrompt?: string
  abortSignal?: AbortSignal
}

export interface CompleteStructuredOptions<T> extends CompleteTextOptions {
  responseSchema: z.ZodType<T>
}

export class LLM {
  private provider: ProviderConfig
  private modelName: string

  constructor(config: LLMConfig) {
    this.provider = config.provider
    this.modelName = config.model
  }

  getModelName(): string {
    return this.modelName
  }

  async completeText(options: CompleteTextOptions): Promise<string> {
    const stream = await streamText({
      model: this.provider.createModel(this.modelName),
      system: options.systemPrompt,
      messages: normalizePrompt(options.prompt),
      providerOptions: this.provider.generationOptions({ modelId: this.modelName, flowHint: 'utility' }) as any,
      stopWhen: stepCountIs(1),
      abortSignal: options.abortSignal,
    })

    for await (const chunk of stream.fullStream) {
      void chunk
    }

    return stream.text
  }

  async complete<T>(
    prompt: string | ModelMessage[],
    systemPrompt: string,
    responseSchema: z.ZodType<T>,
    abortSignal?: AbortSignal
  ): Promise<T> {
    return this.completeStructured({
      prompt,
      systemPrompt,
      responseSchema,
      abortSignal,
    })
  }

  async completeStructured<T>(options: CompleteStructuredOptions<T>): Promise<T> {
    const structuredResponseTool = {
      description: 'Provide the structured response',
      inputSchema: options.responseSchema,
      execute: async (input: T) => input,
    }

    const stream = await streamText({
      model: this.provider.createModel(this.modelName),
      system: options.systemPrompt,
      messages: normalizePrompt(options.prompt),
      providerOptions: this.provider.generationOptions({ modelId: this.modelName, flowHint: 'utility' }) as any,
      tools: { structured_response: structuredResponseTool },
      toolChoice: { type: 'tool', toolName: 'structured_response' },
      stopWhen: stepCountIs(1),
      abortSignal: options.abortSignal,
    })

    for await (const chunk of stream.fullStream) {
      void chunk
    }

    const steps = await stream.steps
    const toolCall = steps[0]?.toolCalls?.[0]
    if (!toolCall) {
      throw new Error('No structured response from model')
    }

    return options.responseSchema.parse((toolCall as any).args ?? (toolCall as any).input)
  }
}

function normalizePrompt(prompt: string | ModelMessage[]): ModelMessage[] {
  if (typeof prompt === 'string') {
    return [{ role: 'user', content: prompt }]
  }

  return prompt
}
