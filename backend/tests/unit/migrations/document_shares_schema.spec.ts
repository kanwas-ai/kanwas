import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('document shares schema migration', () => {
  test('creates the document_shares table with expected columns, indexes, and foreign keys', async ({ assert }) => {
    const tableResult = await db.rawQuery("SELECT to_regclass('public.document_shares') as table_name")
    assert.isTrue(Boolean(tableResult.rows[0]?.table_name))

    const columnsResult = await db.rawQuery(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'document_shares'
    `)

    const columns = new Set(columnsResult.rows.map((row: { column_name: string }) => row.column_name))

    assert.isTrue(columns.has('workspace_id'))
    assert.isTrue(columns.has('note_id'))
    assert.isTrue(columns.has('created_by_user_id'))
    assert.isTrue(columns.has('name'))
    assert.isTrue(columns.has('long_hash_id'))
    assert.isTrue(columns.has('access_mode'))
    assert.isTrue(columns.has('revoked_at'))

    const indexResult = await db.rawQuery(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'document_shares'
    `)

    const indexes = new Set(indexResult.rows.map((row: { indexname: string }) => row.indexname))

    assert.isTrue(indexes.has('document_shares_long_hash_id_unique'))
    assert.isTrue(indexes.has('document_shares_active_note_unique'))
    assert.isTrue(indexes.has('document_shares_workspace_note_idx'))
    assert.isTrue(indexes.has('document_shares_created_by_user_idx'))

    const foreignKeysResult = await db.rawQuery(`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      INNER JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'document_shares'
    `)

    const foreignKeys = new Set(
      foreignKeysResult.rows.map(
        (row: { column_name: string; foreign_table_name: string }) => `${row.column_name}:${row.foreign_table_name}`
      )
    )

    assert.isTrue(foreignKeys.has('created_by_user_id:users'))
  })
})
