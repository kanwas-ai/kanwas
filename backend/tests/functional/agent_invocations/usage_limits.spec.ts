import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import app from '@adonisjs/core/services/app'
import { CanvasAgent } from '#agent/index'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'
import OrganizationUsageService, {
  type OrganizationUsageLimitGateResult,
  type OrganizationUsageSnapshot,
} from '#services/organization_usage_service'
import type { AgentSocketMessage } from '#types/socketio'
import { DEFAULT_LLM_PROVIDER } from 'shared/llm-config'

function createUsageSnapshot(now: DateTime): OrganizationUsageSnapshot {
  return {
    weekly: {
      usedCents: 0,
      limitCents: 1250,
      remainingCents: 1250,
      percent: 0,
      periodStartUtc: now.minus({ days: 2 }),
      periodEndUtc: now.plus({ days: 5 }),
    },
    monthly: {
      usedCents: 0,
      limitCents: 5000,
      remainingCents: 5000,
      percent: 0,
      periodStartUtc: now.minus({ days: 10 }),
      periodEndUtc: now.plus({ days: 20 }),
    },
    isOutOfUsage: false,
    lastSyncedAt: now,
  }
}

async function waitForSyncCount(syncCalls: string[], minCount: number): Promise<void> {
  const deadline = Date.now() + 5000

  while (Date.now() < deadline) {
    if (syncCalls.length >= minCount) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for usage sync calls (expected ${minCount}, got ${syncCalls.length})`)
}

function buildAgentState(params: {
  timeline: AgentSocketMessage['state']['timeline']
  anthropicMessages?: AgentSocketMessage['state']['anthropicMessages']
  eventType?: Exclude<AgentSocketMessage['event']['type'], 'tool_streaming'>
  eventItemId?: string
  timestamp?: number
}): AgentSocketMessage {
  const timestamp = params.timestamp ?? Date.now()

  return {
    event: {
      type: params.eventType ?? 'execution_completed',
      itemId: params.eventItemId ?? 'event-item',
      timestamp,
    },
    state: {
      timeline: params.timeline,
      provider: 'anthropic',
      anthropicMessages: params.anthropicMessages ?? [],
    },
  }
}

test.group('Agent invocations - usage limits', () => {
  test('returns blocked terminal payload when organization usage is over limit', async ({ client, assert }) => {
    const user = await User.create({
      email: 'usage-blocked@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Usage Blocked Workspace')
    const now = DateTime.utc()
    const usage = createUsageSnapshot(now)
    usage.weekly.usedCents = 1300
    usage.weekly.remainingCents = 0
    usage.weekly.percent = 100
    usage.isOutOfUsage = true

    const gateResult: OrganizationUsageLimitGateResult = {
      blocked: true,
      reason: 'over_limit',
      blockedPeriodTypes: ['weekly_7d'],
      resetAtUtc: now.plus({ days: 2 }),
      message: 'Your organization has reached its weekly usage limit. Please try again later.',
      usage,
    }

    const syncCalls: string[] = []
    const fakeUsageService = {
      evaluateLimitGate: async () => gateResult,
      getCurrentUsageSnapshot: async () => usage,
      syncCurrentUsagePeriodsForOrganization: async ({ organizationId }: { organizationId: string }) => {
        syncCalls.push(organizationId)
      },
    }

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    app.container.swap(OrganizationUsageService, () => fakeUsageService as unknown as OrganizationUsageService)
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Blocked due to usage',
      })

      response.assertStatus(200)
      const blockedState = response.body().state as any
      assert.equal(blockedState.event.type, 'error')
      assert.deepEqual(Object.keys(blockedState.event).sort(), ['itemId', 'timestamp', 'type'])
      assert.equal(blockedState.state.provider, DEFAULT_LLM_PROVIDER)
      assert.deepEqual(blockedState.state.messages, [])
      assert.lengthOf(blockedState.state.timeline, 2)

      const [userMessageTimelineItem, timelineItem] = blockedState.state.timeline
      assert.equal(userMessageTimelineItem.type, 'user_message')
      assert.equal(userMessageTimelineItem.message, 'Blocked due to usage')
      assert.equal(userMessageTimelineItem.invocationId, response.body().invocationId)

      assert.equal(timelineItem.type, 'error')
      assert.notProperty(timelineItem, 'details')
      assert.equal(timelineItem.error.code, 'OUT_OF_USAGE_LIMIT')
      assert.isString(timelineItem.error.message)
      assert.notProperty(timelineItem.error, 'details')

      assert.equal(response.body().blocked.blockedPeriodTypes[0], 'weekly_7d')
      assert.isString(response.body().blocked.reason)

      const invocation = await Invocation.findOrFail(response.body().invocationId)
      assert.equal(invocation.agentState?.event.type, 'error')

      const task = await Task.findOrFail(response.body().taskId)
      assert.equal(task.status, 'error')

      assert.isFalse(mockAgent.getExecutionInfo().called)

      await waitForSyncCount(syncCalls, 1)
      assert.equal(syncCalls[0], workspace.organizationId)
    } finally {
      app.container.restore(OrganizationUsageService)
      app.container.restore(CanvasAgent)
    }
  })

  test('preserves prior serialized chat state for blocked follow-ups so future retries can resume', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      email: 'usage-follow-up@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Usage Follow-up Workspace')
    const now = DateTime.utc()
    const usage = createUsageSnapshot(now)

    let isBlocked = true
    const blockedGateResult: OrganizationUsageLimitGateResult = {
      blocked: true,
      reason: 'over_limit',
      blockedPeriodTypes: ['weekly_7d'],
      resetAtUtc: now.plus({ days: 2 }),
      message: 'Your organization has reached its weekly usage limit. Please try again later.',
      usage,
    }

    const openGateResult: OrganizationUsageLimitGateResult = {
      blocked: false,
      reason: 'within_limits',
      blockedPeriodTypes: [],
      resetAtUtc: null,
      message: null,
      usage,
    }

    const syncCalls: string[] = []
    const fakeUsageService = {
      evaluateLimitGate: async () => (isBlocked ? blockedGateResult : openGateResult),
      getCurrentUsageSnapshot: async () => usage,
      syncCurrentUsagePeriodsForOrganization: async ({ organizationId }: { organizationId: string }) => {
        syncCalls.push(organizationId)
      },
    }

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    app.container.swap(OrganizationUsageService, () => fakeUsageService as unknown as OrganizationUsageService)
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const priorState = buildAgentState({
        timeline: [
          {
            id: 'root-user',
            type: 'user_message',
            message: 'Original question',
            timestamp: now.toMillis() - 20,
          },
          {
            id: 'root-chat',
            type: 'chat',
            message: 'Original answer',
            timestamp: now.toMillis() - 10,
          },
        ],
        anthropicMessages: [{ role: 'user', content: 'Original question' }],
      })

      const rootInvocation = await Invocation.create({
        query: 'Original question',
        userId: user.id,
        workspaceId: workspace.id,
        canvasId: null,
        yoloMode: false,
        agentState: priorState,
      })

      const task = await Task.create({
        workspaceId: workspace.id,
        userId: user.id,
        rootInvocationId: rootInvocation.id,
        latestInvocationId: rootInvocation.id,
        status: 'complete',
        title: 'Existing task',
        description: rootInvocation.query,
        modifiedFolders: [],
      })

      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const token = loginResponse.body().value

      const blockedResponse = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Blocked follow-up',
        invocation_id: rootInvocation.id,
      })

      blockedResponse.assertStatus(200)
      assert.equal(blockedResponse.body().taskId, task.id)

      const blockedInvocation = await Invocation.findOrFail(blockedResponse.body().invocationId)
      assert.deepEqual(
        blockedInvocation.agentState?.state.timeline.map((item) => item.type),
        ['user_message', 'chat', 'user_message', 'error']
      )
      assert.equal(
        (blockedInvocation.agentState?.state.timeline[2] as { message: string }).message,
        'Blocked follow-up'
      )
      assert.equal(
        (blockedInvocation.agentState?.state.timeline[2] as { invocationId?: string }).invocationId,
        blockedInvocation.id
      )
      assert.deepEqual(blockedInvocation.agentState?.state.messages, priorState.state.anthropicMessages)

      await task.refresh()
      assert.equal(task.latestInvocationId, blockedInvocation.id)
      assert.equal(task.status, 'error')

      mockAgent.reset()
      mockAgent.setMockEvents(createMockAgentEvents())
      isBlocked = false

      const retryResponse = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Now continue',
        invocation_id: blockedInvocation.id,
      })

      retryResponse.assertStatus(200)

      await waitForInvocationCompletion(retryResponse.body().invocationId)

      const loadStateInfo = mockAgent.getLoadStateInfo()
      assert.isTrue(loadStateInfo.called)
      assert.deepEqual(
        loadStateInfo.state.timeline.map((item: { type: string }) => item.type),
        ['user_message', 'chat', 'user_message', 'error']
      )
      assert.deepEqual(loadStateInfo.state.messages, priorState.state.anthropicMessages)

      await waitForSyncCount(syncCalls, 2)
      assert.deepEqual(syncCalls, [workspace.organizationId, workspace.organizationId])
    } finally {
      app.container.restore(OrganizationUsageService)
      app.container.restore(CanvasAgent)
    }
  })

  test('fails open when usage snapshot is missing and syncs after normal completion', async ({ client, assert }) => {
    const user = await User.create({
      email: 'usage-allow@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Usage Allow Workspace')
    const now = DateTime.utc()
    const usage = createUsageSnapshot(now)

    const gateResult: OrganizationUsageLimitGateResult = {
      blocked: false,
      reason: 'missing_snapshot',
      blockedPeriodTypes: [],
      resetAtUtc: null,
      message: null,
      usage,
    }

    const syncCalls: string[] = []
    const fakeUsageService = {
      evaluateLimitGate: async () => gateResult,
      getCurrentUsageSnapshot: async () => usage,
      syncCurrentUsagePeriodsForOrganization: async ({ organizationId }: { organizationId: string }) => {
        syncCalls.push(organizationId)
      },
    }

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    app.container.swap(OrganizationUsageService, () => fakeUsageService as unknown as OrganizationUsageService)
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Allowed with missing snapshot',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      assert.isTrue(mockAgent.getExecutionInfo().called)

      await waitForSyncCount(syncCalls, 1)
      assert.equal(syncCalls[0], workspace.organizationId)
    } finally {
      app.container.restore(OrganizationUsageService)
      app.container.restore(CanvasAgent)
    }
  })
})
