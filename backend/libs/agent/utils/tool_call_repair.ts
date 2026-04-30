import { generateText, stepCountIs, type ModelMessage, type ToolSet } from 'ai'
import type { AgentProviderCallOptions } from '../providers/types.js'

type RepairableToolCall = {
  toolCallId: string
  toolName: string
  input: unknown
}

type RepairToolCallPayload = {
  toolCall: RepairableToolCall
  error: unknown
  messages: ModelMessage[]
  system?: unknown
}

type RepairToolCallResult = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: string
} | null

type ReaskResult = {
  toolCalls: Array<{ toolName: string; input: unknown }>
}

export interface CreateToolCallReaskRepairOptions {
  model: unknown
  getModel?: () => unknown
  tools: ToolSet
  providerOptions?: AgentProviderCallOptions
  maxAttemptsPerToolCall?: number
  generateTextFn?: typeof generateText
}

const NON_REPAIRABLE_TOOL_NAMES = new Set<string>()

/**
 * Creates an AI SDK tool-call repair function using a one-shot re-ask strategy.
 *
 * If a repaired tool call is not produced, null is returned so the original
 * tool-call error propagates.
 */
export function createToolCallReaskRepair(options: CreateToolCallReaskRepairOptions) {
  const { model, getModel, tools, providerOptions, maxAttemptsPerToolCall = 1, generateTextFn = generateText } = options

  const schemaOnlyTools = toSchemaOnlyTools(tools)
  const attemptsByToolCallId = new Map<string, number>()

  return async ({ toolCall, error, messages, system }: RepairToolCallPayload): Promise<RepairToolCallResult> => {
    if (NON_REPAIRABLE_TOOL_NAMES.has(toolCall.toolName)) {
      return null
    }

    const previousAttempts = attemptsByToolCallId.get(toolCall.toolCallId) ?? 0
    if (previousAttempts >= maxAttemptsPerToolCall) {
      return null
    }

    attemptsByToolCallId.set(toolCall.toolCallId, previousAttempts + 1)

    const errorMessage = error instanceof Error ? error.message : String(error)

    try {
      const reask = (await generateTextFn({
        model: (getModel?.() ?? model) as any,
        system: system as any,
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: errorMessage,
              },
            ],
          },
        ] as any,
        tools: schemaOnlyTools as any,
        toolChoice: 'required',
        stopWhen: stepCountIs(1),
        providerOptions: providerOptions as any,
      } as any)) as ReaskResult

      const repairedToolCall = reask.toolCalls[0]
      if (!repairedToolCall) {
        return null
      }

      return {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: repairedToolCall.toolName,
        input: JSON.stringify(repairedToolCall.input),
      }
    } catch {
      return null
    }
  }
}

function toSchemaOnlyTools(tools: ToolSet): ToolSet {
  const entries = Object.entries(tools).map(([toolName, toolDefinition]) => {
    const candidate = toolDefinition as {
      description?: string
      inputSchema?: unknown
      strict?: boolean
      inputExamples?: unknown
    }

    return [
      toolName,
      {
        description: candidate.description,
        inputSchema: candidate.inputSchema,
        strict: candidate.strict,
        inputExamples: candidate.inputExamples,
      },
    ] as const
  })

  return Object.fromEntries(entries) as ToolSet
}
