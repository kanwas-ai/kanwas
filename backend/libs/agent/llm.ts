import { generateText, stepCountIs, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './tools/context.js'
import { promptManager } from './prompt_manager.js'
import { createToolCallReaskRepair } from './utils/tool_call_repair.js'
import { createSpanId, isAbortError, withToolCallTraceContext, type TraceContext } from './tracing/posthog.js'
import type PostHogService from '#services/posthog_service'
import { type FlowSystemPromptBlock } from './flow.js'
import { runToolLoop } from './tool_loop_runner.js'
import { sanitizeToolCallInputs } from './llm/sanitize_messages.js'
import { createMainToolLoopStreamingHandlers } from './llm/main_streaming.js'
import { runSubagentExecution, type SubagentSpanPayload } from './subagent/executor.js'
import type { AgentProviderCallOptions, ProviderConfig } from './providers/types.js'
import { applyRuntimeProviderOptions, buildOpenAIThreadContext } from './providers/runtime_options.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for generateWithTools.
 */
export interface NativeGenerateOptions {
  /** Conversation messages in Vercel AI SDK format */
  messages: ModelMessage[]
  /** Invocation-resolved system prompt blocks */
  systemPrompts: FlowSystemPromptBlock[]
  /** Invocation-resolved stop conditions */
  stopWhen: unknown[]
  /** Provider options for generation */
  providerOptions?: AgentProviderCallOptions
  /** Runtime context for tool execution */
  context: ToolContext
  /** Extra trace properties for invocation-scoped observability */
  traceProperties?: Record<string, unknown>
  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * Result from generateWithTools.
 */
export interface NativeGenerateResult {
  /** Response messages from the API */
  messages: unknown[]
  /** Number of model steps executed */
  iterations: number
  /** Extracted tool results for easy access */
  toolResults: Array<{
    toolName: string
    input: unknown
    output: unknown
  }>
  /** Whether model produced text output (terminal action) */
  isTerminal: boolean
  /** Remaining text response that has not already been persisted mid-stream */
  textOutput?: string
  /** Reserved timeline item ID for streamed chat output */
  textOutputItemId?: string
  /** True when one or more assistant chat segments were already persisted during streaming */
  hasPersistedChatOutput?: boolean
}

/**
 * Options for running a subagent.
 */
export interface SubagentOptions {
  agentType: string
  objective: string
  context: ToolContext
  workspaceTree?: string
  /** Subagent ID for linking report output to SubagentExecutionItem */
  subagentId?: string
  /** Parent tool call ID for trace correlation */
  toolCallId?: string
}

/**
 * Result from a subagent execution.
 */
export interface SubagentResult {
  response: string
  iterations: number
}

/**
 * Prompt parameter - supports both raw strings and prompt names with variables.
 */
export type PromptParam =
  | string
  | {
      name: string
      variables?: Record<string, any>
    }

type CompleteContext = Pick<ToolContext, 'traceContext' | 'traceIdentity' | 'agent'>

// ============================================================================
// LLM Implementation
// ============================================================================

/**
 * LLM - Vercel AI SDK implementation for Anthropic Claude.
 *
 * Uses PostHog LLM tracing via invocation-scoped model wrapping.
 *
 * Key design decisions:
 * - stopWhen comes from invocation-resolved flow configuration
 * - per-run withTracing wrapping preserves parent/session linkage
 * - Cache breakpoints via providerOptions for Anthropic prompt caching
 */
export class LLM {
  private provider: ProviderConfig
  private modelName: string
  private posthogService: PostHogService

  constructor(config: { provider: ProviderConfig; model: string; posthogService: PostHogService }) {
    this.provider = config.provider
    this.modelName = config.model
    this.posthogService = config.posthogService
  }

  /**
   * Get the model name for observability tracking.
   */
  getModelName(): string {
    return this.modelName
  }

  /**
   * Generate a response with tools using Vercel AI SDK ToolLoopAgent.
   */
  async generateWithTools(options: NativeGenerateOptions): Promise<NativeGenerateResult> {
    const { messages, systemPrompts, stopWhen, providerOptions, context, traceProperties, abortSignal } = options
    const mainLoopSpanId = createSpanId()
    const loopTraceContext: TraceContext = {
      ...context.traceContext,
      activeParentSpanId: mainLoopSpanId,
    }
    const baseToolExecutionContext: ToolContext = {
      ...context,
      traceContext: loopTraceContext,
      abortSignal,
    }
    const stepGenerationSpanIds = new Map<number, string>()
    let activeGenerationSpanId: string | undefined
    const loopSpanProperties = {
      agent_source: context.agent.source,
      subagent_id: context.traceContext.subagentId,
      ...traceProperties,
    }

    const allTools = context.flow.main.buildTools(baseToolExecutionContext)
    const knownToolNames = new Set(Object.keys(allTools))

    // Sanitize messages before replay:
    // - Normalize non-object tool-call inputs left over from validation failures.
    // - Drop tool-call/tool-result parts referencing tools no longer registered
    //   (e.g. after a rename like apply_patch → write_file), which otherwise
    //   break Responses API serialization via an ID/type prefix mismatch.
    const sanitizedMessages = sanitizeToolCallInputs(messages, knownToolNames)

    // TEMP DIAGNOSTIC: emit a single line per invocation with a summary of the
    // tool-call toolNames seen and whether sanitization changed anything. Safe
    // to remove once the orphan-replay issue on workspace 329b7ced is understood.
    if (this.provider.name === 'openai' && messages.length > 20) {
      const toolNamesSeen = new Map<string, number>()
      const itemIdPrefixes = new Map<string, number>()
      for (const msg of messages) {
        if (typeof msg.content === 'string' || !Array.isArray(msg.content)) continue
        for (const part of msg.content as any[]) {
          if (part.type === 'tool-call' || part.type === 'tool-result') {
            toolNamesSeen.set(part.toolName, (toolNamesSeen.get(part.toolName) ?? 0) + 1)
            const id: unknown = part?.providerMetadata?.openai?.itemId ?? part?.providerOptions?.openai?.itemId
            if (typeof id === 'string') {
              const prefix = id.split('_')[0] ?? ''
              itemIdPrefixes.set(prefix, (itemIdPrefixes.get(prefix) ?? 0) + 1)
            }
          }
        }
      }
      console.log(
        '[sanitize-diag]',
        JSON.stringify({
          workspaceId: context.state.currentContext.workspaceId,
          inputMessages: messages.length,
          sanitizedMessages: sanitizedMessages.length,
          knownTools: [...knownToolNames],
          toolNamesSeen: Object.fromEntries(toolNamesSeen),
          itemIdPrefixes: Object.fromEntries(itemIdPrefixes),
        })
      )
    }
    const systemMessages = this.toSystemMessages(systemPrompts)

    const rawModel = this.provider.createModel(context.flow.main.model)
    const resolvedProviderOptions = applyRuntimeProviderOptions({
      providerName: this.provider.name,
      baseOptions: providerOptions || context.flow.main.providerOptions,
      workspaceId: context.state.currentContext.workspaceId,
      aiSessionId: context.state.currentContext.aiSessionId,
      modelId: context.flow.main.model,
      agentSource: context.agent.source,
      flowName: context.flow.name,
    })
    const threadContext = buildOpenAIThreadContext({
      providerName: this.provider.name,
      workspaceId: context.state.currentContext.workspaceId,
      aiSessionId: context.state.currentContext.aiSessionId,
      modelId: context.flow.main.model,
      agentSource: context.agent.source,
      flowName: context.flow.name,
    })

    const createMainGenerationModel = (
      parentId: string | undefined,
      generationSpanId: string,
      functionId: string,
      properties?: Record<string, unknown>
    ) =>
      this.wrapModelWithTrace(
        rawModel,
        context,
        { ...context.traceContext, activeParentSpanId: parentId },
        {
          function_id: functionId,
          agent_source: context.agent.source,
          subagent_id: context.traceContext.subagentId,
          $ai_span_id: generationSpanId,
          ...properties,
        }
      )

    const repairToolCall = createToolCallReaskRepair({
      model: rawModel,
      getModel: () => {
        const repairGenerationSpanId = createSpanId()
        return createMainGenerationModel(
          activeGenerationSpanId ?? mainLoopSpanId,
          repairGenerationSpanId,
          'main-agent-tool-repair'
        )
      },
      tools: allTools as ToolSet,
      providerOptions: resolvedProviderOptions,
    })

    const streamingHandlers = createMainToolLoopStreamingHandlers(baseToolExecutionContext)

    // formatMessages is applied per-iteration via prepareStep, not once upfront.
    // This ensures cache breakpoints and phase annotations move to the latest
    // messages each iteration, enabling conversation prefix caching.
    const formatMessages = (msgs: ModelMessage[]) => this.provider.formatMessages(msgs)

    try {
      const runResult = await runToolLoop({
        model: rawModel,
        tools: allTools as ToolSet,
        messages: sanitizedMessages,
        instructions: systemMessages,
        headers: threadContext?.headers,
        stopWhen,
        context: baseToolExecutionContext,
        providerOptions: resolvedProviderOptions,
        repairToolCall,
        prepareStep: async ({ stepNumber, messages: stepMessages }) => {
          const generationSpanId = createSpanId()
          activeGenerationSpanId = generationSpanId
          stepGenerationSpanIds.set(stepNumber, generationSpanId)
          const formattedMessages = formatMessages(stepMessages)

          return {
            model: createMainGenerationModel(mainLoopSpanId, generationSpanId, 'main-agent') as any,
            messages: formattedMessages,
            experimental_context: {
              ...baseToolExecutionContext,
              traceContext: {
                ...loopTraceContext,
                activeParentSpanId: generationSpanId,
              },
            },
          }
        },
        trace: {
          getParentIdForStep: (stepIndex) => stepGenerationSpanIds.get(stepIndex),
          properties: loopSpanProperties,
        },
        onChunk: streamingHandlers.onChunk,
        onError: streamingHandlers.onError,
      })

      streamingHandlers.finalize()

      const toolResults = runResult.steps.flatMap((step: any) =>
        step.toolCalls.map((call: any, i: number) => ({
          toolName: call.toolName,
          input: call.input,
          output: step.toolResults[i]?.output,
        }))
      )

      const textOutput = streamingHandlers.getBufferedChatText()
      const hasTextOutput = textOutput.length > 0
      const hasPersistedChatOutput = streamingHandlers.hasPersistedChatSegments()

      this.posthogService.captureAiSpan({
        ...context.traceIdentity,
        traceId: context.traceContext.traceId,
        sessionId: context.traceContext.sessionId,
        spanId: mainLoopSpanId,
        parentId: context.traceContext.activeParentSpanId,
        spanName: 'main-agent',
        status: 'completed',
        output: {
          iterations: runResult.steps.length,
          toolResults: toolResults.length,
          isTerminal: hasTextOutput || hasPersistedChatOutput,
        },
        properties: loopSpanProperties,
      })

      return {
        messages: runResult.messages,
        iterations: runResult.steps.length,
        toolResults,
        isTerminal: hasTextOutput || hasPersistedChatOutput,
        textOutput: hasTextOutput ? textOutput : undefined,
        textOutputItemId: hasTextOutput ? streamingHandlers.getTextOutputItemId() : undefined,
        hasPersistedChatOutput,
      }
    } catch (error) {
      streamingHandlers.finalize()

      const cancelled = abortSignal?.aborted || isAbortError(error)
      this.posthogService.captureAiSpan({
        ...context.traceIdentity,
        traceId: context.traceContext.traceId,
        sessionId: context.traceContext.sessionId,
        spanId: mainLoopSpanId,
        parentId: context.traceContext.activeParentSpanId,
        spanName: 'main-agent',
        status: cancelled ? 'cancelled' : 'failed',
        isError: !cancelled,
        error: error instanceof Error ? error.message : String(error),
        properties: loopSpanProperties,
      })
      throw error
    }
  }

  private toSystemMessages(systemPrompts: FlowSystemPromptBlock[]): ModelMessage[] {
    return systemPrompts.map(
      (prompt) =>
        ({
          role: prompt.role,
          content: prompt.content,
          providerOptions: prompt.providerOptions,
        }) as ModelMessage
    )
  }

  /**
   * Generate a structured object response using the provided schema.
   * Uses tool_use with a single required tool to force structured output.
   */
  async complete<T>(
    prompt: string | ModelMessage[],
    systemPrompt: PromptParam,
    responseSchema: z.ZodType<T>,
    context?: CompleteContext,
    toolCallId?: string
  ): Promise<T> {
    // Convert prompt to messages array
    const messages: ModelMessage[] =
      typeof prompt === 'string' ? [{ role: 'user', content: prompt } as ModelMessage] : prompt

    // Compile system prompt
    const compiledSystemPrompt = this.compilePrompt(systemPrompt)

    const rawModel = this.provider.createModel(this.modelName)
    let model = rawModel

    if (context) {
      const generationSpanId = createSpanId()
      const traceContext = withToolCallTraceContext(context.traceContext, toolCallId)
      model = this.wrapModelWithTrace(rawModel, context, traceContext, {
        function_id: 'structured-complete',
        agent_source: context.agent.source,
        subagent_id: traceContext.subagentId,
        tool_call_id: traceContext.toolCallId,
        $ai_span_id: generationSpanId,
      })
    }

    // Create structured response tool
    const structuredResponseTool = {
      description: 'Provide the structured response',
      inputSchema: responseSchema,
      execute: async (input: T) => input,
    }

    const result = await generateText({
      model: model as any,
      system: compiledSystemPrompt,
      messages: messages as any,
      providerOptions: this.provider.generationOptions({ modelId: this.modelName, flowHint: 'plan' }) as any,
      tools: { structured_response: structuredResponseTool } as any,
      toolChoice: { type: 'tool', toolName: 'structured_response' },
      stopWhen: stepCountIs(1),
    })

    // Extract from tool call
    const toolCall = result.steps[0]?.toolCalls?.[0]
    if (!toolCall) {
      throw new Error('No structured response from model')
    }

    const parsed = responseSchema.parse((toolCall as any).args ?? (toolCall as any).input)

    return parsed
  }

  private wrapModelWithTrace<TModel>(
    model: TModel,
    context: Pick<ToolContext, 'traceIdentity'>,
    traceContext: TraceContext,
    properties: Record<string, unknown>
  ): TModel {
    return this.posthogService.wrapModelWithTracing(model, {
      ...context.traceIdentity,
      traceId: traceContext.traceId,
      sessionId: traceContext.sessionId,
      parentId: traceContext.activeParentSpanId,
      properties,
    })
  }

  private captureSubagentSpan(
    context: ToolContext,
    traceContext: TraceContext,
    spanId: string,
    agentType: string,
    payload: SubagentSpanPayload
  ): void {
    this.posthogService.captureAiSpan({
      ...context.traceIdentity,
      traceId: traceContext.traceId,
      sessionId: traceContext.sessionId,
      spanId,
      parentId: traceContext.activeParentSpanId,
      spanName: `subagent-${agentType}`,
      status: payload.status,
      input: payload.input,
      output: payload.output,
      isError: payload.isError,
      error: payload.error,
      properties: payload.properties,
    })
  }

  /**
   * Compile a prompt parameter into a string.
   */
  private compilePrompt(promptParam: PromptParam): string {
    if (typeof promptParam === 'string') {
      return promptParam
    }
    return promptManager.getPrompt(promptParam.name, promptParam.variables || {}, this.provider.name)
  }

  /**
   * Run a specialized subagent with its own tool set and system prompt.
   *
   * Subagents are nested agents that execute within the parent agent's context.
   */
  async runSubagent(options: SubagentOptions): Promise<SubagentResult> {
    return runSubagentExecution(
      {
        agentType: options.agentType,
        objective: options.objective,
        context: options.context,
        workspaceTree: options.workspaceTree,
        subagentId: options.subagentId,
        toolCallId: options.toolCallId,
      },
      {
        createModel: (modelId) => this.provider.createModel(modelId),
        wrapModelWithTrace: (model, context, traceContext, properties) =>
          this.wrapModelWithTrace(model, context, traceContext, properties),
        toSystemMessages: (systemPrompts) => this.toSystemMessages(systemPrompts),
        formatMessages: (msgs) => this.provider.formatMessages(msgs),
        captureSubagentSpan: (context, traceContext, spanId, agentType, payload) =>
          this.captureSubagentSpan(context, traceContext, spanId, agentType, payload),
        applyRuntimeProviderOptions: (baseOptions, context, modelId, agentType) =>
          applyRuntimeProviderOptions({
            providerName: this.provider.name,
            baseOptions,
            workspaceId: context.state.currentContext.workspaceId,
            aiSessionId: context.state.currentContext.aiSessionId,
            modelId,
            agentSource: 'subagent',
            flowName: context.flow.name,
            agentType,
          }),
      }
    )
  }

  /**
   * Clean up any resources.
   */
  async closeSession(): Promise<void> {
    // No resources to clean up currently
  }
}
