import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('organization access schema migrations', () => {
  test('creates organization invite + oauth state tables with expected columns', async ({ assert }) => {
    const hasOrganizationInvitesResult = await db.rawQuery(
      "SELECT to_regclass('public.organization_invites') as table_name"
    )
    const hasOAuthStatesResult = await db.rawQuery("SELECT to_regclass('public.oauth_states') as table_name")

    const hasOrganizationInvites = Boolean(hasOrganizationInvitesResult.rows[0]?.table_name)
    const hasOAuthStates = Boolean(hasOAuthStatesResult.rows[0]?.table_name)

    assert.isTrue(hasOrganizationInvites)
    assert.isTrue(hasOAuthStates)

    const columnsResult = await db.rawQuery(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('organization_invites', 'oauth_states', 'users')
    `)

    const columns = new Set(
      columnsResult.rows.map(
        (row: { table_name: string; column_name: string }) => `${row.table_name}.${row.column_name}`
      )
    )

    assert.isTrue(columns.has('organization_invites.consumed_at'))
    assert.isTrue(columns.has('organization_invites.token_hash'))
    assert.isTrue(columns.has('organization_invites.invitee_name'))
    assert.isTrue(columns.has('oauth_states.state_hash'))
    assert.isTrue(columns.has('oauth_states.invite_id'))
    assert.isTrue(columns.has('oauth_states.consumed_at'))
    assert.isTrue(columns.has('users.name'))

    const nonNullableColumnsResult = await db.rawQuery(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'users' AND column_name = 'name')
          OR (table_name = 'organization_invites' AND column_name = 'invitee_name'))
        AND is_nullable = 'NO'
    `)

    const nonNullableColumns = new Set(
      nonNullableColumnsResult.rows.map(
        (row: { table_name: string; column_name: string }) => `${row.table_name}.${row.column_name}`
      )
    )

    assert.isTrue(nonNullableColumns.has('users.name'))
    assert.isTrue(nonNullableColumns.has('organization_invites.invitee_name'))

    const indexResult = await db.rawQuery(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'organization_memberships'
        AND indexname = 'organization_memberships_org_id_role_idx'
    `)

    assert.equal(indexResult.rows.length, 1)
  })
})
