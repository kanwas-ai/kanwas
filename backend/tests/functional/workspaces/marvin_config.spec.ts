import { test } from '@japa/runner'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, user: User): Promise<string> {
  const loginResponse = await client.post('/auth/login').json({
    email: user.email,
    password: 'password123',
  })

  loginResponse.assertStatus(200)
  return loginResponse.body().value
}

test.group('Workspace Marvin config', () => {
  test('returns an empty Marvin config and accepts empty updates', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const user = await User.create({
      email: `marvin-config-${suffix}@example.com`,
      name: 'Marvin Config User',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Marvin Workspace')
    const token = await login(client, user)

    const response = await client.get(`/workspaces/${workspace.id}/marvin-config`).bearerToken(token)

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      config: {},
      defaults: {},
      workspaceId: workspace.id,
    })

    const updateResponse = await client.patch(`/workspaces/${workspace.id}/marvin-config`).bearerToken(token).json({})

    updateResponse.assertStatus(200)
    assert.deepEqual(updateResponse.body(), {
      config: {},
    })
  })

  test('rejects unknown Marvin config keys', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const user = await User.create({
      email: `marvin-config-invalid-${suffix}@example.com`,
      name: 'Marvin Config Invalid User',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Marvin Workspace Invalid')
    const token = await login(client, user)

    const response = await client
      .patch(`/workspaces/${workspace.id}/marvin-config`)
      .bearerToken(token)
      .json({ enableSystemEdits: true })

    response.assertStatus(422)
    assert.equal(response.body().error, 'No Marvin settings are currently available')
    assert.deepEqual(response.body().unknownKeys, ['enableSystemEdits'])
  })
})
