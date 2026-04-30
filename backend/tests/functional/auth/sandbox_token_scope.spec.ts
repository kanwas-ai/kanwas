import { test } from '@japa/runner'
import User from '#models/user'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('Sandbox-scoped access tokens', () => {
  test('accepted by /auth/me', async ({ client, assert }) => {
    const user = await User.create({ email: 'sandbox-scope-me@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Sandbox Scope Me')

    const scoped = await User.accessTokens.create(user, [`workspace:${workspace.id}:sandbox`], {
      expiresIn: '1 hour',
    })
    const bearer = scoped.value!.release()

    const response = await client.get('/auth/me').bearerToken(bearer)
    response.assertStatus(200)
    assert.equal(response.body().id, user.id)
  })

  test('accepted by workspace endpoints for the bound workspace', async ({ client, assert }) => {
    const user = await User.create({ email: 'sandbox-scope-ok@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Sandbox Scope OK')

    const scoped = await User.accessTokens.create(user, [`workspace:${workspace.id}:sandbox`], {
      expiresIn: '1 hour',
    })
    const bearer = scoped.value!.release()

    const members = await client.get(`/workspaces/${workspace.id}/members`).bearerToken(bearer)
    members.assertStatus(200)
    assert.isArray(members.body())

    const yjsToken = await client.post(`/workspaces/${workspace.id}/yjs-socket-token`).bearerToken(bearer)
    yjsToken.assertStatus(200)
    assert.isString(yjsToken.body().token)
  })

  test('rejected on workspace endpoints for a different workspace the user belongs to', async ({ client }) => {
    const user = await User.create({ email: 'sandbox-scope-cross@example.com', password: 'password123' })
    const workspaceA = await createTestWorkspace(user, 'Sandbox Scope A')
    const workspaceB = await createTestWorkspace(user, 'Sandbox Scope B')

    const scoped = await User.accessTokens.create(user, [`workspace:${workspaceA.id}:sandbox`], {
      expiresIn: '1 hour',
    })
    const bearer = scoped.value!.release()

    const response = await client.get(`/workspaces/${workspaceB.id}/members`).bearerToken(bearer)
    response.assertStatus(403)
  })

  test('rejected on routes outside the sandbox allow-list', async ({ client }) => {
    const user = await User.create({ email: 'sandbox-scope-deny@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Sandbox Scope Deny')

    const scoped = await User.accessTokens.create(user, [`workspace:${workspace.id}:sandbox`], {
      expiresIn: '1 hour',
    })
    const bearer = scoped.value!.release()

    // /workspaces is a listing route not in the sandbox allow-list
    const listing = await client.get('/workspaces').bearerToken(bearer)
    listing.assertStatus(403)

    // Admin-adjacent routes in the main group are also denied
    const skills = await client.get('/skills').bearerToken(bearer)
    skills.assertStatus(403)

    // /workspaces/:id is not in the sandbox allow-list even for the bound workspace
    const show = await client.get(`/workspaces/${workspace.id}`).bearerToken(bearer)
    show.assertStatus(403)
  })
})
