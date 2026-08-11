import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  buildOrganizationUsageHogqlQuery,
  escapeHogqlStringLiteral,
  usdToCentsHalfUp,
} from '#services/posthog_usage_query_service'

test.group('PostHog usage query helpers', () => {
  test('rounds USD totals to cents using half-up strategy', ({ assert }) => {
    assert.equal(usdToCentsHalfUp(0), 0)
    assert.equal(usdToCentsHalfUp(1.234), 123)
    assert.equal(usdToCentsHalfUp(1.235), 124)
    assert.equal(usdToCentsHalfUp(2.005), 201)
  })

  test('escapes HogQL string literals safely', ({ assert }) => {
    const escaped = escapeHogqlStringLiteral("org'abc\\path\nnext")
    assert.equal(escaped, "org\\'abc\\\\path\\nnext")
  })

  test('builds org usage query with escaped group key and UTC bounds', ({ assert }) => {
    const query = buildOrganizationUsageHogqlQuery({
      organizationGroupKey: "org'1",
      periodStartUtc: DateTime.fromISO('2026-03-01T00:00:00Z'),
      periodEndUtc: DateTime.fromISO('2026-03-08T00:00:00Z'),
    })

    assert.include(query, "event = '$ai_generation'")
    assert.include(query, "$group_1 = 'org\\'1'")
    assert.include(query, "timestamp >= toDateTime64('2026-03-01 00:00:00.000', 3, 'UTC')")
    assert.include(query, "timestamp < toDateTime64('2026-03-08 00:00:00.000', 3, 'UTC')")
  })

  test('supports configurable organization group column', ({ assert }) => {
    const query = buildOrganizationUsageHogqlQuery({
      organizationGroupKey: 'org-2',
      organizationGroupColumn: '$group_2',
      periodStartUtc: DateTime.fromISO('2026-03-01T00:00:00.123Z'),
      periodEndUtc: DateTime.fromISO('2026-03-08T00:00:00.456Z'),
    })

    assert.include(query, 'notEmpty($group_2)')
    assert.include(query, "$group_2 = 'org-2'")
    assert.include(query, "timestamp >= toDateTime64('2026-03-01 00:00:00.123', 3, 'UTC')")
    assert.include(query, "timestamp < toDateTime64('2026-03-08 00:00:00.456', 3, 'UTC')")
  })

  test('rejects invalid organization group column values', ({ assert }) => {
    assert.throws(() =>
      buildOrganizationUsageHogqlQuery({
        organizationGroupKey: 'org-2',
        organizationGroupColumn: '$group_1; DROP TABLE events; --',
        periodStartUtc: DateTime.fromISO('2026-03-01T00:00:00Z'),
        periodEndUtc: DateTime.fromISO('2026-03-08T00:00:00Z'),
      })
    )
  })
})
