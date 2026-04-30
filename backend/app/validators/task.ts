import vine from '@vinejs/vine'
import { TASK_STATUSES } from '#models/task'

const TASK_LIMIT_REGEX = /^\d+$/

export const tasksIndexQueryValidator = vine.compile(
  vine.object({
    limit: vine.string().trim().regex(TASK_LIMIT_REGEX).optional(),
    status: vine.enum(TASK_STATUSES).optional(),
    cursor: vine.string().trim().minLength(1).optional(),
  })
)
