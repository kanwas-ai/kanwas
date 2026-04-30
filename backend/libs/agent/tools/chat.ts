import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'

export const chatTool = tool({
  description:
    'Send a message to the user when no document operations are needed. Use for answering questions, providing explanations, or general conversation. You can also use this tool to ask the user questions when you need additional information or clarification. Message content supports markdown formatting. This is a terminal action - ends agent execution. Use when: user asks a question, needs information, wants to chat, or when task is complete.',
  inputSchema: z.object({
    message: z
      .string()
      .describe(
        'Your message to the user in markdown format. Use this to answer questions, provide information, or have a conversation when no document operations are needed.'
      ),
  }),
  execute: async ({ message }, execContext) => {
    const { state } = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)

    // Add chat item to timeline with toolCallId to match streaming
    state.addTimelineItem(
      {
        type: 'chat',
        message,
        timestamp: Date.now(),
      },
      'chat',
      toolCallId
    )

    return message
  },
})
