import { SocketioServer } from '#contracts/socketio_server'
import Task, { type TaskTerminalStatus, type TaskStatus } from '#models/task'
import { mergeModifiedFolders as mergeTaskFolders } from '#services/task_folder_service'
import { ContextualLogger } from '#services/contextual_logger'
import { SocketChannels, SocketServerEvents, type TaskUpsertSocketMessage } from '#types/socketio'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export const DEFAULT_TASK_TITLE = 'New task'
export const BACKFILLED_TASK_TITLE = 'Old task'

export class EditableTaskNotFoundError extends Error {
  constructor() {
    super('Edited invocation is not part of an active task branch')
  }
}

export class TaskEditInProgressError extends Error {
  constructor() {
    super('Cannot edit while this task is running')
  }
}

type TaskMutationResult = {
  task: Task
  created: boolean
  changed: boolean
}

type TaskMutationOptions = {
  client?: TransactionClientContract
}

type TaskInProgressStatus = Extract<TaskStatus, 'processing' | 'waiting'>

export function mapAgentTerminalEventToTaskStatus(eventType: string | undefined): TaskTerminalStatus | null {
  if (eventType === 'error') {
    return 'error'
  }

  if (eventType === 'execution_completed' || eventType === 'execution_interrupted') {
    return 'complete'
  }

  return null
}

export default class TaskLifecycleService {
  private logger = ContextualLogger.createFallback({ component: 'TaskLifecycleService' })

  async resolveRootInvocationIdForScope(invocationId: string, workspaceId: string, userId: string): Promise<string> {
    const result = await db.rawQuery(
      `
      WITH RECURSIVE invocation_chain AS (
        SELECT id, parent_invocation_id
        FROM invocations
        WHERE id = ?
          AND workspace_id = ?
          AND user_id = ?

        UNION ALL

        SELECT i.id, i.parent_invocation_id
        FROM invocations i
        INNER JOIN invocation_chain ic ON i.id = ic.parent_invocation_id
        WHERE i.workspace_id = ?
          AND i.user_id = ?
      )
      SELECT id
      FROM invocation_chain
      WHERE parent_invocation_id IS NULL
      LIMIT 1
    `,
      [invocationId, workspaceId, userId, workspaceId, userId]
    )

    return result.rows[0]?.id ?? invocationId
  }

  async createTaskForNewInvocation(
    params: {
      workspaceId: string
      userId: string
      invocationId: string
      description: string
    },
    options: TaskMutationOptions = {}
  ): Promise<TaskMutationResult> {
    const result = await this.mutateTaskByRootInvocation(
      params.invocationId,
      async (existingTask, trx) => {
        if (existingTask) {
          return {
            task: existingTask,
            created: false,
            changed: false,
          }
        }

        const task = await Task.create(
          {
            workspaceId: params.workspaceId,
            userId: params.userId,
            rootInvocationId: params.invocationId,
            latestInvocationId: params.invocationId,
            status: 'initiated',
            title: DEFAULT_TASK_TITLE,
            description: params.description,
            modifiedFolders: [],
          },
          { client: trx }
        )

        return {
          task,
          created: true,
          changed: true,
        }
      },
      options
    )

    if (result.changed) {
      await this.emitTaskUpsertWhenCommitted(result.task, options.client)
    }

    return result
  }

  async attachFollowUpInvocation(
    params: {
      workspaceId: string
      userId: string
      rootInvocationId: string
      invocationId: string
      description: string
    },
    options: TaskMutationOptions = {}
  ): Promise<TaskMutationResult> {
    const result = await this.mutateTaskByRootInvocation(
      params.rootInvocationId,
      async (existingTask, trx) => {
        if (!existingTask) {
          const task = await Task.create(
            {
              workspaceId: params.workspaceId,
              userId: params.userId,
              rootInvocationId: params.rootInvocationId,
              latestInvocationId: params.invocationId,
              status: 'processing',
              title: DEFAULT_TASK_TITLE,
              description: params.description,
              modifiedFolders: [],
            },
            { client: trx }
          )

          return {
            task,
            created: true,
            changed: true,
          }
        }

        if (existingTask.archivedAt) {
          return {
            task: existingTask,
            created: false,
            changed: false,
          }
        }

        existingTask.useTransaction(trx)

        let changed = false
        if (existingTask.latestInvocationId !== params.invocationId) {
          existingTask.latestInvocationId = params.invocationId
          changed = true
        }

        if (existingTask.status !== 'processing') {
          existingTask.status = 'processing'
          changed = true
        }

        if (!existingTask.description && params.description) {
          existingTask.description = params.description
          changed = true
        }

        if (changed) {
          await existingTask.save()
        }

        return {
          task: existingTask,
          created: false,
          changed,
        }
      },
      options
    )

    if (result.changed) {
      await this.emitTaskUpsertWhenCommitted(result.task, options.client)
    }

    return result
  }

  async findTaskContainingInvocationInLatestChain(
    invocationId: string,
    workspaceId: string,
    userId: string,
    options: {
      client?: TransactionClientContract
      lockForUpdate?: boolean
    } = {}
  ): Promise<Task | null> {
    const queryClient = (options.client ?? db) as Pick<typeof db, 'rawQuery'>
    const result = await queryClient.rawQuery(
      `
        WITH RECURSIVE latest_chain AS (
          SELECT
            t.id AS task_id,
            i.id AS invocation_id,
            i.parent_invocation_id
          FROM tasks t
          INNER JOIN invocations i ON i.id = t.latest_invocation_id
          WHERE t.workspace_id = ?
            AND t.user_id = ?
            AND t.archived_at IS NULL
            AND i.workspace_id = ?
            AND i.user_id = ?

          UNION ALL

          SELECT
            latest_chain.task_id,
            i.id AS invocation_id,
            i.parent_invocation_id
          FROM latest_chain
          INNER JOIN invocations i ON i.id = latest_chain.parent_invocation_id
          WHERE i.workspace_id = ?
            AND i.user_id = ?
        )
        SELECT task_id
        FROM latest_chain
        WHERE invocation_id = ?
        LIMIT 1
      `,
      [workspaceId, userId, workspaceId, userId, workspaceId, userId, invocationId]
    )

    const taskId = result.rows[0]?.task_id
    if (!taskId) {
      return null
    }

    const taskQuery = Task.query({ client: options.client }).where('id', taskId).whereNull('archived_at')

    if (options.lockForUpdate) {
      taskQuery.forUpdate()
    }

    return taskQuery.first()
  }

  async rebranchTaskFromEditedInvocation(
    params: {
      taskId: string
      editedInvocationId: string
      invocationId: string
      workspaceId: string
      userId: string
    },
    options: TaskMutationOptions = {}
  ): Promise<TaskMutationResult> {
    const result = await this.mutateTaskById(
      params.taskId,
      async (task, trx) => {
        if (!task || task.archivedAt) {
          throw new EditableTaskNotFoundError()
        }

        if (task.workspaceId !== params.workspaceId || task.userId !== params.userId) {
          throw new EditableTaskNotFoundError()
        }

        const isOnLatestChain = await this.isInvocationInLineage(
          params.editedInvocationId,
          task.latestInvocationId,
          params.workspaceId,
          params.userId,
          trx
        )

        if (!isOnLatestChain) {
          throw new EditableTaskNotFoundError()
        }

        if (!this.isTerminalTaskStatus(task.status)) {
          throw new TaskEditInProgressError()
        }

        task.useTransaction(trx)

        const isRootEdit = task.rootInvocationId === params.editedInvocationId
        let changed = false

        if (isRootEdit && task.rootInvocationId !== params.invocationId) {
          task.rootInvocationId = params.invocationId
          changed = true
        }

        if (task.latestInvocationId !== params.invocationId) {
          task.latestInvocationId = params.invocationId
          changed = true
        }

        task.status = 'processing'
        changed = true

        if (changed) {
          await task.save()
        }

        return {
          task,
          created: false,
          changed,
        }
      },
      options
    )

    if (result.changed) {
      await this.emitTaskUpsertWhenCommitted(result.task, options.client)
    }

    return result
  }

  async markInvocationProcessing(invocationId: string): Promise<Task | null> {
    return this.markInvocationInProgress(invocationId, 'processing')
  }

  async markInvocationWaiting(invocationId: string): Promise<Task | null> {
    return this.markInvocationInProgress(invocationId, 'waiting')
  }

  async markInvocationTerminal(invocationId: string, status: TaskTerminalStatus): Promise<Task | null> {
    const result = await this.mutateTaskByLatestInvocation(invocationId, async (task, trx) => {
      if (!task) {
        return { task: null, changed: false }
      }

      task.useTransaction(trx)

      if (this.isTerminalTaskStatus(task.status)) {
        return { task, changed: false }
      }

      task.status = status
      await task.save()

      return { task, changed: true }
    })

    if (!result.task) {
      return null
    }

    if (result.changed) {
      await this.emitTaskUpsert(result.task)
    }

    return result.task
  }

  async updateTitleIfDefault(taskId: string, title: string): Promise<Task | null> {
    const normalizedTitle = title.trim()
    if (!normalizedTitle || normalizedTitle === DEFAULT_TASK_TITLE) {
      return null
    }

    const result = await db.transaction(async (trx) => {
      const task = await Task.query({ client: trx }).where('id', taskId).whereNull('archived_at').forUpdate().first()

      if (!task) {
        return { task: null as Task | null, changed: false }
      }

      task.useTransaction(trx)

      if (task.title !== DEFAULT_TASK_TITLE) {
        return { task, changed: false }
      }

      task.title = normalizedTitle
      await task.save()

      return { task, changed: true }
    })

    if (!result.task) {
      return null
    }

    if (result.changed) {
      await this.emitTaskUpsert(result.task)
    }

    return result.task
  }

  async mergeModifiedFolders(rootInvocationId: string, folders: string[]): Promise<Task | null> {
    const normalizedFolders = mergeTaskFolders([], folders)
    if (normalizedFolders.length === 0) {
      return null
    }

    const result = await db.transaction(async (trx) => {
      const task = await Task.query({ client: trx })
        .where('root_invocation_id', rootInvocationId)
        .whereNull('archived_at')
        .forUpdate()
        .first()

      if (!task) {
        return { task: null as Task | null, changed: false }
      }

      task.useTransaction(trx)

      const nextFolders = mergeTaskFolders(task.modifiedFolders, normalizedFolders)
      const changed = JSON.stringify(nextFolders) !== JSON.stringify(task.modifiedFolders ?? [])

      if (!changed) {
        return { task, changed: false }
      }

      task.modifiedFolders = nextFolders
      await task.save()

      return { task, changed: true }
    })

    if (!result.task) {
      return null
    }

    if (result.changed) {
      await this.emitTaskUpsert(result.task)
    }

    return result.task
  }

  async createBackfilledTaskIfMissing(
    params: {
      workspaceId: string
      userId: string
      rootInvocationId: string
      latestInvocationId: string
      status: TaskStatus
      description: string
    },
    options: {
      emitRealtime?: boolean
      client?: TransactionClientContract
    } = {}
  ): Promise<TaskMutationResult> {
    const emitRealtime = options.emitRealtime ?? false

    const result = await this.mutateTaskByRootInvocation(
      params.rootInvocationId,
      async (existingTask, trx) => {
        if (existingTask) {
          return {
            task: existingTask,
            created: false,
            changed: false,
          }
        }

        const task = await Task.create(
          {
            workspaceId: params.workspaceId,
            userId: params.userId,
            rootInvocationId: params.rootInvocationId,
            latestInvocationId: params.latestInvocationId,
            status: params.status,
            title: BACKFILLED_TASK_TITLE,
            description: params.description,
            modifiedFolders: [],
          },
          { client: trx }
        )

        return {
          task,
          created: true,
          changed: true,
        }
      },
      { client: options.client }
    )

    if (emitRealtime && result.changed) {
      await this.emitTaskUpsertWhenCommitted(result.task, options.client)
    }

    return result
  }

  private async mutateTaskByRootInvocation(
    rootInvocationId: string,
    callback: (task: Task | null, trx: TransactionClientContract) => Promise<TaskMutationResult>,
    options: TaskMutationOptions = {}
  ): Promise<TaskMutationResult> {
    if (options.client) {
      const task = await Task.query({ client: options.client })
        .where('root_invocation_id', rootInvocationId)
        .forUpdate()
        .first()
      return callback(task, options.client)
    }

    const run = () => {
      return db.transaction(async (trx) => {
        const task = await Task.query({ client: trx }).where('root_invocation_id', rootInvocationId).forUpdate().first()
        return callback(task, trx)
      })
    }

    try {
      return await run()
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.warn({ rootInvocationId }, 'Detected concurrent task creation; retrying task mutation')
        return run()
      }

      throw error
    }
  }

  private async mutateTaskById(
    taskId: string,
    callback: (task: Task | null, trx: TransactionClientContract) => Promise<TaskMutationResult>,
    options: TaskMutationOptions = {}
  ): Promise<TaskMutationResult> {
    if (options.client) {
      const task = await Task.query({ client: options.client })
        .where('id', taskId)
        .whereNull('archived_at')
        .forUpdate()
        .first()
      return callback(task, options.client)
    }

    return db.transaction(async (trx) => {
      const task = await Task.query({ client: trx }).where('id', taskId).whereNull('archived_at').forUpdate().first()
      return callback(task, trx)
    })
  }

  private async mutateTaskByLatestInvocation(
    latestInvocationId: string,
    callback: (task: Task | null, trx: TransactionClientContract) => Promise<{ task: Task | null; changed: boolean }>
  ): Promise<{ task: Task | null; changed: boolean }> {
    return db.transaction(async (trx) => {
      const task = await Task.query({ client: trx })
        .where('latest_invocation_id', latestInvocationId)
        .whereNull('archived_at')
        .forUpdate()
        .first()
      return callback(task, trx)
    })
  }

  private async isInvocationInLineage(
    invocationId: string,
    descendantInvocationId: string,
    workspaceId: string,
    userId: string,
    client?: TransactionClientContract
  ): Promise<boolean> {
    const queryClient = (client ?? db) as Pick<typeof db, 'rawQuery'>
    const result = await queryClient.rawQuery(
      `
        WITH RECURSIVE invocation_chain AS (
          SELECT id, parent_invocation_id
          FROM invocations
          WHERE id = ?
            AND workspace_id = ?
            AND user_id = ?

          UNION ALL

          SELECT i.id, i.parent_invocation_id
          FROM invocations i
          INNER JOIN invocation_chain ic ON i.id = ic.parent_invocation_id
          WHERE i.workspace_id = ?
            AND i.user_id = ?
        )
        SELECT 1
        FROM invocation_chain
        WHERE id = ?
        LIMIT 1
      `,
      [descendantInvocationId, workspaceId, userId, workspaceId, userId, invocationId]
    )

    return result.rows.length > 0
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return !!error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505'
  }

  private isTerminalTaskStatus(status: TaskStatus): status is TaskTerminalStatus {
    return status === 'complete' || status === 'error'
  }

  private async markInvocationInProgress(invocationId: string, status: TaskInProgressStatus): Promise<Task | null> {
    const result = await this.mutateTaskByLatestInvocation(invocationId, async (task, trx) => {
      if (!task) {
        return { task: null, changed: false }
      }

      task.useTransaction(trx)

      if (this.isTerminalTaskStatus(task.status) || task.status === status) {
        return { task, changed: false }
      }

      task.status = status
      await task.save()

      return { task, changed: true }
    })

    if (!result.task) {
      return null
    }

    if (result.changed) {
      await this.emitTaskUpsert(result.task)
    }

    return result.task
  }

  private buildTaskUpsertPayload(task: Task): TaskUpsertSocketMessage {
    return {
      taskId: task.id,
      rootInvocationId: task.rootInvocationId,
      latestInvocationId: task.latestInvocationId,
      status: task.status,
      modifiedFolders: task.modifiedFolders ?? [],
      updatedAt: task.updatedAt.toISO() ?? new Date().toISOString(),
    }
  }

  private async emitTaskUpsertWhenCommitted(task: Task, client?: TransactionClientContract): Promise<void> {
    const payload = this.buildTaskUpsertPayload(task)

    if (client) {
      const taskId = task.id
      const workspaceId = task.workspaceId
      const userId = task.userId

      client.after('commit', async () => {
        await this.emitTaskUpsertPayload({
          taskId,
          workspaceId,
          userId,
          payload,
        })
      })

      return
    }

    await this.emitTaskUpsertPayload({
      taskId: task.id,
      workspaceId: task.workspaceId,
      userId: task.userId,
      payload,
    })
  }

  async emitTaskUpsert(task: Task): Promise<void> {
    await this.emitTaskUpsertWhenCommitted(task)
  }

  private async emitTaskUpsertPayload(params: {
    taskId: string
    workspaceId: string
    userId: string
    payload: TaskUpsertSocketMessage
  }): Promise<void> {
    if (app.getEnvironment() !== 'web') {
      return
    }

    try {
      const socketio = await app.container.make(SocketioServer)
      const channel = SocketChannels.taskEvents(params.workspaceId, params.userId)
      socketio.to(channel).emit(SocketServerEvents.TASK_UPSERT, params.payload)
    } catch (error) {
      this.logger.warn(
        {
          taskId: params.taskId,
          workspaceId: params.workspaceId,
          userId: params.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to emit task upsert event'
      )
    }
  }
}
