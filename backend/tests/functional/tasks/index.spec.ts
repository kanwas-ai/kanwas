import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('Tasks - index', () => {
  test('should list only current user tasks within the workspace', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Shared Workspace')
    const otherWorkspace = await createTestWorkspace(owner, 'Other Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const ownerInvocation = await Invocation.create({
      query: 'Owner task query',
      userId: owner.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const memberInvocation = await Invocation.create({
      query: 'Member task query',
      userId: member.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const otherWorkspaceInvocation = await Invocation.create({
      query: 'Other workspace query',
      userId: owner.id,
      workspaceId: otherWorkspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const ownerTask = await Task.create({
      workspaceId: workspace.id,
      userId: owner.id,
      rootInvocationId: ownerInvocation.id,
      latestInvocationId: ownerInvocation.id,
      status: 'processing',
      title: 'Owner task',
      description: 'Owner task query',
      modifiedFolders: ['plans/roadmap'],
    })

    await Task.create({
      workspaceId: workspace.id,
      userId: member.id,
      rootInvocationId: memberInvocation.id,
      latestInvocationId: memberInvocation.id,
      status: 'complete',
      title: 'Member task',
      description: 'Member task query',
    })

    await Task.create({
      workspaceId: otherWorkspace.id,
      userId: owner.id,
      rootInvocationId: otherWorkspaceInvocation.id,
      latestInvocationId: otherWorkspaceInvocation.id,
      status: 'complete',
      title: 'Other task',
      description: 'Other workspace query',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'owner@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token)

    response.assertStatus(200)

    const tasks = response.body().tasks
    assert.lengthOf(tasks, 1)
    assert.equal(tasks[0].taskId, ownerTask.id)
    assert.equal(tasks[0].title, 'Owner task')
    assert.equal(tasks[0].description, 'Owner task query')
    assert.deepEqual(tasks[0].modifiedFolders, ['plans/roadmap'])
  })

  test('should support cursor pagination with stable ordering', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocationA = await Invocation.create({
      query: 'A',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const invocationB = await Invocation.create({
      query: 'B',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const invocationC = await Invocation.create({
      query: 'C',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const taskA = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationA.id,
      latestInvocationId: invocationA.id,
      status: 'complete',
      title: 'Task A',
      description: 'A',
    })

    const taskB = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationB.id,
      latestInvocationId: invocationB.id,
      status: 'processing',
      title: 'Task B',
      description: 'B',
    })

    const taskC = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationC.id,
      latestInvocationId: invocationC.id,
      status: 'initiated',
      title: 'Task C',
      description: 'C',
    })

    const now = DateTime.now()
    await Task.query()
      .where('id', taskA.id)
      .update({ updated_at: now.minus({ minutes: 3 }).toISO() })
    await Task.query()
      .where('id', taskB.id)
      .update({ updated_at: now.minus({ minutes: 2 }).toISO() })
    await Task.query()
      .where('id', taskC.id)
      .update({ updated_at: now.minus({ minutes: 1 }).toISO() })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const firstPage = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token).qs({ limit: 2 })

    firstPage.assertStatus(200)
    assert.lengthOf(firstPage.body().tasks, 2)
    assert.equal(firstPage.body().tasks[0].taskId, taskC.id)
    assert.equal(firstPage.body().tasks[1].taskId, taskB.id)
    assert.isString(firstPage.body().nextCursor)

    const secondPage = await client
      .get(`/workspaces/${workspace.id}/tasks`)
      .bearerToken(token)
      .qs({ limit: 2, cursor: firstPage.body().nextCursor })

    secondPage.assertStatus(200)
    assert.lengthOf(secondPage.body().tasks, 1)
    assert.equal(secondPage.body().tasks[0].taskId, taskA.id)
    assert.isNull(secondPage.body().nextCursor)
  })

  test('should support status filtering', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocationA = await Invocation.create({
      query: 'A',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const invocationB = await Invocation.create({
      query: 'B',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationA.id,
      latestInvocationId: invocationA.id,
      status: 'processing',
      title: 'Task A',
      description: 'A',
    })

    const completeTask = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationB.id,
      latestInvocationId: invocationB.id,
      status: 'complete',
      title: 'Task B',
      description: 'B',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token).qs({ status: 'complete' })

    response.assertStatus(200)
    assert.lengthOf(response.body().tasks, 1)
    assert.equal(response.body().tasks[0].taskId, completeTask.id)
  })

  test('should support waiting status filtering', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocationA = await Invocation.create({
      query: 'A',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const invocationB = await Invocation.create({
      query: 'B',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const waitingTask = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationA.id,
      latestInvocationId: invocationA.id,
      status: 'waiting',
      title: 'Task A',
      description: 'A',
    })

    await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocationB.id,
      latestInvocationId: invocationB.id,
      status: 'processing',
      title: 'Task B',
      description: 'B',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const response = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token).qs({ status: 'waiting' })

    response.assertStatus(200)
    assert.lengthOf(response.body().tasks, 1)
    assert.equal(response.body().tasks[0].taskId, waitingTask.id)
  })

  test('should archive task and exclude it from listings', async ({ client, assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Test Workspace')

    const invocation = await Invocation.create({
      query: 'Archive me',
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
      status: 'processing',
      title: 'Task to archive',
      description: 'Archive me',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'test@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const archiveResponse = await client.post(`/workspaces/${workspace.id}/tasks/${task.id}/archive`).bearerToken(token)

    archiveResponse.assertStatus(200)
    assert.equal(archiveResponse.body().taskId, task.id)
    assert.isString(archiveResponse.body().archivedAt)

    const archivedTask = await Task.findOrFail(task.id)
    assert.isNotNull(archivedTask.archivedAt)

    const listResponse = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token)

    listResponse.assertStatus(200)
    assert.lengthOf(listResponse.body().tasks, 0)
  })

  test('should return 404 when archiving another user task', async ({ client, assert }) => {
    const owner = await User.create({
      email: 'owner@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(owner, 'Shared Workspace')

    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const ownerInvocation = await Invocation.create({
      query: 'Owner task query',
      userId: owner.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const ownerTask = await Task.create({
      workspaceId: workspace.id,
      userId: owner.id,
      rootInvocationId: ownerInvocation.id,
      latestInvocationId: ownerInvocation.id,
      status: 'processing',
      title: 'Owner task',
      description: 'Owner task query',
    })

    const loginResponse = await client.post('/auth/login').json({
      email: 'member@example.com',
      password: 'password123',
    })

    const token = loginResponse.body().value

    const archiveResponse = await client
      .post(`/workspaces/${workspace.id}/tasks/${ownerTask.id}/archive`)
      .bearerToken(token)

    archiveResponse.assertStatus(404)

    const unchangedTask = await Task.findOrFail(ownerTask.id)
    assert.isNull(unchangedTask.archivedAt)
  })

  test('should return 422 for invalid status filter', async ({ client }) => {
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

    const response = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token).qs({ status: 'unknown' })

    response.assertStatus(422)
  })

  test('should return 422 for invalid limit filter', async ({ client }) => {
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

    const response = await client.get(`/workspaces/${workspace.id}/tasks`).bearerToken(token).qs({ limit: 'abc' })

    response.assertStatus(422)
  })

  test('should return 400 for invalid cursor filter', async ({ client }) => {
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

    const response = await client
      .get(`/workspaces/${workspace.id}/tasks`)
      .bearerToken(token)
      .qs({ cursor: 'not-a-valid-cursor' })

    response.assertStatus(400)
    response.assertBodyContains({
      error: 'Invalid cursor',
    })
  })
})
