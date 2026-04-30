import { tool } from 'ai'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { getToolContext, getToolCallId } from './context.js'
import { getSubagentFlow, getSubagentNames } from '../flow.js'

export const startTaskTool = tool({
  description: 'Spawn a subagent to perform a focused task independently.',
  inputSchema: z.object({
    task_description: z
      .string()
      .describe('Short UI-friendly description of the task (3-10 words). Example: "Find authentication files"'),
    task_objective: z
      .string()
      .describe('Detailed objective for the subagent. Be specific about what information to gather.'),
    agent_type: z
      .string()
      .optional()
      .describe(
        'Subagent type from the invocation flow. If omitted, the default flow subagent is used (usually "explore").'
      ),
  }),
  execute: async ({ task_description, task_objective, agent_type }, execContext) => {
    const ctx = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)
    const { state, llm } = ctx
    const subagentId = nanoid()
    const availableSubagentNames = getSubagentNames(ctx.flow)
    const defaultAgentType = availableSubagentNames[0]
    const resolvedAgentType = agent_type || defaultAgentType

    if (!resolvedAgentType) {
      return 'No subagent types are configured for this flow.'
    }

    const subagentFlow = getSubagentFlow(ctx.flow, resolvedAgentType)

    if (!subagentFlow) {
      return `Invalid agent_type "${resolvedAgentType}". Available agent types: ${availableSubagentNames.join(', ')}`
    }

    // Add timeline item with toolCallId to match streaming
    const itemId = state.addTimelineItem(
      {
        type: 'subagent_execution',
        agentType: subagentFlow.name,
        taskDescription: task_description,
        taskObjective: task_objective,
        model: subagentFlow.model,
        status: 'running',
        timestamp: Date.now(),
        subagentId,
      },
      'subagent_started',
      toolCallId
    )

    try {
      // Use precomputed workspace tree from parent agent context
      const workspaceTree = state.currentContext.workspaceTree ?? undefined

      const result = await llm.runSubagent({
        agentType: subagentFlow.name,
        objective: task_objective,
        context: ctx,
        workspaceTree,
        subagentId,
        toolCallId,
      })

      state.updateTimelineItem(
        itemId,
        {
          status: 'completed',
          iterationCount: result.iterations,
        },
        'subagent_completed'
      )

      return `## Task Complete

**Description:** ${task_description}
**Iterations:** ${result.iterations}

${result.response}`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      state.updateTimelineItem(
        itemId,
        {
          status: 'failed',
          error: errorMessage,
        },
        'subagent_failed'
      )

      return `Subagent failed: ${errorMessage}`
    }
  },
})
