import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Organization from '#models/organization'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function login(client: any, email: string, password: string): Promise<string> {
  const response = await client.post('/auth/login').json({ email, password })
  response.assertStatus(200)
  return response.body().value
}

test.group('Organization mutation usage fields', () => {
  test('ignores usage limit and anchor fields on organization patch payload', async ({ client, assert }) => {
    const suffix = Date.now().toString(36)
    const admin = await User.create({ email: `usage-fields-admin-${suffix}@example.com`, password: 'password123' })
    const workspace = await createTestWorkspace(admin, 'Usage Fields Workspace')
    const organizationBefore = await Organization.findOrFail(workspace.organizationId)

    const adminToken = await login(client, admin.email, 'password123')

    const response = await client
      .patch(`/workspaces/${workspace.id}/organization`)
      .bearerToken(adminToken)
      .json({
        name: 'Renamed Organization',
        weekly_limit_cents: 999999,
        monthly_limit_cents: 999999,
        billing_cycle_anchor_utc: DateTime.utc().plus({ years: 1 }).toISO(),
        weeklyLimitCents: 888888,
        monthlyLimitCents: 888888,
        billingCycleAnchorUtc: DateTime.utc().plus({ years: 2 }).toISO(),
      })

    response.assertStatus(200)
    assert.equal(response.body().name, 'Renamed Organization')
    assert.equal(response.body().weeklyLimitCents, organizationBefore.weeklyLimitCents)
    assert.equal(response.body().monthlyLimitCents, organizationBefore.monthlyLimitCents)
    assert.equal(response.body().billingCycleAnchorUtc, organizationBefore.billingCycleAnchorUtc.toUTC().toISO())

    const organizationAfter = await Organization.findOrFail(workspace.organizationId)
    assert.equal(organizationAfter.weeklyLimitCents, organizationBefore.weeklyLimitCents)
    assert.equal(organizationAfter.monthlyLimitCents, organizationBefore.monthlyLimitCents)
    assert.equal(
      organizationAfter.billingCycleAnchorUtc.toUTC().toISO(),
      organizationBefore.billingCycleAnchorUtc.toUTC().toISO()
    )
  })
})
