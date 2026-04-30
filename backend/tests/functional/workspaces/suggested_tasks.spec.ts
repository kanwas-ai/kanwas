import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import WorkspaceSuggestedTaskSet from '#models/workspace_suggested_task_set'
import { createTestWorkspace } from '#tests/helpers/workspace'
import {
  WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS,
  WORKSPACE_SUGGESTED_TASK_STALE_ERROR,
} from '#services/workspace_suggested_task_service'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Workspace suggested tasks API', () => {
  test('returns a safe default for newly created workspaces without seeded suggestions', async ({ client, assert }) => {
    const user = await User.create({ email: 'manual-suggested@example.com', password: 'password123' })
    const token = await login(client, user.email, 'password123')

    const createResponse = await client
      .post('/workspaces')
      .bearerToken(token)
      .json({ name: 'Manual Suggested Workspace' })
    createResponse.assertStatus(200)

    const workspaceId = createResponse.body().id
    const row = await WorkspaceSuggestedTaskSet.findBy('workspaceId', workspaceId)
    assert.isNull(row)

    const stateResponse = await client.get(`/workspaces/${workspaceId}/suggested-tasks`).bearerToken(token)
    stateResponse.assertStatus(200)
    assert.isFalse(stateResponse.body().isLoading)
    assert.deepEqual(stateResponse.body().tasks, [])
    assert.isNull(stateResponse.body().generatedAt)
    assert.isNull(stateResponse.body().error)
  })

  test('returns a safe default when no suggested-task row exists', async ({ client, assert }) => {
    const user = await User.create({ email: 'default-suggested@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Existing Workspace')
    const token = await login(client, user.email, 'password123')

    const response = await client.get(`/workspaces/${workspace.id}/suggested-tasks`).bearerToken(token)
    response.assertStatus(200)

    assert.isFalse(response.body().isLoading)
    assert.deepEqual(response.body().tasks, [])
    assert.isNull(response.body().generatedAt)
    assert.isNull(response.body().error)
  })

  test('surfaces stale loading rows as timed out errors', async ({ client, assert }) => {
    const user = await User.create({ email: 'stale-suggested@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Stale Suggested Workspace')
    const token = await login(client, user.email, 'password123')

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: true,
      tasks: [],
      errorMessage: null,
      generatedAt: null,
      loadingStartedAt: DateTime.utc().minus({ milliseconds: WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS + 1_000 }),
    })

    const response = await client.get(`/workspaces/${workspace.id}/suggested-tasks`).bearerToken(token)
    response.assertStatus(200)

    assert.isFalse(response.body().isLoading)
    assert.deepEqual(response.body().tasks, [])
    assert.isNull(response.body().generatedAt)
    assert.equal(response.body().error, WORKSPACE_SUGGESTED_TASK_STALE_ERROR)
  })

  test('deletes suggestions idempotently', async ({ client, assert }) => {
    const user = await User.create({ email: 'delete-suggested@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Delete Suggested Workspace')
    const token = await login(client, user.email, 'password123')

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [
        {
          id: 'first-suggestion',
          emoji: '🧭',
          headline: 'First suggestion',
          description: 'Start with the first suggestion.',
          prompt: 'Do the first suggestion.',
        },
        {
          id: 'second-suggestion',
          emoji: '📝',
          headline: 'Second suggestion',
          description: 'Start with the second suggestion.',
          prompt: 'Do the second suggestion.',
        },
      ],
      errorMessage: null,
      generatedAt: DateTime.utc(),
      loadingStartedAt: null,
    })

    const firstDelete = await client
      .delete(`/workspaces/${workspace.id}/suggested-tasks/first-suggestion`)
      .bearerToken(token)
    firstDelete.assertStatus(200)
    assert.deepEqual(
      firstDelete.body().tasks.map((task: { id: string }) => task.id),
      ['second-suggestion']
    )

    const secondDelete = await client
      .delete(`/workspaces/${workspace.id}/suggested-tasks/first-suggestion`)
      .bearerToken(token)
    secondDelete.assertStatus(200)
    assert.deepEqual(
      secondDelete.body().tasks.map((task: { id: string }) => task.id),
      ['second-suggestion']
    )
  })
})
