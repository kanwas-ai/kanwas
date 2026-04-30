import { test } from '@japa/runner'
import User from '#models/user'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'
import { CanvasAgent } from '#agent/index'
import app from '@adonisjs/core/services/app'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'

test.group('Agent invocations - cancel', () => {
  test('cancel_operation should abort agent execution', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Setup mock agent with execution delay
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    mockAgent.setExecutionDelay(500) // Wait 500ms during execution

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    // Get auth token
    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    // Start agent execution
    const invokeResponse = await client
      .post(`/workspaces/${workspace.id}/agent/invoke`)
      .bearerToken(token)
      .json({ query: 'Test query' })

    invokeResponse.assertStatus(200)
    const invocationId = invokeResponse.body().invocationId

    // Wait for agent to start executing
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Send cancel command while agent is executing
    const cancelResponse = await client.post(`/agent/invocations/${invocationId}/command`).bearerToken(token).json({
      type: 'cancel_operation',
      reason: 'User cancelled',
    })

    cancelResponse.assertStatus(200)

    await waitForInvocationCompletion(invocationId)

    // Verify abort was called on agent state
    assert.isTrue(mockAgent.getState().isAborted)

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('cancel_operation without reason should still abort', async ({ client, assert }) => {
    // Create user and workspace
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Test Workspace')

    // Setup mock agent with execution delay
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    mockAgent.setExecutionDelay(500) // Wait 500ms during execution

    // Swap CanvasAgent with mock
    app.container.swap(CanvasAgent, () => mockAgent)

    // Get auth token
    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    // Start agent execution
    const invokeResponse = await client
      .post(`/workspaces/${workspace.id}/agent/invoke`)
      .bearerToken(token)
      .json({ query: 'Test query' })

    invokeResponse.assertStatus(200)
    const invocationId = invokeResponse.body().invocationId

    // Wait for agent to start executing
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Send cancel command without reason
    const cancelResponse = await client.post(`/agent/invocations/${invocationId}/command`).bearerToken(token).json({
      type: 'cancel_operation',
    })

    cancelResponse.assertStatus(200)

    await waitForInvocationCompletion(invocationId)

    // Verify abort was called on agent state
    assert.isTrue(mockAgent.getState().isAborted)

    // Cleanup
    app.container.restore(CanvasAgent)
  })

  test('cancel_operation during flow resolution aborts before execute starts', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    mockAgent.setResolveFlowDelay(500)

    app.container.swap(CanvasAgent, () => mockAgent)

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const invokeResponse = await client
      .post(`/workspaces/${workspace.id}/agent/invoke`)
      .bearerToken(token)
      .json({ query: 'Test query' })

    invokeResponse.assertStatus(200)
    const invocationId = invokeResponse.body().invocationId

    await new Promise((resolve) => setTimeout(resolve, 50))

    const cancelResponse = await client.post(`/agent/invocations/${invocationId}/command`).bearerToken(token).json({
      type: 'cancel_operation',
      reason: 'Cancel while resolving flow',
    })

    cancelResponse.assertStatus(200)

    await waitForInvocationCompletion(invocationId)

    const executionInfo = mockAgent.getExecutionInfo()
    assert.isTrue(executionInfo.called)
    assert.isTrue(executionInfo.abortedAtExecuteStart)
    assert.isTrue(mockAgent.getState().isAborted)

    app.container.restore(CanvasAgent)
  })
})
