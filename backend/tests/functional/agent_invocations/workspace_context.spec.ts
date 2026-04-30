import { test } from '@japa/runner'
import User from '#models/user'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'
import { CanvasAgent } from '#agent/index'
import app from '@adonisjs/core/services/app'
import Invocation from '#models/invocation'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'

test.group('Agent invocations - workspace context', () => {
  test('should invoke agent on workspace without canvas context', async ({ client, assert }) => {
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

    // Make invoke request without canvas_id
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query',
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId
    assert.isString(invocationId)

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.equal(invocation!.query, 'Test query')
    assert.equal(invocation!.workspaceId, workspace.id)
    assert.isNull(invocation!.canvasId, 'Canvas ID should be null for workspace-level invocation')

    // Verify agent execute was called with correct context
    const executionInfo = mockAgent.getExecutionInfo()
    assert.isTrue(executionInfo.called)
    assert.equal(executionInfo.query, 'Test query')
    assert.exists(executionInfo.context)
    const context = executionInfo.context!
    assert.equal(context.workspaceId, workspace.id)
    assert.isNull(context.canvasId)

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should invoke agent on workspace with canvas context', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const canvasId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

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

    // Make invoke request with canvas_id
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query on canvas',
      canvas_id: canvasId,
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId
    assert.isString(invocationId)

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.equal(invocation!.query, 'Test query on canvas')
    assert.equal(invocation!.workspaceId, workspace.id)
    assert.equal(invocation!.canvasId, canvasId, 'Canvas ID should be set for canvas-scoped invocation')

    // Verify agent execute was called with correct canvas context
    const executionInfo = mockAgent.getExecutionInfo()
    assert.isTrue(executionInfo.called)
    assert.equal(executionInfo.query, 'Test query on canvas')
    assert.exists(executionInfo.context)
    const context = executionInfo.context!
    assert.equal(context.workspaceId, workspace.id)
    assert.equal(context.canvasId, canvasId)

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should persist canvasId in invocation model', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const canvasId = 'a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890'

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

    // Make invoke request
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query',
      canvas_id: canvasId,
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId

    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.equal(invocation!.canvasId, canvasId)
    assert.equal(invocation!.workspaceId, workspace.id)

    // Verify no page relationship exists (old architecture)
    assert.isUndefined((invocation as any).pageId, 'Invocation should not have pageId field')

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should handle null canvas_id gracefully', async ({ client, assert }) => {
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

    // Make invoke request with explicit null canvas_id
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Test query',
      canvas_id: null,
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId

    const invocation = await Invocation.find(invocationId)
    assert.exists(invocation)
    assert.isNull(invocation!.canvasId)

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('should support follow-up queries on same canvas', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const canvasId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

    // Create parent invocation on canvas
    const parentInvocation = await Invocation.create({
      query: 'Initial query',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: canvasId,
      yoloMode: false,
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
              message: 'Initial query',
              timestamp: Date.now(),
            },
          ],
          provider: 'anthropic',
          anthropicMessages: [],
        },
      },
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

    // Make follow-up query on same canvas
    const response = await client.post(`/workspaces/${workspace.id}/agent/invoke`).bearerToken(token).json({
      query: 'Follow-up query',
      canvas_id: canvasId,
      invocation_id: parentInvocation.id,
    })

    response.assertStatus(200)

    const invocationId = response.body().invocationId

    // Wait for agent to process
    await waitForInvocationCompletion(invocationId)

    // Verify child invocation has same canvasId
    const childInvocation = await Invocation.find(invocationId)
    assert.exists(childInvocation)
    assert.equal(childInvocation!.canvasId, canvasId)
    assert.equal(childInvocation!.workspaceId, workspace.id)
    assert.equal(childInvocation!.parentInvocationId, parentInvocation.id)

    // Verify conversation was resumed
    const loadStateInfo = mockAgent.getLoadStateInfo()
    assert.isTrue(loadStateInfo.called)
    assert.exists(loadStateInfo.state)

    // Cleanup
    app.container.restore(CanvasAgent)
  })
})
