import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import DocumentShare from '#models/document_share'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { loadWorkspaceYDoc } from '#tests/helpers/workspace_yjs'

test.group('DocumentShare model', () => {
  test('enforces one active share per note and globally unique long hashes', async ({ assert }) => {
    const user = await User.create({ email: 'document-share-model@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Document Share Model Workspace')
    const { proxy, cleanup } = loadWorkspaceYDoc(workspace)

    const note = proxy.root.items.find((item) => item.kind === 'node' && item.xynode.type === 'blockNote')
    cleanup()

    assert.exists(note)

    const firstShare = await DocumentShare.create({
      workspaceId: workspace.id,
      noteId: note!.id,
      createdByUserId: user.id,
      name: note!.name,
      longHashId: 'model-share-hash-1',
      accessMode: 'readonly',
    })

    await firstShare.load('workspace')
    await firstShare.load('createdByUser')

    assert.equal(firstShare.workspace.id, workspace.id)
    assert.equal(firstShare.createdByUser.id, user.id)

    let activeConflict: unknown = null
    try {
      await db.transaction(async (trx) => {
        await DocumentShare.create(
          {
            workspaceId: workspace.id,
            noteId: note!.id,
            createdByUserId: user.id,
            name: 'Second share name',
            longHashId: 'model-share-hash-2',
            accessMode: 'editable',
          },
          { client: trx }
        )
      })
    } catch (error) {
      activeConflict = error
    }

    assert.exists(activeConflict)
    assert.equal((activeConflict as { code?: string }).code, '23505')
    assert.equal((activeConflict as { constraint?: string }).constraint, 'document_shares_active_note_unique')

    let longHashConflict: unknown = null
    try {
      await db.transaction(async (trx) => {
        await DocumentShare.create(
          {
            workspaceId: workspace.id,
            noteId: crypto.randomUUID(),
            createdByUserId: user.id,
            name: 'Duplicate hash share',
            longHashId: firstShare.longHashId,
            accessMode: 'readonly',
          },
          { client: trx }
        )
      })
    } catch (error) {
      longHashConflict = error
    }

    assert.exists(longHashConflict)
    assert.equal((longHashConflict as { code?: string }).code, '23505')
    assert.equal((longHashConflict as { constraint?: string }).constraint, 'document_shares_long_hash_id_unique')

    firstShare.revokedAt = DateTime.utc()
    await firstShare.save()

    const secondShare = await DocumentShare.create({
      workspaceId: workspace.id,
      noteId: note!.id,
      createdByUserId: user.id,
      name: 'Third share name',
      longHashId: 'model-share-hash-3',
      accessMode: 'editable',
    })
    await secondShare.refresh()

    assert.exists(secondShare.id)
    assert.isNull(secondShare.revokedAt)
  })
})
