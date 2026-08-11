import { test } from '@japa/runner'
import sinon from 'sinon'
import * as Y from 'yjs'
import { createWorkspaceSnapshotBundle } from 'shared/server'
import WorkspaceDocumentService, { LiveWorkspaceDocumentError } from '#services/workspace_document_service'
import YjsSocketTokenService from '#services/yjs_socket_token_service'

function mockTokenService(): YjsSocketTokenService {
  return {
    mint: () => ({ token: 'stub.token', expiresAt: new Date().toISOString() }),
  } as unknown as YjsSocketTokenService
}

test.group('WorkspaceDocumentService', () => {
  test('getWorkspaceDocument returns caller-provided yDoc instance', async ({ assert }) => {
    const callerYDoc = new Y.Doc()
    const disconnectSpy = sinon.spy()

    const connector = sinon.stub().callsFake(async (options: any) => {
      assert.equal(options.workspaceId, 'workspace-1')
      assert.strictEqual(options.yDoc, callerYDoc)

      return {
        proxy: { root: null },
        yDoc: callerYDoc,
        provider: {},
        contentStore: {},
        disconnect: disconnectSpy,
      }
    })

    const service = new WorkspaceDocumentService(mockTokenService())
    service.setConnector(connector as any)
    const connection = await service.getWorkspaceDocument('workspace-1', { yDoc: callerYDoc })

    assert.strictEqual(connection.yDoc, callerYDoc)
    connection.cleanup()
    assert.isTrue(disconnectSpy.calledOnce)
  })

  test('maps timeout connection errors to retryable typed error', async ({ assert }) => {
    const connector = sinon.stub().rejects(new Error('Sync timeout after 10000ms'))
    const service = new WorkspaceDocumentService(mockTokenService())
    service.setConnector(connector as any)

    try {
      await service.getWorkspaceDocument('workspace-timeout')
      assert.fail('Expected getWorkspaceDocument to throw')
    } catch (error) {
      assert.instanceOf(error, LiveWorkspaceDocumentError)
      assert.equal((error as LiveWorkspaceDocumentError).code, 'YJS_SERVER_SYNC_TIMEOUT')
      assert.isTrue((error as LiveWorkspaceDocumentError).retryable)
    }
  })

  test('withWorkspaceDocument always cleans up on success and failure', async ({ assert }) => {
    const disconnectSpy = sinon.spy()

    const connector = sinon.stub().resolves({
      proxy: { root: null },
      yDoc: new Y.Doc(),
      provider: {},
      contentStore: {},
      disconnect: disconnectSpy,
    })

    const service = new WorkspaceDocumentService(mockTokenService())
    service.setConnector(connector as any)

    const value = await service.withWorkspaceDocument('workspace-success', async () => 'ok')
    assert.equal(value, 'ok')
    assert.isTrue(disconnectSpy.calledOnce)

    try {
      await service.withWorkspaceDocument('workspace-failure', async () => {
        throw new Error('handler failed')
      })
      assert.fail('Expected withWorkspaceDocument to throw')
    } catch (error) {
      assert.equal((error as Error).message, 'handler failed')
    }

    assert.isTrue(disconnectSpy.calledTwice)
  })

  test('readSnapshotBundle returns root and note docs and cleans up', async ({ assert }) => {
    const yDoc = new Y.Doc()
    const notes = yDoc.getMap<Y.Doc>('notes')
    const noteDoc = new Y.Doc({ guid: 'note-1' })
    noteDoc.getMap('meta').set('schemaVersion', 1)
    noteDoc.getMap('meta').set('noteId', 'note-1')
    noteDoc.getMap('meta').set('contentKind', 'blockNote')
    noteDoc.getXmlFragment('content')
    notes.set('note-1', noteDoc)

    const disconnectSpy = sinon.spy()
    const connector = sinon.stub().resolves({
      proxy: { root: null },
      yDoc,
      provider: {},
      contentStore: {},
      disconnect: disconnectSpy,
    })

    const service = new WorkspaceDocumentService(mockTokenService())
    service.setConnector(connector as any)
    const snapshot = await service.readSnapshotBundle('workspace-bundle')

    assert.deepEqual(snapshot, createWorkspaceSnapshotBundle(yDoc))
    assert.isTrue(disconnectSpy.calledOnce)
  })
})
