import { test } from '@japa/runner'
import sinon from 'sinon'
import app from '@adonisjs/core/services/app'
import WorkspaceBootstrapService from '#services/workspace_bootstrap_service'
import { createWorkspaceContentStore } from 'shared'
import { NODE_LAYOUT } from 'shared/constants'
import { ContentConverter } from 'shared/server'
import { decodeWorkspaceSnapshotBundle } from '#tests/helpers/workspace_yjs'

test.group('WorkspaceBootstrapService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('createSnapshotBundle builds root canvas with expected starter nodes', async ({ assert }) => {
    const service = await app.container.make(WorkspaceBootstrapService)
    const snapshot = await service.createSnapshotBundle()
    const { proxy, cleanup } = decodeWorkspaceSnapshotBundle(snapshot)

    try {
      assert.exists(proxy.root)
      assert.equal(proxy.root.kind, 'canvas')

      const rootNodes = proxy.root.items.filter((item) => item.kind === 'node')
      const rootCanvases = proxy.root.items.filter((item) => item.kind === 'canvas')

      assert.lengthOf(rootCanvases, 0)

      const instructionsNode = rootNodes.find((node) => node.name === 'instructions')
      assert.exists(instructionsNode)
      assert.equal(instructionsNode!.xynode.type, 'blockNote')
      assert.deepEqual(instructionsNode!.xynode.position, {
        x: NODE_LAYOUT.INITIAL_POSITION.x + NODE_LAYOUT.WIDTH + NODE_LAYOUT.GAP,
        y: NODE_LAYOUT.INITIAL_POSITION.y,
      })
      if (instructionsNode!.xynode.type === 'blockNote') {
        assert.equal(instructionsNode!.xynode.data.systemNodeKind, 'kanwas_md')
        assert.isFalse(instructionsNode!.xynode.data.explicitlyEdited)
      }
      assert.lengthOf(rootNodes, 1)
    } finally {
      cleanup()
    }
  })

  test('createSnapshotBundle seeds instructions markdown', async ({ assert }) => {
    const service = await app.container.make(WorkspaceBootstrapService)
    const snapshot = await service.createSnapshotBundle()
    const { proxy, yDoc, cleanup } = decodeWorkspaceSnapshotBundle(snapshot)
    const contentStore = createWorkspaceContentStore(yDoc)

    try {
      const instructionsNode = proxy.root.items.find((item) => item.kind === 'node' && item.name === 'instructions')
      assert.exists(instructionsNode)

      const fragment = contentStore.getBlockNoteFragment(instructionsNode!.id)
      assert.exists(fragment)

      const converter = new ContentConverter()
      const instructionsMarkdown = await converter.fragmentToMarkdown(fragment!)
      assert.include(instructionsMarkdown, '# Instructions')

      assert.isUndefined(yDoc.share.get('editors'))
    } finally {
      cleanup()
    }
  })

  test('createSnapshotBundle seeds attached note fragments in place', async ({ assert }) => {
    const updateFragmentSpy = sinon.spy(ContentConverter.prototype, 'updateFragmentFromMarkdown')
    sinon
      .stub(ContentConverter.prototype, 'createFragmentFromMarkdown')
      .rejects(new Error('bootstrap should not create detached fragments'))

    const service = await app.container.make(WorkspaceBootstrapService)

    await service.createSnapshotBundle()

    assert.isAbove(updateFragmentSpy.callCount, 0)

    const [fragment, , context] = updateFragmentSpy.firstCall.args as [
      { doc: object | null },
      string,
      { nodeId: string; source: string },
    ]

    assert.exists(fragment.doc)
    assert.equal(context.source, 'workspace-bootstrap')
    assert.isString(context.nodeId)
  })

  test('createSnapshotBundle stamps creation audit metadata with owner actor', async ({ assert }) => {
    const service = await app.container.make(WorkspaceBootstrapService)
    const ownerUserId = crypto.randomUUID()

    const snapshot = await service.createSnapshotBundle({ ownerUserId })
    const { proxy, cleanup } = decodeWorkspaceSnapshotBundle(snapshot)

    try {
      const actor = `user:${ownerUserId}`

      const rootAudit = proxy.root.xynode.data.audit
      assert.equal(rootAudit?.createdBy, actor)
      assert.equal(rootAudit?.updatedBy, actor)

      const instructionsNode = proxy.root.items.find((item) => item.kind === 'node' && item.name === 'instructions')
      assert.exists(instructionsNode)
      assert.equal(instructionsNode?.xynode.data.audit?.createdBy, actor)
      assert.equal(instructionsNode?.xynode.data.audit?.updatedBy, actor)
    } finally {
      cleanup()
    }
  })
})
