import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import OrganizationMembership from '#models/organization_membership'
import { createTestWorkspace } from '#tests/helpers/workspace'
import OrganizationMemberService, {
  LastAdminRemovalBlockedError,
  SelfRemovalForbiddenError,
} from '#services/organization_member_service'

test.group('OrganizationMemberService', () => {
  test('blocks self-removal with explicit domain error', async ({ assert }) => {
    const service = await app.container.make(OrganizationMemberService)
    const admin = await User.create({
      email: `service-self-admin-${Date.now().toString(36)}@example.com`,
      name: 'Service Self Admin',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Service Self Workspace')

    let caughtError: unknown = null
    try {
      await service.removeOrganizationMember({
        organizationId: workspace.organizationId,
        actorUserId: admin.id,
        targetUserId: admin.id,
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, SelfRemovalForbiddenError)
  })

  test('blocks removing the last remaining admin', async ({ assert }) => {
    const service = await app.container.make(OrganizationMemberService)
    const suffix = Date.now().toString(36)

    const admin = await User.create({
      email: `service-last-admin-${suffix}@example.com`,
      name: 'Last Admin',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(admin, 'Service Last Admin Workspace')

    const actor = await User.create({
      email: `service-last-actor-${suffix}@example.com`,
      name: 'Last Actor',
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: actor.id,
      role: 'member',
    })

    let caughtError: unknown = null
    try {
      await service.removeOrganizationMember({
        organizationId: workspace.organizationId,
        actorUserId: actor.id,
        targetUserId: admin.id,
      })
    } catch (error) {
      caughtError = error
    }

    assert.instanceOf(caughtError, LastAdminRemovalBlockedError)

    const remainingAdminCount = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('role', 'admin')
      .count('* as total')
      .first()

    assert.equal(Number(remainingAdminCount?.$extras.total ?? 0), 1)
  })

  test('keeps one admin during concurrent cross-removal race', async ({ assert }) => {
    const service = await app.container.make(OrganizationMemberService)
    const suffix = Date.now().toString(36)

    const adminA = await User.create({
      email: `service-race-admin-a-${suffix}@example.com`,
      name: 'Race Admin A',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(adminA, 'Service Race Workspace')

    const adminB = await User.create({
      email: `service-race-admin-b-${suffix}@example.com`,
      name: 'Race Admin B',
      password: 'password123',
    })
    await OrganizationMembership.create({
      organizationId: workspace.organizationId,
      userId: adminB.id,
      role: 'admin',
    })

    const results = await Promise.allSettled([
      service.removeOrganizationMember({
        organizationId: workspace.organizationId,
        actorUserId: adminA.id,
        targetUserId: adminB.id,
      }),
      service.removeOrganizationMember({
        organizationId: workspace.organizationId,
        actorUserId: adminB.id,
        targetUserId: adminA.id,
      }),
    ])

    const fulfilledCount = results.filter((result) => result.status === 'fulfilled').length
    const rejectedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')

    assert.equal(fulfilledCount, 1)
    assert.lengthOf(rejectedResults, 1)
    assert.instanceOf(rejectedResults[0].reason, LastAdminRemovalBlockedError)

    const remainingAdmins = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('role', 'admin')

    assert.lengthOf(remainingAdmins, 1)
  })
})
