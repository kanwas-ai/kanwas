import { inject } from '@adonisjs/core'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import { DEFAULT_LLM_PROVIDER } from 'shared/llm-config'
import Invocation from '#models/invocation'
import Task, { type TaskStatus } from '#models/task'
import { SocketioServer } from '#contracts/socketio_server'
import { SocketChannels, SocketServerEvents, type AgentSocketMessage } from '#types/socketio'
import TaskLifecycleService from '#services/task_lifecycle_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'
import type { SerializedState } from '#agent/index'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export const AGENT_PROCESS_LOST_ERROR_CODE = 'AGENT_PROCESS_LOST'
export const AGENT_PROCESS_LOST_MESSAGE = 'The agent process stopped unexpectedly. Start a new message to continue.'

const PROCESS_RUNTIME_OWNER_ID = `${process.pid}:${randomUUID()}`
const RUNNING_TASK_STATUSES: TaskStatus[] = ['initiated', 'processing', 'waiting']
const TERMINAL_AGENT_EVENT_TYPES = new Set(['execution_completed', 'execution_interrupted', 'error'])

type RecoveryReason = 'lease_expired' | 'never_started' | 'cancel_no_live_subscriber' | 'cancel_unhandled'

type RecoveryResult = {
  invocation: Invocation
  task: Task
  message: AgentSocketMessage
}

@inject()
export default class AgentRuntimeService {
  static readonly HEARTBEAT_INTERVAL_MS = 10_000
  static readonly LEASE_TTL_MS = 60_000
  static readonly NEVER_STARTED_GRACE_MS = 30_000
  static readonly STALE_CANCEL_GRACE_MS = 15_000

  private logger = ContextualLogger.createFallback({ component: 'AgentRuntimeService' })

  constructor(private taskLifecycleService: TaskLifecycleService) {}

  get ownerId(): string {
    return PROCESS_RUNTIME_OWNER_ID
  }

  async acquireLease(invocationId: string, ownerId: string = this.ownerId): Promise<boolean> {
    return db.transaction(async (trx) => {
      const now = DateTime.utc()
      const invocation = await Invocation.query({ client: trx }).where('id', invocationId).forUpdate().first()

      if (!invocation || invocation.agentRecoveredAt) {
        return false
      }

      const hasLiveLease =
        invocation.agentRuntimeOwnerId &&
        invocation.agentRuntimeOwnerId !== ownerId &&
        invocation.agentLeaseExpiresAt &&
        invocation.agentLeaseExpiresAt > now

      if (hasLiveLease) {
        return false
      }

      invocation.agentRuntimeOwnerId = ownerId
      invocation.agentStartedAt = invocation.agentStartedAt ?? now
      invocation.agentLeaseExpiresAt = now.plus({ milliseconds: AgentRuntimeService.LEASE_TTL_MS })
      invocation.useTransaction(trx)
      await invocation.save()

      return true
    })
  }

  async refreshLease(invocationId: string, ownerId: string = this.ownerId): Promise<boolean> {
    const invocation = await Invocation.query()
      .where('id', invocationId)
      .where('agent_runtime_owner_id', ownerId)
      .whereNull('agent_recovered_at')
      .first()

    if (!invocation) {
      return false
    }

    invocation.agentLeaseExpiresAt = DateTime.utc().plus({ milliseconds: AgentRuntimeService.LEASE_TTL_MS })
    await invocation.save()

    return true
  }

  async releaseLease(invocationId: string, ownerId: string = this.ownerId): Promise<void> {
    const invocation = await Invocation.query()
      .where('id', invocationId)
      .where('agent_runtime_owner_id', ownerId)
      .whereNull('agent_recovered_at')
      .first()

    if (!invocation) {
      return
    }

    invocation.agentRuntimeOwnerId = null
    invocation.agentLeaseExpiresAt = null
    await invocation.save()
  }

  async expireLeasesForOwner(ownerId: string = this.ownerId): Promise<number> {
    const invocations = await Invocation.query()
      .where('agent_runtime_owner_id', ownerId)
      .whereNull('agent_recovered_at')

    const now = DateTime.utc()

    for (const invocation of invocations) {
      invocation.agentLeaseExpiresAt = now
      await invocation.save()
    }

    return invocations.length
  }

  async requestCancel(invocationId: string, reason?: string): Promise<void> {
    const invocation = await Invocation.find(invocationId)
    if (!invocation || invocation.agentRecoveredAt) {
      return
    }

    invocation.agentCancelRequestedAt = DateTime.utc()
    invocation.agentCancelReason = reason ?? null
    await invocation.save()
  }

  async getCancelRequest(invocationId: string): Promise<{ reason?: string } | null> {
    const invocation = await Invocation.find(invocationId)
    if (!invocation?.agentCancelRequestedAt || invocation.agentRecoveredAt) {
      return null
    }

    return { reason: invocation.agentCancelReason ?? undefined }
  }

  async isRecovered(invocationId: string): Promise<boolean> {
    const invocation = await Invocation.query().where('id', invocationId).select('agent_recovered_at').first()
    return !!invocation?.agentRecoveredAt
  }

  async persistAgentStateIfOwned(invocationId: string, ownerId: string, message: AgentSocketMessage): Promise<boolean> {
    const invocation = await Invocation.query()
      .where('id', invocationId)
      .where('agent_runtime_owner_id', ownerId)
      .whereNull('agent_recovered_at')
      .first()

    if (!invocation) {
      return false
    }

    invocation.agentState = message
    await invocation.save()
    return true
  }

  async persistExecutionErrorIfMissing(invocationId: string, ownerId: string, error: unknown): Promise<boolean> {
    const invocation = await Invocation.query()
      .where('id', invocationId)
      .where('agent_runtime_owner_id', ownerId)
      .whereNull('agent_recovered_at')
      .first()

    if (!invocation || TERMINAL_AGENT_EVENT_TYPES.has(invocation.agentState?.event.type ?? '')) {
      return false
    }

    const message = this.buildErrorAgentState({
      invocation,
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error,
      parentState: await this.loadParentState(invocation),
    })

    invocation.agentState = message
    await invocation.save()
    await this.emitAgentMessage(invocation.id, message)

    return true
  }

  async recoverIfStartedWithoutSubscribers(invocationId: string): Promise<RecoveryResult | null> {
    const invocation = await Invocation.find(invocationId)
    if (this.hasPendingQuestion(invocation?.agentState?.state)) {
      return null
    }

    return this.recoverInvocation(invocationId, 'cancel_no_live_subscriber', { requireStarted: true })
  }

  async recoverStaleInvocations(): Promise<{ recovered: number }> {
    const tasks = await Task.query()
      .whereIn('status', RUNNING_TASK_STATUSES)
      .whereNull('archived_at')
      .preload('latestInvocation')
      .orderBy('updated_at', 'asc')
      .limit(100)

    let recovered = 0
    const now = DateTime.utc()
    const neverStartedBefore = now.minus({ milliseconds: AgentRuntimeService.NEVER_STARTED_GRACE_MS })
    const staleCancelBefore = now.minus({ milliseconds: AgentRuntimeService.STALE_CANCEL_GRACE_MS })

    for (const task of tasks) {
      const invocation = task.latestInvocation
      if (!invocation || invocation.agentRecoveredAt) {
        continue
      }

      let reason: RecoveryReason | null = null

      if (!invocation.agentStartedAt && invocation.createdAt <= neverStartedBefore) {
        reason = 'never_started'
      } else if (invocation.agentLeaseExpiresAt && invocation.agentLeaseExpiresAt <= now) {
        if (this.hasPendingQuestion(invocation.agentState?.state)) {
          const released = await this.releaseStaleWaitingQuestionInvocation(invocation.id)
          if (released) {
            recovered += 1
          }
          continue
        }

        reason = 'lease_expired'
      } else if (
        invocation.agentCancelRequestedAt &&
        invocation.agentCancelRequestedAt <= staleCancelBefore &&
        !(await this.hasLiveCommandSubscriber(invocation.id))
      ) {
        reason = 'cancel_unhandled'
      }

      if (!reason) {
        continue
      }

      const result = await this.recoverInvocation(invocation.id, reason)
      if (result) {
        recovered += 1
      }
    }

    return { recovered }
  }

  private async recoverInvocation(
    invocationId: string,
    reason: RecoveryReason,
    options: { requireStarted?: boolean } = {}
  ): Promise<RecoveryResult | null> {
    const result = await db.transaction(async (trx) => {
      const invocation = await Invocation.query({ client: trx }).where('id', invocationId).forUpdate().first()
      if (!invocation || invocation.agentRecoveredAt || (options.requireStarted && !invocation.agentStartedAt)) {
        return null
      }

      const task = await Task.query({ client: trx })
        .where('latest_invocation_id', invocationId)
        .whereNull('archived_at')
        .forUpdate()
        .first()

      if (!task || !RUNNING_TASK_STATUSES.includes(task.status)) {
        return null
      }

      const message = this.buildErrorAgentState({
        invocation,
        code: AGENT_PROCESS_LOST_ERROR_CODE,
        message: AGENT_PROCESS_LOST_MESSAGE,
        details: { reason },
        parentState: await this.loadParentState(invocation, trx),
      })

      invocation.agentState = message
      invocation.agentRecoveredAt = DateTime.utc()
      invocation.agentRecoveryReason = reason
      invocation.agentRuntimeOwnerId = null
      invocation.agentLeaseExpiresAt = null
      invocation.useTransaction(trx)
      await invocation.save()

      task.status = 'error'
      task.useTransaction(trx)
      await task.save()

      return { invocation, task, message }
    })

    if (!result) {
      return null
    }

    await this.emitAgentMessage(invocationId, result.message)
    await this.taskLifecycleService.emitTaskUpsert(result.task)

    this.logger.warn(
      {
        invocationId,
        taskId: result.task.id,
        reason,
      },
      'Recovered dead agent invocation'
    )

    return result
  }

  private async releaseStaleWaitingQuestionInvocation(invocationId: string): Promise<boolean> {
    const result = await db.transaction(async (trx) => {
      const invocation = await Invocation.query({ client: trx }).where('id', invocationId).forUpdate().first()
      if (!invocation || invocation.agentRecoveredAt || !this.hasPendingQuestion(invocation.agentState?.state)) {
        return null
      }

      const task = await Task.query({ client: trx })
        .where('latest_invocation_id', invocationId)
        .whereNull('archived_at')
        .forUpdate()
        .first()

      invocation.agentRuntimeOwnerId = null
      invocation.agentLeaseExpiresAt = null
      invocation.useTransaction(trx)
      await invocation.save()

      if (task && RUNNING_TASK_STATUSES.includes(task.status) && task.status !== 'waiting') {
        task.status = 'waiting'
        task.useTransaction(trx)
        await task.save()
      }

      return { invocation, task }
    })

    if (!result) {
      return false
    }

    if (result.task) {
      await this.taskLifecycleService.emitTaskUpsert(result.task)
    }

    this.logger.warn(
      {
        invocationId,
      },
      'Released stale runtime lease for invocation waiting on user question'
    )

    return true
  }

  private async loadParentState(
    invocation: Invocation,
    client?: TransactionClientContract
  ): Promise<SerializedState | null> {
    if (!invocation.parentInvocationId) {
      return null
    }

    const parentQuery = client ? Invocation.query({ client }) : Invocation.query()
    const parent = await parentQuery.where('id', invocation.parentInvocationId).select('agent_state').first()

    return parent?.agentState?.state ?? null
  }

  private buildErrorAgentState(params: {
    invocation: Invocation
    code: string
    message: string
    details?: unknown
    parentState?: SerializedState | null
  }): AgentSocketMessage {
    const timestamp = Date.now()
    const errorItemId = `${timestamp}_error`
    const state = this.cloneSerializedState(params.invocation.agentState?.state ?? params.parentState)

    const hasUserMessageForInvocation = state.timeline.some((item) => {
      const timelineItem = item as { type: string; invocationId?: string }
      return timelineItem.type === 'user_message' && timelineItem.invocationId === params.invocation.id
    })

    if (!hasUserMessageForInvocation) {
      state.timeline.push({
        id: `${timestamp}_user_message`,
        type: 'user_message',
        message: params.invocation.query,
        timestamp,
        invocationId: params.invocation.id,
        uploadedFiles: params.invocation.files || undefined,
      })
    }

    state.timeline = state.timeline.map((item) => {
      if (
        [
          'web_search',
          'composio_search',
          'composio_tool',
          'composio_workbench',
          'composio_bash',
          'composio_schema',
          'text_editor',
          'reposition_files',
          'bash',
          'web_fetch',
          'subagent_execution',
          'suggested_tasks',
        ].includes(item.type) &&
        'status' in item &&
        ['executing', 'searching', 'fetching', 'initializing', 'in_progress', 'running', 'loading'].includes(
          String(item.status)
        )
      ) {
        return {
          ...item,
          status: 'failed',
          error: 'Agent process stopped unexpectedly',
        } as typeof item
      }

      return item
    })

    state.timeline.push({
      id: errorItemId,
      type: 'error',
      error: {
        code: params.code,
        message: params.message,
        details: params.details,
        timestamp,
      },
      timestamp,
    })

    return {
      event: {
        type: 'error',
        itemId: errorItemId,
        timestamp,
      },
      state,
    }
  }

  private cloneSerializedState(state: SerializedState | null | undefined): SerializedState {
    return {
      provider: state?.provider ?? DEFAULT_LLM_PROVIDER,
      messages: [...(state?.messages ?? state?.anthropicMessages ?? [])],
      timeline: Array.isArray(state?.timeline) ? [...state.timeline] : [],
    }
  }

  private hasPendingQuestion(state: SerializedState | null | undefined): boolean {
    return (
      state?.timeline?.some((item) => {
        const timelineItem = item as { type?: string; status?: string }
        return timelineItem.type === 'ask_question' && timelineItem.status === 'pending'
      }) ?? false
    )
  }

  private async hasLiveCommandSubscriber(invocationId: string): Promise<boolean> {
    const channel = SocketChannels.agentCommands(invocationId)
    const result = (await (redis.connection().ioConnection as any).pubsub('numsub', channel)) as Array<string | number>
    return Number(result[1] ?? 0) > 0
  }

  private async emitAgentMessage(invocationId: string, message: AgentSocketMessage): Promise<void> {
    if (app.getEnvironment() !== 'web') {
      return
    }

    try {
      const socketio = await app.container.make(SocketioServer)
      socketio.to(SocketChannels.agentEvents(invocationId)).emit(SocketServerEvents.AGENT_MESSAGE, message)
    } catch (error) {
      this.logger.warn(
        {
          invocationId,
          err: toError(error),
        },
        'Failed to emit recovered agent state'
      )
    }
  }
}
