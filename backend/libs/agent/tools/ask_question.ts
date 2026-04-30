import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'
import type { Question } from '../types.js'

export const ASK_QUESTION_WAITING_FOR_USER = 'WAITING_FOR_USER_ANSWER'

const questionOptionSchema = z.object({
  id: z.string().describe('Unique identifier for the option'),
  label: z.string().describe('Short display text for the option (1-5 words)'),
  description: z.string().describe('Explanation of what this option means'),
})

const questionSchema = z.object({
  id: z.string().describe('Unique identifier for the question'),
  text: z.string().describe('The full question text, ending with a question mark'),
  options: z.array(questionOptionSchema).min(2).max(4).describe('2-4 distinct options for the user to choose from'),
  multiSelect: z
    .boolean()
    .default(false)
    .describe('If true, user can select multiple options. Default is single-select.'),
})

export const askQuestionSchema = z.object({
  context: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe(
      'Optional markdown context shown before the questions when the question text alone is not enough to understand what is being asked.'
    ),
  questions: z.array(questionSchema).min(1).max(4).describe('1-4 questions to ask the user'),
})

export const askQuestionTool = tool({
  description: `Ask the user 1-4 clarifying questions when you need input to proceed.

Use this tool when:
- Requirements are ambiguous and you need clarification
- Multiple valid approaches exist and user preference matters
- You need to confirm understanding before taking action
- The task involves subjective choices (style, tone, priorities)

Each question should have:
- A clear, specific question text
- 2-4 distinct options (not overlapping)
- Descriptions explaining each option

IMPORTANT: Do NOT include "Something else", "Other", or "I'll explain" options. The UI automatically adds an "Other" option for free-text input. All your options should be specific, actionable choices.
}`,
  inputSchema: askQuestionSchema,
  execute: async (input, execContext) => {
    const { state, agent } = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)

    // Add timeline item with pending status
    state.addTimelineItem(
      {
        type: 'ask_question',
        context: input.context,
        questions: input.questions as Question[],
        status: 'pending',
        timestamp: Date.now(),
        agent,
      },
      'ask_question_created',
      toolCallId
    )

    return ASK_QUESTION_WAITING_FOR_USER
  },
})

const OTHER_PREFIX = '__other__:'

/**
 * Format user's answer selections into a readable string for Claude.
 */
export function formatAnswersForLLM(questions: Question[], answers: Record<string, string[]>): string {
  const lines = questions.map((q) => {
    const selectedIds = answers[q.id] || []
    const selectedLabels = selectedIds
      .map((id) => {
        // Handle "Other" answers with custom text
        if (id.startsWith(OTHER_PREFIX)) {
          const customText = id.slice(OTHER_PREFIX.length)
          return `Other: "${customText}"`
        }
        const option = q.options.find((o) => o.id === id)
        return option?.label || id
      })
      .filter(Boolean)

    if (selectedLabels.length === 0) {
      return `Q: ${q.text}\nA: (no selection)`
    }

    return `Q: ${q.text}\nA: ${selectedLabels.join(', ')}`
  })

  return lines.join('\n\n')
}
