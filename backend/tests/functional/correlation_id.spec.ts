import { test } from '@japa/runner'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'
import { CanvasAgent } from '#agent/index'
import app from '@adonisjs/core/services/app'
import emitter from '@adonisjs/core/services/emitter'
import AgentInvoked from '#events/agent_invoked'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'

test.group('Correlation ID Flow', () => {
  test('middleware sets correlationId on response header', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test')

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    // Send request with x-correlation-id header
    const testCorrelationId = 'test-frontend-correlation-id-12345'

    const response = await client
      .get(`/workspaces/${workspace.id}`)
      .bearerToken(token)
      .header('x-correlation-id', testCorrelationId)

    // Response should echo the correlation ID back
    assert.equal(response.header('x-correlation-id'), testCorrelationId)
  })

  test('AgentInvoked event receives correlation ID from request', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test')

    // Setup mock agent
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    // Capture the event
    let capturedEvent: AgentInvoked | null = null
    const unsubscribe = emitter.on(AgentInvoked, (event) => {
      capturedEvent = event
    })

    const testCorrelationId = 'frontend-correlation-id-should-match'

    const response = await client
      .post(`/workspaces/${workspace.id}/agent/invoke`)
      .bearerToken(token)
      .header('x-correlation-id', testCorrelationId)
      .json({ query: 'Test query' })

    const invocationId = response.body().invocationId
    await waitForInvocationCompletion(invocationId)

    // THE KEY ASSERTION - does the event have the frontend's correlation ID?
    assert.exists(capturedEvent, 'Event should have been captured')
    assert.equal(
      capturedEvent!.context.correlationId,
      testCorrelationId,
      `Expected correlation ID ${testCorrelationId} but got ${capturedEvent!.context.correlationId}`
    )

    unsubscribe()
    app.container.restore(CanvasAgent)
  })

  test('agent context receives correlation ID from request', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test')

    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())
    app.container.swap(CanvasAgent, () => mockAgent)

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })
    const token = loginResponse.body().value

    const testCorrelationId = 'unique-test-id-abc123'

    const response = await client
      .post(`/workspaces/${workspace.id}/agent/invoke`)
      .bearerToken(token)
      .header('x-correlation-id', testCorrelationId)
      .json({ query: 'Test' })

    const invocationId = response.body().invocationId
    await waitForInvocationCompletion(invocationId)

    // Check what correlation ID the agent received
    const executionInfo = mockAgent.getExecutionInfo()
    assert.exists(executionInfo.context, 'Agent should have received context')
    assert.equal(
      executionInfo.context!.correlationId,
      testCorrelationId,
      `Agent context should have frontend correlation ID, but got ${executionInfo.context?.correlationId}`
    )

    app.container.restore(CanvasAgent)
  })
})
