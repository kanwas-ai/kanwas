import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvite from '#models/organization_invite'
import { OrganizationWorkspaceNotFoundError, WorkspaceService } from '#services/workspace_service'
import OrganizationInviteService, {
  InvalidInviteTokenError,
  InvalidOAuthStateError,
} from '#services/organization_invite_service'
import sinon from 'sinon'

test.group('OrganizationInviteService', () => {
  test('consumes invite tokens once and consumes OAuth state once', async ({ assert }) => {
    const workspaceService = await app.container.make(WorkspaceService)
    const inviteService = await app.container.make(OrganizationInviteService)

    const now = Date.now()
    const admin = await User.create({ email: `service-admin-${now}@example.com`, password: 'password123' })
    const member = await User.create({ email: `service-member-${now}@example.com`, password: 'password123' })

    const workspace = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(admin.id, 'Service Workspace', trx)
    })

    const { token } = await inviteService.createInvite({
      organizationId: workspace.organizationId,
      createdBy: admin.id,
      inviteeName: 'Invited Member',
    })

    const accepted = await inviteService.acceptInviteTokenForUser(token, member.id)
    assert.equal(accepted.organizationId, workspace.organizationId)
    assert.equal(accepted.workspaceId, workspace.id)

    const memberMembership = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('user_id', member.id)
      .first()
    assert.exists(memberMembership)

    let secondAcceptError: unknown = null
    try {
      await inviteService.acceptInviteTokenForUser(token, admin.id)
    } catch (error) {
      secondAcceptError = error
    }
    assert.instanceOf(secondAcceptError, InvalidInviteTokenError)

    let invalidStateCreateError: unknown = null
    try {
      await inviteService.createOAuthState(token)
    } catch (error) {
      invalidStateCreateError = error
    }
    assert.instanceOf(invalidStateCreateError, InvalidInviteTokenError)

    const freshState = await inviteService.createOAuthState()
    await inviteService.consumeOAuthState(freshState)
    let replayStateError: unknown = null
    try {
      await inviteService.consumeOAuthState(freshState)
    } catch (error) {
      replayStateError = error
    }
    assert.instanceOf(replayStateError, InvalidOAuthStateError)
  })

  test('does not consume invite token on membership uniqueness race', async ({ assert }) => {
    const workspaceService = await app.container.make(WorkspaceService)
    const inviteService = await app.container.make(OrganizationInviteService)

    const now = Date.now()
    const admin = await User.create({ email: `service-race-admin-${now}@example.com`, password: 'password123' })
    const invitee = await User.create({ email: `service-race-invitee-${now}@example.com`, password: 'password123' })

    const workspace = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(admin.id, 'Service Race Workspace', trx)
    })

    const { token, invite } = await inviteService.createInvite({
      organizationId: workspace.organizationId,
      createdBy: admin.id,
      inviteeName: 'Race Invitee',
    })

    const membershipCreateStub = sinon
      .stub(OrganizationMembership, 'create')
      .rejects({ code: '23505', constraint: 'organization_memberships_organization_id_user_id_unique' })

    try {
      let caughtError: unknown = null

      try {
        await inviteService.acceptInviteTokenForUser(token, invitee.id)
      } catch (error) {
        caughtError = error
      }

      assert.instanceOf(caughtError, InvalidInviteTokenError)
      assert.equal((caughtError as Error).message, 'You are already a member of this team')
    } finally {
      membershipCreateStub.restore()
    }

    const refreshedInvite = await OrganizationInvite.findOrFail(invite.id)
    assert.isNull(refreshedInvite.consumedAt)
    assert.isNull(refreshedInvite.consumedByUserId)
  })

  test('fails invite acceptance when organization has no workspace', async ({ assert }) => {
    const inviteService = await app.container.make(OrganizationInviteService)

    const now = Date.now()
    const admin = await User.create({ email: `service-bootstrap-admin-${now}@example.com`, password: 'password123' })
    const invitee = await User.create({
      email: `service-bootstrap-invitee-${now}@example.com`,
      password: 'password123',
    })

    const organization = await Organization.create({ name: 'Bootstrap Org' })
    await OrganizationMembership.create({
      organizationId: organization.id,
      userId: admin.id,
      role: 'admin',
    })

    const { token } = await inviteService.createInvite({
      organizationId: organization.id,
      createdBy: admin.id,
      inviteeName: 'Bootstrap Invitee',
    })

    let caughtError: unknown = null

    try {
      await inviteService.acceptInviteTokenForUser(token, invitee.id)
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, OrganizationWorkspaceNotFoundError)
    assert.equal((caughtError as Error).message, `Organization ${organization.id} does not have a workspace`)
  })
})
