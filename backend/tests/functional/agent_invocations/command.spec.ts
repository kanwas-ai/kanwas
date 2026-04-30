import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('Agent invocations - command', () => {
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

    // Create invocation as owner
    const invocation = await Invocation.create({
      query: 'Test query',
      agentState: null,
      userId: owner.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    // Login as non-owner
    const loginResponse = await client.post('/auth/login').json({
      email: 'nonowner@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Try to send command as non-owner
    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'cancel_operation',
    })

    response.assertStatus(401)
    response.assertBodyContains({
      error: 'Unauthorized',
    })
  })

  test('should allow organization members to send commands', async ({ client }) => {
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

    const invocation = await Invocation.create({
      query: 'Test query',
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

    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'cancel_operation',
    })

    response.assertStatus(200)
  })

  test('should return 422 when command payload is invalid', async ({ client }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocation = await Invocation.create({
      query: 'Test query',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    // Send invalid command type
    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'question_answer',
    })

    response.assertStatus(422)
  })

  test('should return 404 when invocation does not exist', async ({ client }) => {
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
      .post('/agent/invocations/00000000-0000-0000-0000-000000000000/command')
      .bearerToken(token)
      .json({
        type: 'cancel_operation',
      })

    response.assertStatus(404)
  })

  test('should accept cancel_operation command without reason', async ({ client }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocation = await Invocation.create({
      query: 'Test query',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'cancel_operation',
    })

    response.assertStatus(200)
  })

  test('should accept cancel_operation command with reason', async ({ client }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocation = await Invocation.create({
      query: 'Test query',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'cancel_operation',
      reason: 'User requested stop',
    })

    response.assertStatus(200)
  })

  test('cancel_operation recovers a started invocation when no agent listener is alive', async ({ client, assert }) => {
    const user = await User.create({
      email: 'dead-agent-stop@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Dead Agent Stop Workspace')

    const invocation = await Invocation.create({
      query: 'This agent died',
      agentState: null,
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentRuntimeOwnerId: 'dead-owner',
      agentStartedAt: DateTime.utc().minus({ minutes: 1 }),
      agentLeaseExpiresAt: DateTime.utc().plus({ minutes: 1 }),
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'processing',
      title: 'Dead agent',
      description: invocation.query,
      modifiedFolders: [],
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.post(`/agent/invocations/${invocation.id}/command`).bearerToken(token).json({
      type: 'cancel_operation',
      reason: 'User clicked stop',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      recovered: true,
    })

    await invocation.refresh()
    await task.refresh()

    assert.equal(task.status, 'error')
    assert.equal(invocation.agentRecoveryReason, 'cancel_no_live_subscriber')
    assert.equal(invocation.agentState?.event.type, 'error')
  })
})
