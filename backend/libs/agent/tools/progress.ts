import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'

export const progressTool = tool({
  description:
    'Status updates to keep users oriented. Use frequently for: what you are doing, what you found, what is next. 1-2 sentences max. No reasoning here—use think() for that.',
  inputSchema: z.object({
    message: z
      .string()
      .max(500)
      .describe(
        'Brief status update (1-2 sentences). Examples: "Searching for retention benchmarks.", "Found 3 relevant studies.", "Reading the onboarding funnel data."'
      ),
  }),
  execute: async ({ message }, execContext) => {
    const { state, agent } = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)

    // Add progress item to timeline with toolCallId to match streaming
    state.addTimelineItem(
      {
        type: 'progress',
        message,
        timestamp: Date.now(),
        agent,
      },
      'progress',
      toolCallId
    )

    return `Progress recorded`
  },
})
