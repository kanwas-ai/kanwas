import { test } from '@japa/runner'
import sinon from 'sinon'
import User from '#models/user'
import Workspace from '#models/workspace'
import OrganizationMembership from '#models/organization_membership'
import WorkspaceSuggestedTaskSet from '#models/workspace_suggested_task_set'
import UserRegistered from '#events/user_registered'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Auth onboarding with invites', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('register without invite creates personal organization and workspace', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')

    const response = await client.post('/auth/register').json({
      email: `new-user-${suffix}@example.com`,
      password: 'password123',
      name: 'New User',
    })

    response.assertStatus(200)
    assert.isString(response.body().value)
    assert.isString(response.body().workspaceId)

    const user = await User.findByOrFail('email', `new-user-${suffix}@example.com`)
    assert.equal(user.name, 'New User')
    const memberships = await OrganizationMembership.query().where('user_id', user.id)
    assert.lengthOf(memberships, 1)
    assert.equal(memberships[0].role, 'admin')

    const workspaces = await Workspace.query().where('organization_id', memberships[0].organizationId)
    assert.lengthOf(workspaces, 1)
    assert.equal(workspaces[0].id, response.body().workspaceId)

    assert.isTrue(dispatchStub.calledOnce)
    const [userId, email, name, source, viaInvite, context] = dispatchStub.firstCall.args as ConstructorParameters<
      typeof UserRegistered
    >

    assert.equal(userId, user.id)
    assert.equal(email, user.email)
    assert.equal(name, user.name)
    assert.equal(source, 'password')
    assert.isFalse(viaInvite)
    assert.equal(context.userId, user.id)
    assert.equal(context.workspaceId, response.body().workspaceId)
    assert.equal(context.organizationId, memberships[0].organizationId)
  })

  test('register without invite requires explicit name', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')

    const response = await client.post('/auth/register').json({
      email: `new-user-noname-${suffix}@example.com`,
      password: 'password123',
    })

    response.assertStatus(422)
    assert.isTrue(dispatchStub.notCalled)
  })

  test('register with invite joins target organization without creating personal org', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const dispatchStub = sinon.stub(UserRegistered, 'dispatch')
    const inviter = await User.create({ email: `inviter-${suffix}@example.com`, password: 'password123' })
    const inviterWorkspace = await createTestWorkspace(inviter, 'Inviter Workspace')
    const inviterToken = await login(client, inviter.email, 'password123')

    const createInviteResponse = await client
      .post(`/workspaces/${inviterWorkspace.id}/invites`)
      .bearerToken(inviterToken)
      .json({ inviteeName: 'Invite Register User' })
    createInviteResponse.assertStatus(200)

    const response = await client.post('/auth/register').json({
      email: `invite-register-${suffix}@example.com`,
      password: 'password123',
      name: 'Should Be Ignored',
      inviteToken: createInviteResponse.body().token,
    })

    response.assertStatus(200)
    assert.isString(response.body().workspaceId)
    assert.equal(response.body().workspaceId, inviterWorkspace.id)

    const invitedUser = await User.findByOrFail('email', `invite-register-${suffix}@example.com`)
    assert.equal(invitedUser.name, 'Invite Register User')
    const memberships = await OrganizationMembership.query().where('user_id', invitedUser.id)
    assert.lengthOf(memberships, 1)
    assert.equal(memberships[0].organizationId, inviterWorkspace.organizationId)
    assert.equal(memberships[0].role, 'member')

    const suggestedTaskRow = await WorkspaceSuggestedTaskSet.findBy('workspaceId', inviterWorkspace.id)
    assert.isNull(suggestedTaskRow)

    assert.isTrue(dispatchStub.calledOnce)
    const [userId, email, name, source, viaInvite, context] = dispatchStub.firstCall.args as ConstructorParameters<
      typeof UserRegistered
    >

    assert.equal(userId, invitedUser.id)
    assert.equal(email, invitedUser.email)
    assert.equal(name, invitedUser.name)
    assert.equal(source, 'password')
    assert.isTrue(viaInvite)
    assert.equal(context.userId, invitedUser.id)
    assert.equal(context.workspaceId, inviterWorkspace.id)
    assert.equal(context.organizationId, inviterWorkspace.organizationId)
  })

  test('login with invite adds additional organization membership for existing user', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const inviter = await User.create({ email: `inviter-2-${suffix}@example.com`, password: 'password123' })
    const inviterWorkspace = await createTestWorkspace(inviter, 'Inviter Workspace 2')
    const inviterToken = await login(client, inviter.email, 'password123')

    const existingUser = await User.create({ email: `existing-user-${suffix}@example.com`, password: 'password123' })
    const existingUserOriginalName = existingUser.name
    await createTestWorkspace(existingUser, 'Existing User Workspace')

    const createInviteResponse = await client
      .post(`/workspaces/${inviterWorkspace.id}/invites`)
      .bearerToken(inviterToken)
      .json({ inviteeName: 'Existing User Invite' })
    createInviteResponse.assertStatus(200)

    const loginWithInviteResponse = await client.post('/auth/login').json({
      email: `existing-user-${suffix}@example.com`,
      password: 'password123',
      inviteToken: createInviteResponse.body().token,
    })

    loginWithInviteResponse.assertStatus(200)
    assert.equal(loginWithInviteResponse.body().workspaceId, inviterWorkspace.id)

    const memberships = await OrganizationMembership.query()
      .where('user_id', existingUser.id)
      .orderBy('created_at', 'asc')
    assert.lengthOf(memberships, 2)

    await existingUser.refresh()
    assert.equal(existingUser.name, existingUserOriginalName)
    assert.include(
      memberships.map((membership) => membership.organizationId),
      inviterWorkspace.organizationId
    )

    const suggestedTaskRow = await WorkspaceSuggestedTaskSet.findBy('workspaceId', inviterWorkspace.id)
    assert.isNull(suggestedTaskRow)
  })
})
