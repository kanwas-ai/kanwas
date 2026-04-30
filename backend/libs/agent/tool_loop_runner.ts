import { ToolLoopAgent, type ModelMessage, type PrepareStepFunction, type StepResult, type ToolSet } from 'ai'
import type { AgentProviderCallOptions } from './providers/types.js'
import type { ToolContext } from './tools/context.js'
import { captureToolCallSpansFromStep } from './tracing/tool_spans.js'

export interface ToolLoopRunnerTrace {
  parentId?: string
  getParentIdForStep?: (stepIndex: number) => string | undefined
  properties?: Record<string, unknown>
  skipToolNames?: string[]
}

export interface ToolLoopRunnerOptions {
  model: unknown
  tools: ToolSet
  messages: ModelMessage[]
  instructions?: ModelMessage[]
  headers?: Record<string, string>
  maxOutputTokens?: number
  stopWhen: unknown
  context: ToolContext
  providerOptions?: AgentProviderCallOptions
  repairToolCall?: unknown
  formatMessages?: (messages: ModelMessage[]) => ModelMessage[]
  prepareStep?: PrepareStepFunction
  trace?: ToolLoopRunnerTrace
  onStepFinish?: (step: StepResult<ToolSet>, stepIndex: number) => Promise<void> | void
  onChunk?: (chunk: any) => void
  onError?: (error: unknown) => void
}

export interface ToolLoopRunnerResult {
  messages: unknown[]
  steps: any[]
  text: string
}

export async function runToolLoop(options: ToolLoopRunnerOptions): Promise<ToolLoopRunnerResult> {
  try {
    let completedStepCount = 0
    const agent = new ToolLoopAgent({
      model: options.model as any,
      tools: options.tools,
      instructions: options.instructions as any,
      headers: options.headers,
      toolChoice: 'auto',
      maxOutputTokens: options.maxOutputTokens,
      stopWhen: options.stopWhen as any,
      experimental_context: options.context,
      experimental_repairToolCall: options.repairToolCall as any,
      providerOptions: options.providerOptions as any,
      prepareStep:
        options.prepareStep ??
        (options.formatMessages ? ({ messages }) => ({ messages: options.formatMessages!(messages) }) : undefined),
      onStepFinish: async (step) => {
        const stepIndex = completedStepCount
        completedStepCount += 1

        await options.onStepFinish?.(step as StepResult<ToolSet>, stepIndex)

        if (options.trace) {
          captureToolCallSpansFromStep({
            posthogService: options.context.posthogService,
            traceIdentity: options.context.traceIdentity,
            traceContext: options.context.traceContext,
            step,
            stepIndex,
            parentId: options.trace.getParentIdForStep?.(stepIndex) ?? options.trace.parentId,
            skipToolNames: options.trace.skipToolNames,
            properties: options.trace.properties,
          })
        }
      },
    })

    const stream = await agent.stream({
      messages: options.messages,
      abortSignal: options.context.abortSignal,
    })

    for await (const chunk of stream.fullStream) {
      options.onChunk?.(chunk)
    }
    const [response, steps] = await Promise.all([stream.response, stream.steps])

    const text = steps.map((step) => step.text || '').join('')

    return {
      messages: response.messages,
      steps,
      text,
    }
  } catch (error) {
    options.onError?.(error)
    throw error
  }
}
