import { test } from '@japa/runner'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Organization member permissions', () => {
  test('allows members to update and duplicate workspaces', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const admin = await User.create({
      email: `member-permissions-admin-${suffix}@example.com`,
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Member Editable Workspace')

    const member = await User.create({
      email: `member-permissions-member-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const updateResponse = await client
      .patch(`/workspaces/${workspace.id}`)
      .bearerToken(memberToken)
      .json({ name: 'Renamed by Member' })

    updateResponse.assertStatus(200)
    assert.equal(updateResponse.body().name, 'Renamed by Member')

    const duplicateResponse = await client
      .post(`/workspaces/${workspace.id}/duplicate`)
      .bearerToken(memberToken)
      .json({})

    duplicateResponse.assertStatus(200)
    assert.equal(duplicateResponse.body().name, 'Renamed by Member (Copy)')
    assert.notEqual(duplicateResponse.body().id, workspace.id)
  })
})
