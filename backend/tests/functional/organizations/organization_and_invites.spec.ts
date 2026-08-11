import { test } from '@japa/runner'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvite from '#models/organization_invite'
import Workspace from '#models/workspace'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Organization settings + invites', () => {
  test('enforces admin/member auth matrix for org settings', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `org-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Org Workspace')

    const member = await User.create({ email: `org-member-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const outsider = await User.create({ email: `org-outsider-${suffix}@example.com`, password: 'password123' })

    const adminToken = await login(client, admin.email, 'password123')
    const memberToken = await login(client, member.email, 'password123')
    const outsiderToken = await login(client, outsider.email, 'password123')

    const adminShow = await client.get(`/workspaces/${workspace.id}/organization`).bearerToken(adminToken)
    adminShow.assertStatus(200)
    assert.equal(adminShow.body().role, 'admin')

    const memberShow = await client.get(`/workspaces/${workspace.id}/organization`).bearerToken(memberToken)
    memberShow.assertStatus(200)
    assert.equal(memberShow.body().role, 'member')

    const outsiderShow = await client.get(`/workspaces/${workspace.id}/organization`).bearerToken(outsiderToken)
    outsiderShow.assertStatus(401)

    const memberUpdate = await client
      .patch(`/workspaces/${workspace.id}/organization`)
      .bearerToken(memberToken)
      .json({ name: 'Should Not Work' })
    memberUpdate.assertStatus(403)

    const adminUpdate = await client
      .patch(`/workspaces/${workspace.id}/organization`)
      .bearerToken(adminToken)
      .json({ name: 'Renamed Organization' })
    adminUpdate.assertStatus(200)
    assert.equal(adminUpdate.body().name, 'Renamed Organization')
    assert.equal(adminUpdate.body().role, 'admin')
  })

  test('supports invite lifecycle with single-use token consumption', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `invite-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Invite Org')
    const adminToken = await login(client, admin.email, 'password123')

    const member = await User.create({ email: `invite-member-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })
    const memberToken = await login(client, member.email, 'password123')

    const invitedUser = await User.create({ email: `invited-user-${suffix}@example.com`, password: 'password123' })
    const invitedUserToken = await login(client, invitedUser.email, 'password123')

    const createInviteResponse = await client
      .post(`/workspaces/${workspace.id}/invites`)
      .bearerToken(adminToken)
      .json({ inviteeName: 'Invited Teammate' })
    createInviteResponse.assertStatus(200)

    const createInviteWithoutNameResponse = await client
      .post(`/workspaces/${workspace.id}/invites`)
      .bearerToken(adminToken)
      .json({})
    createInviteWithoutNameResponse.assertStatus(200)

    assert.isString(createInviteResponse.body().token)
    assert.equal(createInviteResponse.body().invite.inviteeName, 'Invited Teammate')
    assert.equal(createInviteResponse.body().invite.roleToGrant, 'member')

    const organization = await Organization.findOrFail(workspace.organizationId)

    const previewInviteResponse = await client.get(`/invites/${createInviteResponse.body().token}/preview`)
    previewInviteResponse.assertStatus(200)
    assert.equal(previewInviteResponse.body().organizationName, organization.name)
    assert.equal(previewInviteResponse.body().inviteeName, 'Invited Teammate')

    const inviteExpiresAt = new Date(createInviteResponse.body().invite.expiresAt).getTime()
    const now = Date.now()
    const twentyNineDaysMs = 29 * 24 * 60 * 60 * 1000
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000
    assert.isAtLeast(inviteExpiresAt - now, twentyNineDaysMs)
    assert.isAtMost(inviteExpiresAt - now, thirtyOneDaysMs)

    const memberCreateInvite = await client
      .post(`/workspaces/${workspace.id}/invites`)
      .bearerToken(memberToken)
      .json({ inviteeName: 'No Access User' })
    memberCreateInvite.assertStatus(403)

    const memberListInvites = await client.get(`/workspaces/${workspace.id}/invites`).bearerToken(memberToken)
    memberListInvites.assertStatus(403)

    const adminListInvites = await client.get(`/workspaces/${workspace.id}/invites`).bearerToken(adminToken)
    adminListInvites.assertStatus(200)
    assert.lengthOf(adminListInvites.body(), 2)
    assert.notProperty(adminListInvites.body()[0], 'token')

    const acceptInvite = await client
      .post('/invites/accept')
      .bearerToken(invitedUserToken)
      .json({ token: createInviteResponse.body().token })
    acceptInvite.assertStatus(200)
    assert.equal(acceptInvite.body().organizationId, workspace.organizationId)
    assert.equal(acceptInvite.body().workspaceId, workspace.id)

    const invitedMembership = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('user_id', invitedUser.id)
      .first()
    assert.exists(invitedMembership)
    assert.equal(invitedMembership!.role, 'member')

    const reusedInvite = await client
      .post('/invites/accept')
      .bearerToken(memberToken)
      .json({ token: createInviteResponse.body().token })
    reusedInvite.assertStatus(400)

    const consumedInvitePreviewResponse = await client.get(`/invites/${createInviteResponse.body().token}/preview`)
    consumedInvitePreviewResponse.assertStatus(400)

    const secondInviteResponse = await client
      .post(`/workspaces/${workspace.id}/invites`)
      .bearerToken(adminToken)
      .json({ inviteeName: 'Revoked Invitee' })
    secondInviteResponse.assertStatus(200)

    const revokeInviteResponse = await client
      .post(`/workspaces/${workspace.id}/invites/${secondInviteResponse.body().invite.id}/revoke`)
      .bearerToken(adminToken)
      .json({})
    revokeInviteResponse.assertStatus(200)
    assert.exists(revokeInviteResponse.body().invite.revokedAt)

    const revokedInviteAccept = await client
      .post('/invites/accept')
      .bearerToken(memberToken)
      .json({ token: secondInviteResponse.body().token })
    revokedInviteAccept.assertStatus(400)

    const storedInvite = await OrganizationInvite.findOrFail(createInviteResponse.body().invite.id)
    assert.exists(storedInvite.consumedAt)
  })

  test('does not consume invite when accepter is already an org member', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `invite-idempotent-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Invite Idempotent Org')
    const adminToken = await login(client, admin.email, 'password123')

    const existingMember = await User.create({
      email: `invite-idempotent-member-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: existingMember.id,
      role: 'member',
    })
    const existingMemberToken = await login(client, existingMember.email, 'password123')

    const targetInvitee = await User.create({
      email: `invite-idempotent-target-${suffix}@example.com`,
      password: 'password123',
    })
    const targetInviteeToken = await login(client, targetInvitee.email, 'password123')

    const createInviteResponse = await client
      .post(`/workspaces/${workspace.id}/invites`)
      .bearerToken(adminToken)
      .json({ inviteeName: 'Target Invitee' })
    createInviteResponse.assertStatus(200)

    const alreadyMemberAcceptResponse = await client
      .post('/invites/accept')
      .bearerToken(existingMemberToken)
      .json({ token: createInviteResponse.body().token })
    alreadyMemberAcceptResponse.assertStatus(400)

    const previewAfterAlreadyMemberAccept = await client.get(`/invites/${createInviteResponse.body().token}/preview`)
    previewAfterAlreadyMemberAccept.assertStatus(200)

    const successfulAccept = await client
      .post('/invites/accept')
      .bearerToken(targetInviteeToken)
      .json({ token: createInviteResponse.body().token })
    successfulAccept.assertStatus(200)
    assert.equal(successfulAccept.body().workspaceId, workspace.id)
  })

  test('creates workspace in organization resolved from provided workspace context', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const primaryAdmin = await User.create({
      email: `create-scope-primary-${suffix}@example.com`,
      password: 'password123',
    })
    const primaryWorkspace = await createTestWorkspace(primaryAdmin, 'Primary Workspace')

    const secondaryAdmin = await User.create({
      email: `create-scope-secondary-${suffix}@example.com`,
      password: 'password123',
    })
    const secondaryWorkspace = await createTestWorkspace(secondaryAdmin, 'Secondary Workspace')

    await OrganizationMembership.create({
      organizationId: secondaryWorkspace.organizationId,
      userId: primaryAdmin.id,
      role: 'admin',
    })

    const primaryAdminToken = await login(client, primaryAdmin.email, 'password123')

    const createWorkspaceResponse = await client.post('/workspaces').bearerToken(primaryAdminToken).json({
      name: 'Scoped Workspace',
      workspaceId: secondaryWorkspace.id,
    })

    createWorkspaceResponse.assertStatus(200)

    const createdWorkspace = await Workspace.findOrFail(createWorkspaceResponse.body().id)
    assert.equal(createdWorkspace.organizationId, secondaryWorkspace.organizationId)
    assert.notEqual(createdWorkspace.organizationId, primaryWorkspace.organizationId)
  })

  test('allows organization members to create workspace in their organization', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `member-create-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Org Workspace')

    const member = await User.create({ email: `member-create-user-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const createWorkspaceResponse = await client.post('/workspaces').bearerToken(memberToken).json({
      name: 'Member Created Workspace',
      workspaceId: workspace.id,
    })

    createWorkspaceResponse.assertStatus(200)

    const createdWorkspace = await Workspace.findOrFail(createWorkspaceResponse.body().id)
    assert.equal(createdWorkspace.organizationId, workspace.organizationId)
  })

  test('allows member-only users to create workspace without explicit workspace context', async ({
    client,
    assert,
  }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `member-default-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Org Workspace')

    const member = await User.create({ email: `member-default-user-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const createWorkspaceResponse = await client.post('/workspaces').bearerToken(memberToken).json({
      name: 'Member Default Workspace',
    })

    createWorkspaceResponse.assertStatus(200)

    const createdWorkspace = await Workspace.findOrFail(createWorkspaceResponse.body().id)
    assert.equal(createdWorkspace.organizationId, workspace.organizationId)
  })

  test('requires workspace context when member belongs to multiple organizations', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)

    const adminA = await User.create({ email: `member-multi-admin-a-${suffix}@example.com`, password: 'password123' })
    const workspaceA = await createTestWorkspace(adminA, 'Org A Workspace')

    const adminB = await User.create({ email: `member-multi-admin-b-${suffix}@example.com`, password: 'password123' })
    const workspaceB = await createTestWorkspace(adminB, 'Org B Workspace')

    const member = await User.create({ email: `member-multi-user-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspaceA.organizationId,
      userId: member.id,
      role: 'member',
    })
    await OrganizationMembership.create({
      organizationId: workspaceB.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const createWorkspaceResponse = await client.post('/workspaces').bearerToken(memberToken).json({
      name: 'Ambiguous Member Workspace',
    })

    createWorkspaceResponse.assertStatus(400)
    assert.equal(
      createWorkspaceResponse.body().error,
      'Workspace context is required when user belongs to multiple organizations'
    )
  })

  test('allows organization members to delete non-last workspace', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `member-delete-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Org Workspace')

    const member = await User.create({ email: `member-delete-user-${suffix}@example.com`, password: 'password123' })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const adminToken = await login(client, admin.email, 'password123')
    const memberToken = await login(client, member.email, 'password123')

    const createWorkspaceResponse = await client.post('/workspaces').bearerToken(adminToken).json({
      name: 'Workspace To Delete',
      workspaceId: workspace.id,
    })
    createWorkspaceResponse.assertStatus(200)

    const workspaceToDeleteId = createWorkspaceResponse.body().id

    const deleteResponse = await client.delete(`/workspaces/${workspaceToDeleteId}`).bearerToken(memberToken)
    deleteResponse.assertStatus(200)

    const deletedWorkspace = await Workspace.find(workspaceToDeleteId)
    assert.isNull(deletedWorkspace)
  })

  test('prevents organization members from deleting the last workspace', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({
      email: `member-last-delete-admin-${suffix}@example.com`,
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Only Workspace')

    const member = await User.create({
      email: `member-last-delete-user-${suffix}@example.com`,
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: member.id,
      role: 'member',
    })

    const memberToken = await login(client, member.email, 'password123')

    const deleteResponse = await client.delete(`/workspaces/${workspace.id}`).bearerToken(memberToken)
    deleteResponse.assertStatus(409)
    assert.equal(deleteResponse.body().error, 'Cannot delete the last workspace in an organization')

    const existingWorkspace = await Workspace.find(workspace.id)
    assert.exists(existingWorkspace)
  })
})
