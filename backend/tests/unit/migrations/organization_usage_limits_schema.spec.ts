import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Organization from '#models/organization'

test.group('organization usage limits schema migration', () => {
  test('creates organization usage limit columns and period read model table', async ({ assert }) => {
    const columnsResult = await db.rawQuery(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'organizations' AND column_name IN ('weekly_limit_cents', 'monthly_limit_cents', 'billing_cycle_anchor_utc'))
          OR
          (table_name = 'organization_usage_periods' AND column_name IN ('organization_id', 'period_type', 'period_start_utc', 'period_end_utc', 'total_cost_cents', 'synced_at'))
        )
    `)

    const columns = new Set(
      columnsResult.rows.map(
        (row: { table_name: string; column_name: string }) => `${row.table_name}.${row.column_name}`
      )
    )

    assert.isTrue(columns.has('organizations.weekly_limit_cents'))
    assert.isTrue(columns.has('organizations.monthly_limit_cents'))
    assert.isTrue(columns.has('organizations.billing_cycle_anchor_utc'))
    assert.isTrue(columns.has('organization_usage_periods.organization_id'))
    assert.isTrue(columns.has('organization_usage_periods.period_type'))
    assert.isTrue(columns.has('organization_usage_periods.period_start_utc'))
    assert.isTrue(columns.has('organization_usage_periods.period_end_utc'))
    assert.isTrue(columns.has('organization_usage_periods.total_cost_cents'))
    assert.isTrue(columns.has('organization_usage_periods.synced_at'))

    const defaultResult = await db.rawQuery(`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name IN ('weekly_limit_cents', 'monthly_limit_cents')
    `)

    const defaults = new Map(
      defaultResult.rows.map((row: { column_name: string; column_default: string | null }) => [
        row.column_name,
        row.column_default,
      ])
    )

    assert.include(defaults.get('weekly_limit_cents') ?? '', '5000')
    assert.include(defaults.get('monthly_limit_cents') ?? '', '5000')

    const organization = await Organization.create({ name: 'Usage Limit Defaults Org' })
    await organization.refresh()

    assert.equal(organization.weeklyLimitCents, 5000)
    assert.equal(organization.monthlyLimitCents, 5000)

    const constraintResult = await db.rawQuery(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'organizations_weekly_limit_non_negative_chk',
        'organizations_monthly_limit_non_negative_chk',
        'organizations_weekly_within_monthly_chk',
        'organization_usage_periods_period_type_chk',
        'organization_usage_periods_total_cost_non_negative_chk',
        'organization_usage_periods_window_chk'
      )
    `)

    const constraints = new Set(constraintResult.rows.map((row: { conname: string }) => row.conname))

    assert.isTrue(constraints.has('organizations_weekly_limit_non_negative_chk'))
    assert.isTrue(constraints.has('organizations_monthly_limit_non_negative_chk'))
    assert.isTrue(constraints.has('organizations_weekly_within_monthly_chk'))
    assert.isTrue(constraints.has('organization_usage_periods_period_type_chk'))
    assert.isTrue(constraints.has('organization_usage_periods_total_cost_non_negative_chk'))
    assert.isTrue(constraints.has('organization_usage_periods_window_chk'))
  })
})
