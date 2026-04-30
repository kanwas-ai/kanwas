import { test } from '@japa/runner'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'
import env from '#start/env'

test.group('POST /workspaces/:id/document/updated', () => {
  test('should accept Yjs server document update notifications', async ({ client }) => {
    const user = await User.create({
      email: 'notify@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Notify Workspace')

    const response = await client
      .post(`/workspaces/${workspace.id}/document/updated`)
      .bearerToken(env.get('API_SECRET'))
      .json({ source: 'yjs-server:save' })

    response.assertStatus(200)
  })

  test('should return 404 for non-existent workspace', async ({ client }) => {
    const response = await client
      .post('/workspaces/00000000-0000-0000-0000-000000000000/document/updated')
      .bearerToken(env.get('API_SECRET'))
      .json({ source: 'yjs-server:save' })

    response.assertStatus(404)
  })

  test('should require authentication', async ({ client }) => {
    const user = await User.create({
      email: 'notify-auth@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Notify Auth Workspace')

    const response = await client
      .post(`/workspaces/${workspace.id}/document/updated`)
      .json({ source: 'yjs-server:save' })

    response.assertStatus(401)
  })
})
