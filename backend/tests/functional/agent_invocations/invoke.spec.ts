import { test } from '@japa/runner'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'
import { CanvasAgent } from '#agent/index'
import app from '@adonisjs/core/services/app'
import Invocation from '#models/invocation'
import Task from '#models/task'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'
import { fakeSandboxRegistry } from '#tests/mocks/sandbox_registry'
import type { AgentSocketMessage } from '#types/socketio'

type TimelineItem = AgentSocketMessage['state']['timeline'][number]
type PersistedMessage = NonNullable<AgentSocketMessage['state']['messages']>[number]

function buildAgentState(timeline: TimelineItem[], messages: PersistedMessage[] = []): AgentSocketMessage {
  return {
    event: {
      type: 'execution_completed' as const,
      itemId: 'event-item',
      timestamp: Date.now(),
    },
    state: {
      timeline,
      provider: 'anthropic' as const,
      anthropicMessages: messages,
    },
  }
}

function buildUserMessageItem(
  invocationId: string,
  id: string,
  message: string,
  timestamp: number
): Extract<TimelineItem, { type: 'user_message' }> {
  return {
    id,
    type: 'user_message' as const,
    invocationId,
    message,
    timestamp,
  }
}

function buildChatItem(id: string, message: string, timestamp: number): Extract<TimelineItem, { type: 'chat' }> {
  return {
    id,
    type: 'chat',
    message,
    timestamp,
  }
}

test.group('Agent invocations - invoke', () => {
  test('should create invocation and trigger agent execution', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Setup mock agent
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    // Get auth token
    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Note: Socket.IO messages will be emitted during agent execution
    // For this test, we verify the invocation state was updated correctly

    // Make invoke request
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query',
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId
    const taskId = response.body().taskId
    assert.isString(invocationId)
    assert.isString(taskId)

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    const sandboxRecord = fakeSandboxRegistry.getInvocationRecord(invocationId)
    assert.exists(sandboxRecord)
    assert.equal(sandboxRecord!.invocationId, invocationId)
    assert.equal(sandboxRecord!.workspaceId, workspace.id)

    // Verify invocation was created
    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.equal(invocation!.query, 'Test query')
    assert.equal(invocation!.mode, 'thinking')

    // Verify agent execute was called with correct parameters
    const executionInfo = mockAgent.getExecutionInfo()
    assert.isTrue(executionInfo.called)
    assert.equal(executionInfo.query, 'Test query')
    assert.exists(executionInfo.context)
    assert.equal(executionInfo.context!.userId, user.id)
    assert.equal(executionInfo.context!.userName, user.name)
    assert.equal(executionInfo.context!.organizationId, workspace.organizationId)
    assert.equal(executionInfo.context!.aiSessionId, invocationId)
    assert.equal(executionInfo.context!.agentMode, 'thinking')
    assert.equal(executionInfo.context!.auditActor, `agent:${user.id}`)
    assert.isString(executionInfo.context!.auditTimestamp)
    assert.isFalse(Number.isNaN(Date.parse(executionInfo.context!.auditTimestamp!)))

    // Verify invocation state was updated
    const updatedInvocation = await Invocation.find(invocationId)
    assert.exists(updatedInvocation!.agentState)
    assert.exists(updatedInvocation!.agentState!.event)
    assert.exists(updatedInvocation!.agentState!.state)

    const task = await Task.find(taskId)
    assert.exists(task)
    assert.equal(task!.rootInvocationId, invocationId)
    assert.equal(task!.latestInvocationId, invocationId)
    assert.equal(task!.status, 'complete')
    assert.equal(task!.description, 'Test query')
    assert.isString(task!.title)

    // Note: In a real integration test, we would verify Socket.IO messages
    // For now, we verify the agent state was updated correctly
    // TODO: Add Socket.IO message tracking in tests

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should persist explicit direct mode and pass it to agent context', async ({ client, assert }) => {
    const user = await User.create({
      email: 'direct-mode@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Direct Mode Workspace')
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'direct-mode@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Test direct mode',
        mode: 'direct',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      const invocation = await Invocation.findOrFail(invocationId)
      assert.equal(invocation.mode, 'direct')

      const executionInfo = mockAgent.getExecutionInfo()
      assert.isTrue(executionInfo.called)
      assert.equal(executionInfo.context!.agentMode, 'direct')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should default follow-up invocation mode to thinking instead of inheriting parent mode', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      email: 'follow-up-mode@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Follow-up Mode Workspace')
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'follow-up-mode@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const firstResponse = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Parent direct request',
        mode: 'direct',
      })

      firstResponse.assertStatus(200)
      const parentInvocationId = firstResponse.body().invocationId
      await waitForInvocationCompletion(parentInvocationId)

      const secondResponse = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Follow up with default mode',
        invocation_id: parentInvocationId,
      })

      secondResponse.assertStatus(200)
      const childInvocationId = secondResponse.body().invocationId
      await waitForInvocationCompletion(childInvocationId)

      const parentInvocation = await Invocation.findOrFail(parentInvocationId)
      const childInvocation = await Invocation.findOrFail(childInvocationId)

      assert.equal(parentInvocation.mode, 'direct')
      assert.equal(childInvocation.mode, 'thinking')
      assert.equal(childInvocation.parentInvocationId, parentInvocationId)
      assert.equal(mockAgent.getExecutionInfo().context!.agentMode, 'thinking')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should reject invalid agent mode', async ({ client }) => {
    const user = await User.create({
      email: 'invalid-mode@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Invalid Mode Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: 'invalid-mode@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Invalid mode request',
      mode: 'planner',
    })

    response.assertStatus(422)
  })

  test('should pass frontend workspace context through to agent execute context', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Setup mock agent
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      // Get auth token
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const workspaceTree = 'root/\n  c-123/\n    note.md\n'
      const activeCanvasContext = 'Active canvas: /workspace/research/\n\nSections:\n- none'

      // Make invoke request with pre-computed workspace tree
      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Test query',
        workspace_tree: workspaceTree,
        active_canvas_context: activeCanvasContext,
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId

      // Wait for agent to process
      await waitForInvocationCompletion(invocationId)

      // Verify agent execute was called with workspaceTree in context
      const executionInfo = mockAgent.getExecutionInfo()
      assert.isTrue(executionInfo.called)
      assert.exists(executionInfo.context)
      assert.equal(executionInfo.context!.workspaceTree, workspaceTree)
      assert.equal(executionInfo.context!.activeCanvasContext, activeCanvasContext)
    } finally {
      // Cleanup
      app.container.restore(CanvasAgent)
    }
  })

  test('should mark task as error when agent emits a terminal error event', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents([
      {
        type: 'thinking',
        itemId: 'item-1',
        timestamp: Date.now(),
      },
      {
        type: 'error',
        itemId: 'item-2',
        timestamp: Date.now(),
      },
    ])

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Fail this task',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      const taskId = response.body().taskId

      await waitForInvocationCompletion(invocationId, {
        acceptedEvents: ['error'],
      })

      const task = await Task.findOrFail(taskId)
      assert.equal(task.status, 'error')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should mark task as complete when agent emits execution_interrupted', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents([
      {
        type: 'thinking',
        itemId: 'item-1',
        timestamp: Date.now(),
      },
      {
        type: 'execution_interrupted',
        itemId: 'item-2',
        timestamp: Date.now(),
      },
    ])

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Interrupt this task',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      const taskId = response.body().taskId

      await waitForInvocationCompletion(invocationId, {
        acceptedEvents: ['execution_interrupted'],
      })

      const task = await Task.findOrFail(taskId)
      assert.equal(task.status, 'complete')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should mark task as waiting when agent requests user input', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents([
      {
        type: 'thinking',
        itemId: 'item-1',
        timestamp: Date.now(),
      },
      {
        type: 'ask_question_created',
        itemId: 'item-2',
        timestamp: Date.now(),
      },
    ])

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Need user input',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      const taskId = response.body().taskId

      await waitForInvocationCompletion(invocationId, {
        acceptedEvents: ['ask_question_created'],
      })

      const task = await Task.findOrFail(taskId)
      assert.equal(task.status, 'waiting')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should return waiting task to processing after question is answered', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents([
      {
        type: 'thinking',
        itemId: 'item-1',
        timestamp: Date.now(),
      },
      {
        type: 'ask_question_created',
        itemId: 'item-2',
        timestamp: Date.now(),
      },
      {
        type: 'ask_question_answered',
        itemId: 'item-2',
        timestamp: Date.now(),
      },
    ])

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Waiting to processing transition',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      const taskId = response.body().taskId

      await waitForInvocationCompletion(invocationId, {
        acceptedEvents: ['ask_question_answered'],
      })

      const task = await Task.findOrFail(taskId)
      assert.equal(task.status, 'processing')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should return 401 when user is not owner of workspace', async ({ client }) => {
    // Create two users
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    await User.create({
      email: 'nonowner@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Test Workspace')

    // Login as non-owner
    const loginResponse = await client.post('/auth/login').json({
      email: 'nonowner@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Try to invoke
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query',
    })

    response.assertStatus(401)
    response.assertBodyContains({
      error: 'Unauthorized',
    })
  })

  test('should allow organization members to invoke agent', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Test Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'member@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Member invoke',
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      const executionInfo = mockAgent.getExecutionInfo()
      assert.isTrue(executionInfo.called)
      assert.equal(executionInfo.context!.organizationId, workspace.organizationId)
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should return 422 when query is missing', async ({ client }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({})

    response.assertStatus(422)
  })

  test('should return 404 when workspace does not exist', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client
      .post('/workspaces/00000000-0000-0000-0000-000000000000/agent/invoke')
      .bearerToken(token)
      .json({
        query: 'Test query',
      })

    response.assertStatus(404)
  })

  test('should resume conversation from parent invocation', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Create parent invocation with agent state
    const parentInvocation = await Invocation.create({
      query: 'Initial query',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: buildAgentState(
        [
          {
            id: 'msg-1',
            type: 'user_message',
            message: 'Initial query',
            timestamp: Date.now(),
          },
        ],
        [{ role: 'user', content: 'Initial query' }]
      ),
    })

    // Setup mock agent
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    // Get auth token
    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Make invoke request with parent invocation_id
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Follow-up query',
      invocation_id: parentInvocation.id,
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId
    const taskId = response.body().taskId
    assert.isString(invocationId)
    assert.isString(taskId)

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    // Verify child invocation was created
    const childInvocation = await Invocation.find(invocationId)
    assert.exists(childInvocation)
    assert.equal(childInvocation!.query, 'Follow-up query')
    assert.equal(childInvocation!.parentInvocationId, parentInvocation.id)

    // Verify loadState was called with parent state
    const loadStateInfo = mockAgent.getLoadStateInfo()
    assert.isTrue(loadStateInfo.called)
    assert.exists(loadStateInfo.state)
    assert.equal(loadStateInfo.state.timeline.length, 1)
    assert.equal(loadStateInfo.state.timeline[0].message, 'Initial query')

    // Verify agent execute was called with correct query
    const executionInfo = mockAgent.getExecutionInfo()
    assert.isTrue(executionInfo.called)
    assert.equal(executionInfo.query, 'Follow-up query')
    assert.equal(executionInfo.context!.aiSessionId, parentInvocation.id)

    const task = await Task.find(taskId)
    assert.exists(task)
    assert.equal(task!.rootInvocationId, parentInvocation.id)
    assert.equal(task!.latestInvocationId, invocationId)
    assert.equal(task!.status, 'complete')

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should edit a non-root message by branching within the same task', async ({ client, assert }) => {
    const user = await User.create({
      email: 'edit-branch@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Edit Branch Workspace')
    const timestamp = Date.now()

    const rootInvocation = await Invocation.create({
      query: 'Original root prompt',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    rootInvocation.agentState = buildAgentState([
      buildUserMessageItem(rootInvocation.id, 'root-user', 'Original root prompt', timestamp),
      buildChatItem('root-chat', 'Original root answer', timestamp + 1),
    ])
    await rootInvocation.save()

    const followUpInvocation = await Invocation.create({
      query: 'Original follow-up prompt',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      parentInvocationId: rootInvocation.id,
      agentState: null,
    })

    followUpInvocation.agentState = buildAgentState([
      buildUserMessageItem(rootInvocation.id, 'root-user', 'Original root prompt', timestamp),
      buildChatItem('root-chat', 'Original root answer', timestamp + 1),
      buildUserMessageItem(followUpInvocation.id, 'follow-up-user', 'Original follow-up prompt', timestamp + 2),
      buildChatItem('follow-up-chat', 'Original follow-up answer', timestamp + 3),
    ])
    await followUpInvocation.save()

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: rootInvocation.id,
      latestInvocationId: followUpInvocation.id,
      status: 'complete',
      title: 'Existing task',
      description: rootInvocation.query,
      modifiedFolders: [],
    })

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Edited follow-up prompt',
        edited_invocation_id: followUpInvocation.id,
      })

      response.assertStatus(200)
      assert.equal(response.body().taskId, task.id)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      const editedInvocation = await Invocation.findOrFail(invocationId)
      assert.equal(editedInvocation.parentInvocationId, rootInvocation.id)

      const loadStateInfo = mockAgent.getLoadStateInfo()
      assert.isTrue(loadStateInfo.called)
      assert.deepEqual(
        loadStateInfo.state.timeline.map((item: { type: string }) => item.type),
        ['user_message', 'chat']
      )
      assert.equal(loadStateInfo.state.timeline[0].invocationId, rootInvocation.id)

      const executionInfo = mockAgent.getExecutionInfo()
      assert.equal(executionInfo.query, 'Edited follow-up prompt')
      assert.equal(executionInfo.context?.aiSessionId, rootInvocation.id)

      await task.refresh()
      assert.equal(task.rootInvocationId, rootInvocation.id)
      assert.equal(task.latestInvocationId, invocationId)
      assert.equal(task.description, rootInvocation.query)
      assert.equal(task.status, 'complete')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should edit the root message without creating a new task', async ({ client, assert }) => {
    const user = await User.create({
      email: 'edit-root@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Edit Root Workspace')
    const timestamp = Date.now()

    const rootInvocation = await Invocation.create({
      query: 'Initial root prompt',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    rootInvocation.agentState = buildAgentState([
      buildUserMessageItem(rootInvocation.id, 'root-user', 'Initial root prompt', timestamp),
      buildChatItem('root-chat', 'Initial answer', timestamp + 1),
    ])
    await rootInvocation.save()

    const childInvocation = await Invocation.create({
      query: 'Later follow-up',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      parentInvocationId: rootInvocation.id,
      agentState: null,
    })

    childInvocation.agentState = buildAgentState([
      buildUserMessageItem(rootInvocation.id, 'root-user', 'Initial root prompt', timestamp),
      buildChatItem('root-chat', 'Initial answer', timestamp + 1),
      buildUserMessageItem(childInvocation.id, 'child-user', 'Later follow-up', timestamp + 2),
      buildChatItem('child-chat', 'Later answer', timestamp + 3),
    ])
    await childInvocation.save()

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: rootInvocation.id,
      latestInvocationId: childInvocation.id,
      status: 'complete',
      title: 'Existing task',
      description: rootInvocation.query,
      modifiedFolders: [],
    })

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Rewritten root prompt',
        edited_invocation_id: rootInvocation.id,
      })

      response.assertStatus(200)
      assert.equal(response.body().taskId, task.id)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      const editedRootInvocation = await Invocation.findOrFail(invocationId)
      assert.isNull(editedRootInvocation.parentInvocationId)

      const loadStateInfo = mockAgent.getLoadStateInfo()
      assert.isFalse(loadStateInfo.called)

      const executionInfo = mockAgent.getExecutionInfo()
      assert.equal(executionInfo.query, 'Rewritten root prompt')
      assert.equal(executionInfo.context?.aiSessionId, invocationId)

      await task.refresh()
      assert.equal(task.rootInvocationId, invocationId)
      assert.equal(task.latestInvocationId, invocationId)
      assert.equal(task.title, 'Existing task')
      assert.equal(task.description, 'Initial root prompt')
      assert.equal(task.status, 'complete')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should inherit onboarding source for follow-up invocations in the same thread', async ({ client, assert }) => {
    const user = await User.create({
      email: 'onboarding-thread@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Onboarding Workspace')

    const parentInvocation = await Invocation.create({
      query: 'Initial onboarding query',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      source: 'onboarding',
      agentState: {
        event: {
          type: 'execution_completed',
          itemId: 'item-1',
          timestamp: Date.now(),
        },
        state: {
          timeline: [
            {
              id: 'msg-1',
              type: 'user_message',
              message: 'Initial onboarding query',
              timestamp: Date.now(),
            },
          ],
          provider: 'anthropic',
          anthropicMessages: [],
        },
      },
    })

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'onboarding-thread@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Follow-up onboarding query',
        invocation_id: parentInvocation.id,
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      await waitForInvocationCompletion(invocationId)

      const childInvocation = await Invocation.findOrFail(invocationId)
      assert.equal(childInvocation.source, 'onboarding')

      const executionInfo = mockAgent.getExecutionInfo()
      assert.equal(executionInfo.context?.invocationSource, 'onboarding')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should return 400 when parent invocation belongs to another user', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Test Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const ownerInvocation = await Invocation.create({
      query: 'Owner query',
      agentState: null,
      userId: owner.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'member@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Follow-up query',
      invocation_id: ownerInvocation.id,
    })

    response.assertStatus(400)
    response.assertBodyContains({
      error: 'Invalid parent invocation id',
    })

    const invocations = await Invocation.query().where('workspace_id', workspace.id)
    assert.lengthOf(invocations, 1)
    assert.equal(invocations[0].id, ownerInvocation.id)
  })

  test('should return 400 when edited invocation belongs to another user', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner-edit@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member-edit@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Edit Validation Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const ownerInvocation = await Invocation.create({
      query: 'Owner query',
      agentState: null,
      userId: owner.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'member-edit@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Edit query',
      edited_invocation_id: ownerInvocation.id,
    })

    response.assertStatus(400)
    response.assertBodyContains({
      error: 'Invalid edited invocation id',
    })

    const invocations = await Invocation.query().where('workspace_id', workspace.id)
    assert.lengthOf(invocations, 1)
    assert.equal(invocations[0].id, ownerInvocation.id)
  })

  test('should reject edits while the target task is running', async ({ client, assert }) => {
    const user = await User.create({
      email: 'running-edit@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Running Edit Workspace')
    const invocation = await Invocation.create({
      query: 'Still running',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: buildAgentState([buildUserMessageItem('placeholder', 'user-message', 'Still running', Date.now())]),
    })

    invocation.agentState = buildAgentState([
      buildUserMessageItem(invocation.id, 'user-message', 'Still running', Date.now()),
    ])
    await invocation.save()

    await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'processing',
      title: 'Running task',
      description: invocation.query,
      modifiedFolders: [],
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Edited while running',
      edited_invocation_id: invocation.id,
    })

    response.assertStatus(409)
    response.assertBodyContains({
      error: 'Cannot edit while this task is running',
    })

    const invocations = await Invocation.query().where('workspace_id', workspace.id)
    assert.lengthOf(invocations, 1)
    assert.equal(invocations[0].id, invocation.id)
  })

  test('should reopen a completed task as processing on follow-up invoke', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const parentInvocation = await Invocation.create({
      query: 'Initial query',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: {
        event: {
          type: 'execution_completed',
          itemId: 'item-1',
          timestamp: Date.now(),
        },
        state: {
          timeline: [],
          provider: 'anthropic',
          anthropicMessages: [],
        },
      },
    })

    const existingTask = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: parentInvocation.id,
      latestInvocationId: parentInvocation.id,
      status: 'complete',
      title: 'Initial query',
      description: 'Initial query',
    })

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    mockAgent.setExecutionDelay(500)
    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: 'test@example.com',
        password: 'password123',
      })

      const token = loginResponse.body().value

      const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
        query: 'Follow-up query',
        invocation_id: parentInvocation.id,
      })

      response.assertStatus(200)

      const invocationId = response.body().invocationId
      const taskId = response.body().taskId

      assert.equal(taskId, existingTask.id)

      const reopenedTask = await Task.findOrFail(taskId)
      assert.equal(reopenedTask.latestInvocationId, invocationId)
      assert.equal(reopenedTask.status, 'processing')

      await waitForInvocationCompletion(invocationId)

      const completedTask = await Task.findOrFail(taskId)
      assert.equal(completedTask.status, 'complete')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('should create top-level invocation when invocation_id is not provided', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Setup mock agent
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    // Get auth token
    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Make invoke request without invocation_id
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'New conversation',
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    // Verify invocation has no parent
    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.isNull(invocation!.parentInvocationId)

    // Verify loadState was NOT called
    const loadStateInfo = mockAgent.getLoadStateInfo()
    assert.isFalse(loadStateInfo.called)

    // Cleanup
    app.container.restore(CanvasAgent)
  })
})
