import { test } from '@japa/runner'
import sinon from 'sinon'
import { encodeSnapshotDocument } from 'shared/server'
import type { WorkspaceSnapshotBundle } from 'shared'
import YjsServerService from '#services/yjs_server_service'

function createSnapshotBundle(root: Uint8Array): WorkspaceSnapshotBundle {
  return {
    root: encodeSnapshotDocument(root),
    notes: {},
  }
}

test.group('YjsServerService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('forwards correlation IDs to yjs-server durability mutations', async ({ assert }) => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(null, { status: 200 }))
    const service = new YjsServerService()
    const snapshot = createSnapshotBundle(Uint8Array.from([1, 2, 3]))

    await service.replaceDocument('workspace-1', snapshot, {
      correlationId: 'corr-backend-1',
      notifyBackend: false,
      reason: 'manual',
    })

    assert.equal(fetchStub.callCount, 1)

    const [url, init] = fetchStub.firstCall.args as [URL | string, RequestInit]
    const requestUrl = new URL(String(url))
    const headers = init.headers as Record<string, string>
    const payload = JSON.parse(String(init.body)) as { root: string; notes: Record<string, string> }

    assert.equal(requestUrl.pathname, '/documents/workspace-1/replace')
    assert.equal(requestUrl.searchParams.get('reason'), 'manual')
    assert.equal(requestUrl.searchParams.get('notifyBackend'), 'false')
    assert.equal(headers['Content-Type'], 'application/json')
    assert.equal(headers['x-correlation-id'], 'corr-backend-1')
    assert.equal(payload.root, snapshot.root)
    assert.deepEqual(payload.notes, {})
  })
})
