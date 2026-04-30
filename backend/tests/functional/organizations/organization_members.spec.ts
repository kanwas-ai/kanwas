import { test } from '@japa/runner'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Organization members API', () => {
  test('lists organization members with names and roles', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({
      email: `members-admin-${suffix}@example.com`,
      name: 'Members Admin',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Members Workspace')

    const member = await User.create({
      email: `members-user-${suffix}@example.com`,
      name: 'Members User',
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')
    const listResponse = await client.get(`/workspaces/${workspace.id}/members`).bearerToken(memberToken)

    listResponse.assertStatus(200)
    const members = listResponse.body()
    assert.lengthOf(members, 2)

    const adminEntry = members.find((entry: { userId: string }) => entry.userId === admin.id)
    assert.exists(adminEntry)
    assert.equal(adminEntry!.role, 'admin')
    assert.equal(adminEntry!.name, 'Members Admin')
    assert.equal(adminEntry!.email, admin.email)

    const memberEntry = members.find((entry: { userId: string }) => entry.userId === member.id)
    assert.exists(memberEntry)
    assert.equal(memberEntry!.role, 'member')
    assert.equal(memberEntry!.name, 'Members User')
    assert.equal(memberEntry!.email, member.email)
  })

  test('allows admin removal and blocks non-admin + self-removal with stable codes', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({
      email: `remove-admin-${suffix}@example.com`,
      name: 'Remove Admin',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Remove Workspace')

    const member = await User.create({
      email: `remove-member-${suffix}@example.com`,
      name: 'Remove Member',
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const adminToken = await login(client, admin.email, 'password123')
    const memberToken = await login(client, member.email, 'password123')

    const nonAdminRemoveResponse = await client
      .delete(`/workspaces/${workspace.id}/members/${admin.id}`)
      .bearerToken(memberToken)

    nonAdminRemoveResponse.assertStatus(403)

    const selfRemoveResponse = await client
      .delete(`/workspaces/${workspace.id}/members/${admin.id}`)
      .bearerToken(adminToken)

    selfRemoveResponse.assertStatus(403)
    assert.equal(selfRemoveResponse.body().code, 'SELF_REMOVAL_FORBIDDEN')

    const removeMemberResponse = await client
      .delete(`/workspaces/${workspace.id}/members/${member.id}`)
      .bearerToken(adminToken)

    removeMemberResponse.assertStatus(200)
    assert.equal(removeMemberResponse.body().removedUserId, member.id)

    const deletedMembership = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('user_id', member.id)
      .first()
    assert.isNull(deletedMembership)
  })
})
