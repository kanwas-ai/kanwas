import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  resolveMonthlyBillingCycleWindow,
  resolveOrganizationUsageWindows,
  resolveWeeklyUsageWindow,
} from '#services/organization_usage_periods'

test.group('organization usage periods', () => {
  test('computes weekly 7-day windows anchored to billing cycle anchor', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-01T00:00:00Z')
    const timestamp = DateTime.fromISO('2026-01-15T12:00:00Z')

    const weeklyWindow = resolveWeeklyUsageWindow(anchor, timestamp)

    assert.equal(weeklyWindow.periodType, 'weekly_7d')
    assert.equal(weeklyWindow.periodStartUtc.toISO(), '2026-01-15T00:00:00.000Z')
    assert.equal(weeklyWindow.periodEndUtc.toISO(), '2026-01-22T00:00:00.000Z')
  })

  test('uses half-open boundaries for weekly windows', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-01T00:00:00Z')
    const boundary = DateTime.fromISO('2026-01-08T00:00:00Z')

    const weeklyWindow = resolveWeeklyUsageWindow(anchor, boundary)

    assert.equal(weeklyWindow.periodStartUtc.toISO(), '2026-01-08T00:00:00.000Z')
    assert.equal(weeklyWindow.periodEndUtc.toISO(), '2026-01-15T00:00:00.000Z')
  })

  test('handles monthly billing windows with short-month anchors', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-31T10:15:00Z')
    const timestamp = DateTime.fromISO('2026-02-15T05:00:00Z')

    const monthlyWindow = resolveMonthlyBillingCycleWindow(anchor, timestamp)

    assert.equal(monthlyWindow.periodType, 'monthly_billing_cycle')
    assert.equal(monthlyWindow.periodStartUtc.toISO(), '2026-01-31T10:15:00.000Z')
    assert.equal(monthlyWindow.periodEndUtc.toISO(), '2026-02-28T10:15:00.000Z')
  })

  test('moves to next monthly bucket at exact period end', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-31T10:15:00Z')
    const timestamp = DateTime.fromISO('2026-02-28T10:15:00Z')

    const monthlyWindow = resolveMonthlyBillingCycleWindow(anchor, timestamp)

    assert.equal(monthlyWindow.periodStartUtc.toISO(), '2026-02-28T10:15:00.000Z')
    assert.equal(monthlyWindow.periodEndUtc.toISO(), '2026-03-31T10:15:00.000Z')
  })

  test('avoids short-month gaps for late-month anchors', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-31T10:15:00Z')
    const timestamp = DateTime.fromISO('2026-03-29T12:00:00Z')

    const monthlyWindow = resolveMonthlyBillingCycleWindow(anchor, timestamp)

    assert.equal(monthlyWindow.periodStartUtc.toISO(), '2026-02-28T10:15:00.000Z')
    assert.equal(monthlyWindow.periodEndUtc.toISO(), '2026-03-31T10:15:00.000Z')
    assert.isTrue(timestamp >= monthlyWindow.periodStartUtc)
    assert.isTrue(timestamp < monthlyWindow.periodEndUtc)
  })

  test('resolves weekly and monthly windows together', ({ assert }) => {
    const anchor = DateTime.fromISO('2026-01-10T04:00:00Z')
    const timestamp = DateTime.fromISO('2026-03-12T09:30:00Z')

    const windows = resolveOrganizationUsageWindows(anchor, timestamp)

    assert.equal(windows.weekly.periodType, 'weekly_7d')
    assert.equal(windows.monthly.periodType, 'monthly_billing_cycle')
    assert.isTrue(windows.weekly.periodStartUtc < windows.weekly.periodEndUtc)
    assert.isTrue(windows.monthly.periodStartUtc < windows.monthly.periodEndUtc)
  })
})
