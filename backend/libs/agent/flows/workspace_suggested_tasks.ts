import { hasToolCall, stepCountIs } from 'ai'
import { z } from 'zod'
import { createNativeTools } from '../tools/index.js'
import { WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME, type ProductAgentFlowDefinition } from './shared.js'
import type { ProviderConfig } from '../providers/types.js'

export function createWorkspaceSuggestedTaskFlowDefinition(input: {
  model: string
  responseSchema: z.ZodTypeAny
  provider: ProviderConfig
}): ProductAgentFlowDefinition {
  return {
    name: 'workspace-suggested-tasks',
    mainPromptNames: [],
    model: input.model,
    maxIterations: 30,
    terminalToolName: WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
    enableComposio: false,
    providerOptions: input.provider.generationOptions({ modelId: input.model, flowHint: 'generate' }),
    buildTools: (context) => ({
      ...createNativeTools(context),
      [WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME]: {
        description:
          'Return the final suggested tasks as structured JSON only after you have explored the workspace thoroughly.',
        inputSchema: input.responseSchema,
        execute: async (payload: unknown) => payload,
      },
    }),
    stopWhenFactory: ({ maxIterations }) => [
      stepCountIs(maxIterations),
      hasToolCall(WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME),
    ],
    subagents: [],
  }
}
