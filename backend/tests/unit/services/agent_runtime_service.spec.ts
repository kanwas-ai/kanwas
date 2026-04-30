import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import AgentRuntimeService, { AGENT_PROCESS_LOST_ERROR_CODE } from '#services/agent_runtime_service'
import TaskLifecycleService from '#services/task_lifecycle_service'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function createRunningInvocation(params: { email: string; taskStatus?: 'initiated' | 'processing' | 'waiting' }) {
  const user = await User.create({
    email: params.email,
    password: 'password123',
  })
  const workspace = await createTestWorkspace(user, 'Agent Runtime Workspace')
  const invocation = await Invocation.create({
    query: 'Recover this invocation',
    userId: user.id,
    workspaceId: workspace.id,
    canvasId: null,
    yoloMode: false,
    agentState: null,
  })
  const task = await Task.create({
    workspaceId: workspace.id,
    userId: user.id,
    rootInvocationId: invocation.id,
    latestInvocationId: invocation.id,
    status: params.taskStatus ?? 'processing',
    title: 'Runtime recovery',
    description: invocation.query,
    modifiedFolders: [],
  })

  return { invocation, task }
}

test.group('AgentRuntimeService', () => {
  test('recovers an expired runtime lease', async ({ assert }) => {
    const { invocation, task } = await createRunningInvocation({
      email: 'expired-lease@example.com',
    })

    invocation.agentRuntimeOwnerId = 'dead-owner'
    invocation.agentStartedAt = DateTime.utc().minus({ minutes: 2 })
    invocation.agentLeaseExpiresAt = DateTime.utc().minus({ seconds: 1 })
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    const result = await service.recoverStaleInvocations()

    assert.equal(result.recovered, 1)

    await invocation.refresh()
    await task.refresh()

    assert.equal(task.status, 'error')
    assert.equal(invocation.agentRecoveryReason, 'lease_expired')
    assert.equal(invocation.agentState?.event.type, 'error')
    assert.equal(invocation.agentState?.state.timeline.at(-1)?.type, 'error')
    assert.equal((invocation.agentState?.state.timeline.at(-1) as any).error.code, AGENT_PROCESS_LOST_ERROR_CODE)
  })

  test('recovers an invocation that never acquired a lease', async ({ assert }) => {
    const { invocation, task } = await createRunningInvocation({
      email: 'never-started@example.com',
      taskStatus: 'initiated',
    })

    invocation.createdAt = DateTime.utc().minus({ minutes: 2 })
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    const result = await service.recoverStaleInvocations()

    assert.equal(result.recovered, 1)

    await invocation.refresh()
    await task.refresh()

    assert.equal(task.status, 'error')
    assert.equal(invocation.agentRecoveryReason, 'never_started')
    assert.equal(invocation.agentState?.event.type, 'error')
  })

  test('releases expired lease without error when invocation is waiting on a question', async ({ assert }) => {
    const { invocation, task } = await createRunningInvocation({
      email: 'waiting-question-lease@example.com',
      taskStatus: 'processing',
    })

    invocation.agentRuntimeOwnerId = 'dead-owner'
    invocation.agentStartedAt = DateTime.utc().minus({ minutes: 2 })
    invocation.agentLeaseExpiresAt = DateTime.utc().minus({ seconds: 1 })
    invocation.agentState = {
      event: {
        type: 'ask_question_created',
        itemId: 'ask-1',
        timestamp: Date.now(),
      },
      state: {
        provider: 'openai',
        messages: [],
        timeline: [
          {
            id: 'ask-1',
            type: 'ask_question',
            questions: [],
            status: 'pending',
            timestamp: Date.now(),
            agent: { source: 'main' },
          },
        ],
      },
    } as any
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    const result = await service.recoverStaleInvocations()

    assert.equal(result.recovered, 1)

    await invocation.refresh()
    await task.refresh()

    assert.equal(task.status, 'waiting')
    assert.isNull(invocation.agentRuntimeOwnerId)
    assert.isNull(invocation.agentLeaseExpiresAt)
    assert.isNull(invocation.agentRecoveredAt)
    assert.equal(invocation.agentState?.event.type, 'ask_question_created')
  })

  test('recovers an expired answered-question resume lease as process lost', async ({ assert }) => {
    const { invocation, task } = await createRunningInvocation({
      email: 'answered-question-resume-lease@example.com',
      taskStatus: 'processing',
    })

    invocation.agentRuntimeOwnerId = 'dead-owner'
    invocation.agentStartedAt = DateTime.utc().minus({ minutes: 2 })
    invocation.agentLeaseExpiresAt = DateTime.utc().minus({ seconds: 1 })
    invocation.agentState = {
      event: {
        type: 'ask_question_answered',
        itemId: 'ask-1',
        timestamp: Date.now(),
      },
      state: {
        provider: 'openai',
        messages: [
          {
            role: 'user',
            content: 'The user answered the pending ask_question card.\n\nQ: Which file?\nA: notes.md',
          },
        ],
        timeline: [
          {
            id: 'ask-1',
            type: 'ask_question',
            questions: [],
            status: 'answered',
            answers: { q1: ['notes'] },
            timestamp: Date.now(),
            agent: { source: 'main' },
          },
        ],
      },
    } as any
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    const result = await service.recoverStaleInvocations()

    assert.equal(result.recovered, 1)

    await invocation.refresh()
    await task.refresh()

    assert.equal(task.status, 'error')
    assert.equal(invocation.agentRecoveryReason, 'lease_expired')
    assert.equal(invocation.agentState?.event.type, 'error')
    assert.equal((invocation.agentState?.state.timeline.at(-1) as any).error.code, AGENT_PROCESS_LOST_ERROR_CODE)
  })

  test('does not steal a live lease from another owner', async ({ assert }) => {
    const { invocation } = await createRunningInvocation({
      email: 'live-lease-owner@example.com',
    })

    invocation.agentRuntimeOwnerId = 'live-owner'
    invocation.agentStartedAt = DateTime.utc()
    invocation.agentLeaseExpiresAt = DateTime.utc().plus({ seconds: 30 })
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    const acquired = await service.acquireLease(invocation.id, 'duplicate-owner')

    await invocation.refresh()

    assert.isFalse(acquired)
    assert.equal(invocation.agentRuntimeOwnerId, 'live-owner')
  })

  test('prevents recovered state and task status from being overwritten by late saves', async ({ assert }) => {
    const { invocation, task } = await createRunningInvocation({
      email: 'late-save-recovered@example.com',
    })

    invocation.agentRuntimeOwnerId = 'dead-owner'
    invocation.agentStartedAt = DateTime.utc().minus({ minutes: 2 })
    invocation.agentLeaseExpiresAt = DateTime.utc().minus({ seconds: 1 })
    await invocation.save()

    const service = new AgentRuntimeService(new TaskLifecycleService())
    await service.recoverStaleInvocations()

    const persisted = await service.persistAgentStateIfOwned(invocation.id, 'dead-owner', {
      event: {
        type: 'execution_completed',
        itemId: 'completed-1',
        timestamp: Date.now(),
      },
      state: {
        provider: 'openai',
        messages: [],
        timeline: [
          {
            id: 'completed-1',
            type: 'chat',
            message: 'late completion',
            timestamp: Date.now(),
          },
        ],
      },
    } as any)

    await new TaskLifecycleService().markInvocationTerminal(invocation.id, 'complete')

    await invocation.refresh()
    await task.refresh()

    assert.isFalse(persisted)
    assert.equal(task.status, 'error')
    assert.equal(invocation.agentState?.event.type, 'error')
    assert.equal(invocation.agentRecoveryReason, 'lease_expired')
  })
})
