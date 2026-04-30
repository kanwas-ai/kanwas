import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ToolContext } from '../tools/context.js'
import { createNativeTools } from '../tools/native.js'
import { askQuestionTool } from '../tools/ask_question.js'

// ============================================================================
// Terminal Tool
// ============================================================================

/**
 * Terminal tool for subagents.
 * When called, signals that the subagent has completed its task.
 */
export const returnOutputTool = tool({
  description:
    'Return your final output when the task is complete. Output should be concise markdown - only include information the main agent needs to continue.',
  inputSchema: z.object({
    output: z.string().describe('Concise markdown output with findings'),
  }),
  execute: async ({ output }) => output,
})

// ============================================================================
// Tool Registry
// ============================================================================

export interface SubagentToolSet {
  tools: ToolSet
  terminalToolName: string
}

export function buildExploreSubagentTools(context: ToolContext): ToolSet {
  const nativeTools = createNativeTools(context)

  return {
    ...nativeTools,
    return_output: returnOutputTool,
  }
}

export function buildExternalSubagentTools(context: ToolContext, composioTools: ToolSet = {}): ToolSet {
  const nativeTools = createNativeTools(context)

  return {
    ...nativeTools,
    ...composioTools,
    ask_question: askQuestionTool,
    return_output: returnOutputTool,
  }
}
