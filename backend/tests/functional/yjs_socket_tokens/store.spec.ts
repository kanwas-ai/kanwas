import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import env from '#start/env'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, user: User): Promise<string> {
  const response = await client.post('/auth/login').json({
    email: user.email,
    password: 'password123',
  })
  response.assertStatus(200)
  return response.body().value
}

function verifyToken(token: string, expectedWorkspaceId: string): { wid: string; uid: string; mode: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  const [payloadB64, providedSig] = parts
  const expectedSig = createHmac('sha256', env.get('API_SECRET')).update(payloadB64).digest('base64url')
  if (providedSig !== expectedSig) return null

  const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
  if (parsed.wid !== expectedWorkspaceId) return null
  if (parsed.exp <= Math.floor(Date.now() / 1000)) return null

  return { wid: parsed.wid, uid: parsed.uid, mode: parsed.mode }
}

test.group('POST /workspaces/:id/yjs-socket-token', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    const owner = await User.create({ email: 'yjs-token-unauth@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(owner, 'Yjs Token Unauth')

    const response = await client.post(`/workspaces/${workspace.id}/yjs-socket-token`)
    response.assertStatus(401)
  })

  test('rejects authed users who are not members of the workspace organization', async ({ client }) => {
    const owner = await User.create({ email: 'yjs-token-owner@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(owner, 'Yjs Token Permissions')

    const outsider = await User.create({ email: 'yjs-token-outsider@example.com', password: 'password123' })
    const token = await login(client, outsider)

    const response = await client.post(`/workspaces/${workspace.id}/yjs-socket-token`).bearerToken(token)
    response.assertStatus(401)
  })

  test('returns a valid socket token for an authed org member', async ({ client, assert }) => {
    const owner = await User.create({ email: 'yjs-token-member-owner@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(owner, 'Yjs Token Member Workspace')

    const member = await User.create({ email: 'yjs-token-member@example.com', password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const bearer = await login(client, member)
    const response = await client.post(`/workspaces/${workspace.id}/yjs-socket-token`).bearerToken(bearer)

    response.assertStatus(200)
    const body = response.body()
    assert.isString(body.token)
    assert.isString(body.expiresAt)
    assert.match(body.expiresAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

    const claims = verifyToken(body.token, workspace.id)
    assert.isNotNull(claims)
    assert.equal(claims!.wid, workspace.id)
    assert.equal(claims!.uid, member.id)
    assert.equal(claims!.mode, 'editable')
  })
})
