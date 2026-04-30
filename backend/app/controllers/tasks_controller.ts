import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import Task, { type TaskStatus } from '#models/task'
import { tasksIndexQueryValidator } from '#validators/task'
import AgentCommandService from '#services/agent_command_service'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const CANCELLABLE_TASK_STATUSES: TaskStatus[] = ['initiated', 'processing', 'waiting']

type TaskCursor = {
  updatedAt: DateTime
  id: string
}

@inject()
export default class TasksController {
  constructor(private agentCommandService: AgentCommandService) {}

  async index({ params, auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const data = await request.validateUsing(tasksIndexQueryValidator)
    const limit = this.parseLimit(data.limit)

    const statusFilter = data.status ?? null
    const cursor = data.cursor ? this.decodeCursor(data.cursor) : null

    if (data.cursor && !cursor) {
      return response.badRequest({ error: 'Invalid cursor' })
    }

    const query = Task.query().where('workspace_id', workspaceId).where('user_id', user.id).whereNull('archived_at')

    if (statusFilter) {
      query.where('status', statusFilter)
    }

    if (cursor) {
      const cursorDate = cursor.updatedAt.toJSDate()
      query.where((cursorQuery) => {
        cursorQuery.where('updated_at', '<', cursorDate).orWhere((tieBreakerQuery) => {
          tieBreakerQuery.where('updated_at', '=', cursorDate).where('id', '<', cursor.id)
        })
      })
    }

    const tasks = await query
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)

    const hasMore = tasks.length > limit
    const pageTasks = hasMore ? tasks.slice(0, limit) : tasks

    const nextCursor = hasMore ? this.encodeCursor(pageTasks[pageTasks.length - 1]) : null

    return {
      tasks: pageTasks.map((task) => this.serializeTask(task)),
      nextCursor,
    }
  }

  async archive({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const task = await Task.query()
      .where('id', params.taskId)
      .where('workspace_id', params.id)
      .where('user_id', user.id)
      .whereNull('archived_at')
      .first()

    if (!task) {
      return response.notFound({ error: 'Task not found' })
    }

    if (CANCELLABLE_TASK_STATUSES.includes(task.status)) {
      await this.agentCommandService.publish(task.latestInvocationId, {
        type: 'cancel_operation',
        reason: 'Task archived by user',
      })
    }

    task.archivedAt = DateTime.now()
    await task.save()

    return {
      taskId: task.id,
      archivedAt: task.archivedAt?.toISO() ?? new Date().toISOString(),
    }
  }

  private parseLimit(value: string | undefined): number {
    if (!value) {
      return DEFAULT_LIMIT
    }

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return DEFAULT_LIMIT
    }

    const normalized = Math.floor(parsed)
    if (normalized <= 0) {
      return 1
    }

    return Math.min(normalized, MAX_LIMIT)
  }

  private encodeCursor(task: Task): string {
    const payload = {
      updatedAt: task.updatedAt.toISO() ?? new Date().toISOString(),
      id: task.id,
    }

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  }

  private decodeCursor(rawCursor: string): TaskCursor | null {
    try {
      const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8')
      const payload = JSON.parse(decoded) as {
        updatedAt?: unknown
        id?: unknown
      }

      if (typeof payload.updatedAt !== 'string' || typeof payload.id !== 'string') {
        return null
      }

      const updatedAt = DateTime.fromISO(payload.updatedAt)
      if (!updatedAt.isValid) {
        return null
      }

      return {
        updatedAt,
        id: payload.id,
      }
    } catch {
      return null
    }
  }

  private serializeTask(task: Task) {
    return {
      taskId: task.id,
      rootInvocationId: task.rootInvocationId,
      latestInvocationId: task.latestInvocationId,
      status: task.status,
      title: task.title,
      description: task.description,
      modifiedFolders: task.modifiedFolders ?? [],
      createdAt: task.createdAt.toISO() ?? new Date().toISOString(),
      updatedAt: task.updatedAt.toISO() ?? new Date().toISOString(),
    }
  }
}
