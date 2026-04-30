import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import WorkspaceDocumentService from '#services/workspace_document_service'
import YjsServerService, { YjsServerDurabilityError } from '#services/yjs_server_service'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { decodeWorkspaceSnapshotBundle, flushYjsTicks } from '#tests/helpers/workspace_yjs'
import MockWorkspaceDocumentService from '#tests/mocks/workspace_document_service'
import MockYjsServerService from '#tests/mocks/yjs_server_service'
import type { WorkspaceSnapshotBundle } from 'shared'
import { createWorkspaceSnapshotBundle } from 'shared/server'

const RUN_LIVE_YJS_SERVER_TESTS = process.env.RUN_LIVE_YJS_SERVER_TESTS === '1'

async function buildDocumentWithMarker(
  initialSnapshot: WorkspaceSnapshotBundle,
  markerName: string
): Promise<WorkspaceSnapshotBundle> {
  const { proxy, yDoc, cleanup } = decodeWorkspaceSnapshotBundle(initialSnapshot)

  try {
    const canvasId = crypto.randomUUID()

    if (!(proxy as any).root) {
      ;(proxy as any).root = {
        kind: 'canvas',
        id: 'root',
        name: '',
        xynode: {
          id: 'root',
          type: 'canvas',
          position: { x: 0, y: 0 },
          data: {},
        },
        edges: [],
        items: [],
      }
    }

    ;(proxy as any).root.items.push({
      kind: 'canvas',
      id: canvasId,
      name: markerName,
      xynode: {
        id: canvasId,
        type: 'canvas',
        position: { x: 0, y: 0 },
        data: {},
      },
      edges: [],
      items: [],
    })

    await flushYjsTicks(2)

    return createWorkspaceSnapshotBundle(yDoc)
  } finally {
    cleanup()
  }
}

test.group('Yjs server live integration', (group) => {
  group.setup(() => {
    if (!RUN_LIVE_YJS_SERVER_TESTS) {
      return
    }

    app.container.restore(WorkspaceDocumentService)
    app.container.restore(YjsServerService)
  })

  group.teardown(() => {
    if (!RUN_LIVE_YJS_SERVER_TESTS) {
      return
    }

    app.container.swap(WorkspaceDocumentService, () => new MockWorkspaceDocumentService() as any)
    app.container.swap(YjsServerService, () => new MockYjsServerService() as any)
  })

  test('round-trips document replacement through real Yjs server durability + live reads', async ({ assert }) => {
    if (!RUN_LIVE_YJS_SERVER_TESTS) {
      assert.isTrue(true)
      return
    }

    const user = await User.create({ email: 'live-yjs-server@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Live Yjs Server Workspace')
    const workspaceDocumentService = await app.container.make(WorkspaceDocumentService)
    const yjsServerService = await app.container.make(YjsServerService)

    const markerName = `Live marker ${crypto.randomUUID()}`
    const currentSnapshot = await workspaceDocumentService.readSnapshotBundle(workspace.id)
    const replacementSnapshot = await buildDocumentWithMarker(currentSnapshot, markerName)

    try {
      await yjsServerService.replaceDocument(workspace.id, replacementSnapshot, {
        reason: 'tests:yjs-server-live-roundtrip',
      })
    } catch (error) {
      if (error instanceof YjsServerDurabilityError && /404/i.test(error.message)) {
        throw new Error(
          'RUN_LIVE_YJS_SERVER_TESTS requires Yjs server R2 durability and backend notify endpoint configuration for the test backend host',
          { cause: error }
        )
      }

      throw error
    }

    const liveSnapshot = await workspaceDocumentService.readSnapshotBundle(workspace.id)

    const liveDocument = decodeWorkspaceSnapshotBundle(liveSnapshot)
    try {
      assert.isTrue(
        liveDocument.proxy.root.items.some((item) => item.kind === 'canvas' && item.name === markerName),
        'Live Yjs server document should contain marker canvas'
      )
    } finally {
      liveDocument.cleanup()
    }
  }).tags(['@db:commit'])
})
