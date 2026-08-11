import { test } from '@japa/runner'
import sinon from 'sinon'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import type Workspace from '#models/workspace'
import DocumentShare from '#models/document_share'
import DocumentShareService from '#services/document_share_service'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { loadWorkspaceYDoc } from '#tests/helpers/workspace_yjs'

function getFirstBlockNoteNoteId(workspace: Workspace) {
  const { proxy, cleanup } = loadWorkspaceYDoc(workspace)
  const note = proxy.root.items.find((item) => item.kind === 'node' && item.xynode.type === 'blockNote')
  cleanup()

  if (!note || note.kind !== 'node') {
    throw new Error(`Workspace ${workspace.id} does not have a BlockNote note`)
  }

  return note.id
}

test.group('DocumentShareService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('retries with a fresh longHashId when a collision occurs', async ({ assert }) => {
    const user = await User.create({ email: 'document-share-service@example.com', password: 'password123' })
    const workspaceOne = await createTestWorkspace(user, 'Document Share Service One')
    const workspaceTwo = await createTestWorkspace(user, 'Document Share Service Two')
    const noteOneId = getFirstBlockNoteNoteId(workspaceOne)
    const noteTwoId = getFirstBlockNoteNoteId(workspaceTwo)

    await DocumentShare.create({
      workspaceId: workspaceOne.id,
      noteId: noteOneId,
      createdByUserId: user.id,
      name: 'Existing share',
      longHashId: 'duplicate-long-hash-id',
      accessMode: 'readonly',
    })

    const service = await app.container.make(DocumentShareService)
    const generatorStub = sinon
      .stub(service as any, 'generateLongHashId')
      .onFirstCall()
      .returns('duplicate-long-hash-id')
      .onSecondCall()
      .returns('fresh-long-hash-id')

    const result = await service.createOrUpdateShare(workspaceTwo.id, noteTwoId, user.id, 'Fresh share', 'editable')

    assert.equal(result.active, true)
    assert.exists(result.share)
    assert.equal(result.share!.name, 'Fresh share')
    assert.equal(result.share!.longHashId, 'fresh-long-hash-id')
    assert.equal(generatorStub.callCount, 2)
  })
})
