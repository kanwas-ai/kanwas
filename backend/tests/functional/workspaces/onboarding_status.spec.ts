import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import Workspace from '#models/workspace'
import Invocation from '#models/invocation'
import { CanvasAgent } from '#agent/index'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { waitForInvocationCompletion } from '#tests/helpers/invocation'
import { MockCanvasAgent, createMockAgentEvents } from '#tests/mocks/canvas_agent'

async function waitForWorkspaceOnboardingStatus(workspaceId: string, status: string) {
  const deadline = Date.now() + 5000

  while (Date.now() < deadline) {
    const workspace = await Workspace.findOrFail(workspaceId)
    if (workspace.onboardingStatus === status) {
      return workspace
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for workspace ${workspaceId} onboarding status ${status}`)
}

test.group('Workspace onboarding status', () => {
  test('creates normal workspaces with onboarding not started', async ({ client, assert }) => {
    const user = await User.create({ email: 'workspace-onboarding-create@example.com', password: 'password123' })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const response = await client
      .post('/workspaces')
      .bearerToken(loginResponse.body().value)
      .json({ name: 'Onboarding Status Workspace' })

    response.assertStatus(200)
    assert.equal(response.body().onboardingStatus, 'not_started')

    const workspace = await Workspace.findOrFail(response.body().id)
    assert.equal(workspace.onboardingStatus, 'not_started')
  })

  test('duplicates workspaces with onboarding completed', async ({ client, assert }) => {
    const user = await User.create({ email: 'workspace-onboarding-duplicate@example.com', password: 'password123' })
    const sourceWorkspace = await createTestWorkspace(user, 'Onboarding Source Workspace')

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const response = await client
      .post(`/workspaces/${sourceWorkspace.id}/duplicate`)
      .bearerToken(loginResponse.body().value)

    response.assertStatus(200)
    assert.equal(response.body().onboardingStatus, 'completed')

    const duplicatedWorkspace = await Workspace.findOrFail(response.body().id)
    assert.equal(duplicatedWorkspace.onboardingStatus, 'completed')
  })

  test('starts onboarding from workspace status and completes it on invocation completion', async ({
    client,
    assert,
  }) => {
    const user = await User.create({ email: 'workspace-onboarding-start@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Onboarding Start Workspace')
    const mockAgent = new MockCanvasAgent()
    mockAgent.setMockEvents(createMockAgentEvents())

    app.container.swap(CanvasAgent, () => mockAgent)

    try {
      const loginResponse = await client.post('/auth/login').json({
        email: user.email,
        password: 'password123',
      })

      const response = await client
        .post(`/workspaces/${workspace.id}/onboarding/start`)
        .bearerToken(loginResponse.body().value)

      response.assertStatus(200)
      assert.equal(response.body().onboardingStatus, 'in_progress')

      const invocation = await Invocation.findOrFail(response.body().invocationId)
      assert.equal(invocation.source, 'onboarding')
      assert.isNull(invocation.parentInvocationId)

      await workspace.refresh()
      assert.equal(workspace.onboardingStatus, 'in_progress')

      await waitForInvocationCompletion(invocation.id)
      const completedWorkspace = await waitForWorkspaceOnboardingStatus(workspace.id, 'completed')
      assert.equal(completedWorkspace.onboardingStatus, 'completed')

      const executionInfo = mockAgent.getExecutionInfo()
      assert.equal(executionInfo.context?.invocationSource, 'onboarding')
      assert.equal(executionInfo.query, 'Please onboard me into this workspace. Use onboarding skill')
    } finally {
      app.container.restore(CanvasAgent)
    }
  })

  test('does not start onboarding for completed workspaces', async ({ client, assert }) => {
    const user = await User.create({ email: 'workspace-onboarding-completed@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Completed Onboarding Workspace')
    workspace.onboardingStatus = 'completed'
    await workspace.save()

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const response = await client
      .post(`/workspaces/${workspace.id}/onboarding/start`)
      .bearerToken(loginResponse.body().value)

    response.assertStatus(409)
    assert.equal(response.body().onboardingStatus, 'completed')
  })
})
