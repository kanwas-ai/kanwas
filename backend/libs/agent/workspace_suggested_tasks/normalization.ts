import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { WorkspaceSuggestedTask } from '#types/workspace_suggested_task'

export const MAX_SUGGESTED_TASKS = 4
export const MAX_HEADLINE_LENGTH = 60
export const MAX_DESCRIPTION_LENGTH = 140
export const MAX_PROMPT_LENGTH = 900
export const MAX_RAW_PROMPT_LENGTH = 2000
export const MAX_ID_LENGTH = 80

const suggestedTaskBaseSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
  headline: z.string().trim().min(1).max(MAX_HEADLINE_LENGTH),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  prompt: z.string().trim().min(1).max(MAX_RAW_PROMPT_LENGTH),
})

export const suggestedTaskDraftSchema = suggestedTaskBaseSchema.strict()

export const suggestedTaskDraftListSchema = z.object({
  tasks: z.array(suggestedTaskDraftSchema).min(1).max(MAX_SUGGESTED_TASKS),
})

export const rawSuggestedTaskSchema = suggestedTaskBaseSchema.extend({
  id: z.string().trim().min(1).max(MAX_ID_LENGTH),
})

export const suggestedTaskResponseSchema = z.object({
  tasks: z.array(rawSuggestedTaskSchema).min(1).max(MAX_SUGGESTED_TASKS),
})

export type SuggestedTaskDraft = z.infer<typeof suggestedTaskDraftSchema>
export type SuggestedTaskResponse = z.infer<typeof suggestedTaskResponseSchema>

export function normalizeSuggestedTaskDrafts(tasks: SuggestedTaskDraft[]): WorkspaceSuggestedTask[] {
  return normalizeSuggestedTasks(tasks, (_task, headline, prompt) => buildDraftTaskId(headline, prompt))
}

export function normalizeSuggestedTaskResponseTasks(tasks: SuggestedTaskResponse['tasks']): WorkspaceSuggestedTask[] {
  return normalizeSuggestedTasks(tasks, (task, headline, prompt) => buildModelTaskId(task.id, headline, prompt))
}

function normalizeSuggestedTasks<T extends SuggestedTaskDraft>(
  tasks: T[],
  buildId: (task: T, headline: string, prompt: string) => string
): WorkspaceSuggestedTask[] {
  const normalizedTasks: WorkspaceSuggestedTask[] = []
  const seenIds = new Set<string>()

  for (const task of tasks) {
    const normalized = normalizeSuggestedTask(task, buildId)
    if (!normalized || seenIds.has(normalized.id)) {
      continue
    }

    seenIds.add(normalized.id)
    normalizedTasks.push(normalized)
  }

  return normalizedTasks.slice(0, MAX_SUGGESTED_TASKS)
}

function normalizeSuggestedTask<T extends SuggestedTaskDraft>(
  task: T,
  buildId: (task: T, headline: string, prompt: string) => string
): WorkspaceSuggestedTask | null {
  const emoji = task.emoji.trim()
  const headline = normalizeSingleLine(task.headline, MAX_HEADLINE_LENGTH)
  const description = normalizeSingleLine(task.description, MAX_DESCRIPTION_LENGTH)
  const prompt = normalizeSingleLine(task.prompt, MAX_PROMPT_LENGTH)

  if (!emoji || !headline || !description || !prompt) {
    return null
  }

  return {
    id: buildId(task, headline, prompt),
    emoji,
    headline,
    description,
    prompt,
  }
}

function normalizeSingleLine(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
}

function buildModelTaskId(rawId: string, headline: string, prompt: string): string {
  const slugSource = rawId || headline || prompt
  return buildStableTaskId(slugSource, `${rawId}\u0000${headline}\u0000${prompt}`)
}

function buildDraftTaskId(headline: string, prompt: string): string {
  const slugSource = headline || prompt
  return buildStableTaskId(slugSource, `${headline}\u0000${prompt}`)
}

function buildStableTaskId(slugSource: string, hashSource: string): string {
  const slug = slugSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  const hash = createHash('sha1').update(hashSource).digest('hex').slice(0, 8)
  return `${slug || 'suggestion'}-${hash}`
}
