import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationUsagePeriod from '#models/organization_usage_period'
import { createTestWorkspace } from '#tests/helpers/workspace'
import OrganizationUsageService from '#services/organization_usage_service'
import { resolveOrganizationUsageWindows } from '#services/organization_usage_periods'

function createService(): OrganizationUsageService {
  const fakePostHogQueryService = {
    isConfigured: () => false,
  }

  return new OrganizationUsageService(fakePostHogQueryService as any)
}

test.group('OrganizationUsageService', () => {
  test('fails open when current period snapshot rows are missing', async ({ assert }) => {
    const user = await User.create({
      email: 'usage-service-missing@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Usage Service Missing Snapshot')
    const organization = await Organization.findOrFail(workspace.organizationId)

    const now = DateTime.utc()
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)

    await OrganizationUsagePeriod.create({
      organizationId: organization.id,
      periodType: windows.weekly.periodType,
      periodStartUtc: windows.weekly.periodStartUtc,
      periodEndUtc: windows.weekly.periodEndUtc,
      totalCostCents: 100,
      syncedAt: now,
    })

    const service = createService()
    const gateResult = await service.evaluateLimitGate(organization, now)

    assert.isFalse(gateResult.blocked)
    assert.equal(gateResult.reason, 'missing_snapshot')
  })

  test('fails open when snapshot rows are stale', async ({ assert }) => {
    const user = await User.create({
      email: 'usage-service-stale@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Usage Service Stale Snapshot')
    const organization = await Organization.findOrFail(workspace.organizationId)

    const now = DateTime.utc()
    const staleSyncedAt = now.minus({ minutes: 11 })
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)

    await OrganizationUsagePeriod.create({
      organizationId: organization.id,
      periodType: windows.weekly.periodType,
      periodStartUtc: windows.weekly.periodStartUtc,
      periodEndUtc: windows.weekly.periodEndUtc,
      totalCostCents: 100,
      syncedAt: staleSyncedAt,
    })

    await OrganizationUsagePeriod.create({
      organizationId: organization.id,
      periodType: windows.monthly.periodType,
      periodStartUtc: windows.monthly.periodStartUtc,
      periodEndUtc: windows.monthly.periodEndUtc,
      totalCostCents: 200,
      syncedAt: staleSyncedAt,
    })

    const service = createService()
    const gateResult = await service.evaluateLimitGate(organization, now)

    assert.isFalse(gateResult.blocked)
    assert.equal(gateResult.reason, 'stale_snapshot')
  })

  test('blocks when weekly or monthly usage exceeds fresh snapshot limits', async ({ assert }) => {
    const user = await User.create({
      email: 'usage-service-over@example.com',
      password: 'password123',
    })
    const workspace = await createTestWorkspace(user, 'Usage Service Over Limit')
    const organization = await Organization.findOrFail(workspace.organizationId)

    organization.weeklyLimitCents = 1250
    organization.monthlyLimitCents = 5000
    await organization.save()

    const now = DateTime.utc()
    const windows = resolveOrganizationUsageWindows(organization.billingCycleAnchorUtc, now)

    await OrganizationUsagePeriod.create({
      organizationId: organization.id,
      periodType: windows.weekly.periodType,
      periodStartUtc: windows.weekly.periodStartUtc,
      periodEndUtc: windows.weekly.periodEndUtc,
      totalCostCents: 1300,
      syncedAt: now,
    })

    await OrganizationUsagePeriod.create({
      organizationId: organization.id,
      periodType: windows.monthly.periodType,
      periodStartUtc: windows.monthly.periodStartUtc,
      periodEndUtc: windows.monthly.periodEndUtc,
      totalCostCents: 4500,
      syncedAt: now,
    })

    const service = createService()
    const gateResult = await service.evaluateLimitGate(organization, now)

    assert.isTrue(gateResult.blocked)
    assert.equal(gateResult.reason, 'over_limit')
    assert.deepEqual(gateResult.blockedPeriodTypes, ['weekly_7d'])
    assert.equal(gateResult.usage.weekly.usedCents, 1300)
  })
})
