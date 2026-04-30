import app from '@adonisjs/core/services/app'
import { tool } from 'ai'
import { z } from 'zod'
import WorkspaceSuggestedTaskService from '#services/workspace_suggested_task_service'
import { toError } from '#services/error_utils'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_HEADLINE_LENGTH,
  MAX_RAW_PROMPT_LENGTH,
  MAX_SUGGESTED_TASKS,
  normalizeSuggestedTaskDrafts,
} from '../workspace_suggested_tasks/normalization.js'
import { getToolContext, getToolCallId } from './context.js'
import type { State } from '../state.js'
import type { SuggestedTasksItem } from '../types.js'

export const SUGGEST_NEXT_TASKS_TOOL_NAME = 'suggest_next_tasks'

const suggestedTaskDraftInputSchema = z
  .object({
    emoji: z.string().trim().min(1).max(16).describe('A single emoji shown on the task card.'),
    headline: z.string().trim().min(1).max(MAX_HEADLINE_LENGTH).describe('A short, actionable user-facing task title.'),
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DESCRIPTION_LENGTH)
      .describe('A concise user-facing description explaining why this task is useful.'),
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(MAX_RAW_PROMPT_LENGTH)
      .describe('The full prompt that should start this task fresh in a new chat.'),
  })
  .strict()

export const suggestNextTasksToolInputSchema = z
  .object({
    scope: z
      .enum(['local', 'global'])
      .describe('Prefer `global` so these tasks also replace the seeded onboarding suggestion in the Tasks panel.'),
    tasks: z
      .array(suggestedTaskDraftInputSchema)
      .min(1)
      .max(MAX_SUGGESTED_TASKS)
      .describe(
        'Provide 1-4 concrete, non-overlapping next tasks. Only include emoji, headline, description, and prompt.'
      ),
  })
  .strict()

export const suggestNextTasksTool = tool({
  description:
    'During onboarding, suggest 1-4 concrete next tasks once enough context exists. Prefer `scope = global` so the same tasks also replace the seeded onboarding suggestion in the workspace Tasks panel. Do not invent ids or source fields.',
  inputSchema: suggestNextTasksToolInputSchema,
  execute: async ({ scope, tasks }, execContext) => {
    const ctx = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)
    const existingItem = toolCallId ? ctx.state.findTimelineItem(toolCallId) : undefined

    if (isSuggestedTasksItem(existingItem) && existingItem.status === 'completed') {
      return buildSuccessMessage(existingItem)
    }

    const itemId = ensureSuggestedTasksTimelineItem(ctx.state, toolCallId, scope, existingItem)

    try {
      if (ctx.state.currentContext.invocationSource !== 'onboarding') {
        throw new Error('`suggest_next_tasks` is only available during onboarding.')
      }

      if (hasCompletedSuggestedTasksItem(ctx.state, itemId)) {
        throw new Error(
          '`suggest_next_tasks` was already completed for this onboarding invocation. Do not call it again.'
        )
      }

      const normalizedTasks = normalizeSuggestedTaskDrafts(tasks)

      if (normalizedTasks.length === 0) {
        throw new Error(
          'No valid suggested tasks remained after normalization. Provide 1-4 concrete tasks with non-empty emoji, headline, description, and prompt.'
        )
      }

      let hasPersistedCopy = false

      if (scope === 'global') {
        const workspaceSuggestedTaskService = await app.container.make(WorkspaceSuggestedTaskService)
        const persistResult = await workspaceSuggestedTaskService.replaceTasksFromOnboarding(
          ctx.state.currentContext.workspaceId,
          normalizedTasks
        )

        if (persistResult.status === 'already_generated') {
          throw new Error('Global suggested tasks were already generated for this workspace.')
        }

        if (persistResult.status === 'already_loading') {
          throw new Error('Suggested tasks are already loading for this workspace.')
        }

        hasPersistedCopy = true
      }

      ctx.state.updateTimelineItem(
        itemId,
        {
          scope,
          status: 'completed',
          hasPersistedCopy,
          tasks: normalizedTasks,
          error: undefined,
        },
        'suggested_tasks_completed'
      )

      return buildSuccessMessage({ scope, hasPersistedCopy, tasks: normalizedTasks })
    } catch (error) {
      const errorMessage = toError(error).message

      ctx.state.updateTimelineItem(
        itemId,
        {
          scope,
          status: 'failed',
          hasPersistedCopy: false,
          tasks: [],
          error: errorMessage,
        },
        'suggested_tasks_failed'
      )

      return `Failed to suggest next tasks: ${errorMessage}`
    }
  },
})

function ensureSuggestedTasksTimelineItem(
  state: State,
  toolCallId: string | undefined,
  scope: SuggestedTasksItem['scope'],
  existingItem: ReturnType<State['findTimelineItem']>
): string {
  if (isSuggestedTasksItem(existingItem)) {
    state.updateTimelineItem(
      existingItem.id,
      {
        scope,
        status: 'loading',
        hasPersistedCopy: false,
        tasks: [],
        error: undefined,
      },
      'suggested_tasks_started'
    )

    return existingItem.id
  }

  return state.addTimelineItem(
    {
      type: 'suggested_tasks',
      scope,
      status: 'loading',
      hasPersistedCopy: false,
      tasks: [],
      timestamp: Date.now(),
    },
    'suggested_tasks_started',
    toolCallId && !existingItem ? toolCallId : undefined
  )
}

function hasCompletedSuggestedTasksItem(state: State, currentItemId: string): boolean {
  return state
    .getTimeline()
    .some((item) => item.id !== currentItemId && item.type === 'suggested_tasks' && item.status === 'completed')
}

function isSuggestedTasksItem(item: unknown): item is SuggestedTasksItem {
  return !!item && typeof item === 'object' && (item as SuggestedTasksItem).type === 'suggested_tasks'
}

function buildSuccessMessage(item: Pick<SuggestedTasksItem, 'scope' | 'hasPersistedCopy' | 'tasks'>): string {
  const taskCount = item.tasks.length
  const noun = taskCount === 1 ? 'task' : 'tasks'

  if (item.scope === 'global' && item.hasPersistedCopy) {
    return `Saved ${taskCount} suggested ${noun} to the timeline and workspace tasks.`
  }

  return `Saved ${taskCount} suggested ${noun} to the timeline.`
}
