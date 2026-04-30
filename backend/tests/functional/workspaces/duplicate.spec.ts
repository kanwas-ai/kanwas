import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import User from '#models/user'
import Workspace from '#models/workspace'
import YjsServerService, { YjsServerDurabilityError } from '#services/yjs_server_service'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { loadWorkspaceYDoc, readWorkspaceSnapshotBundle, saveWorkspaceYDoc } from '#tests/helpers/workspace_yjs'
import MockYjsServerService from '#tests/mocks/yjs_server_service'

test.group('POST /workspaces/:id/duplicate', (group) => {
  group.each.teardown(() => {
    app.container.swap(YjsServerService, () => new MockYjsServerService() as any)
  })

  test('duplicates workspace content from live source', async ({ client, assert }) => {
    const user = await User.create({ email: 'duplicate@example.com', password: 'password123' })
    const sourceWorkspace = await createTestWorkspace(user, 'Source Workspace')

    const { proxy, yDoc, cleanup } = loadWorkspaceYDoc(sourceWorkspace)
    proxy.root.items.push({
      kind: 'canvas',
      id: 'dup-canvas',
      name: 'Duplicated Canvas',
      xynode: { id: 'dup-canvas', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [],
    })
    await saveWorkspaceYDoc(sourceWorkspace, yDoc)
    cleanup()

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value
    const response = await client.post(`/workspaces/${sourceWorkspace.id}/duplicate`).bearerToken(token)

    response.assertStatus(200)

    const duplicatedWorkspace = await Workspace.findOrFail(response.body().id)
    assert.deepEqual(readWorkspaceSnapshotBundle(duplicatedWorkspace), readWorkspaceSnapshotBundle(sourceWorkspace))
  })

  test('returns 500 and compensates when Yjs server persistence fails', async ({ client, assert }) => {
    const user = await User.create({ email: 'duplicate-fail@example.com', password: 'password123' })
    const sourceWorkspace = await createTestWorkspace(user, 'Source Workspace')

    const beforeCount = await Workspace.query()
      .where('organization_id', sourceWorkspace.organizationId)
      .count('* as total')

    app.container.swap(YjsServerService, () => {
      return {
        async replaceDocument() {
          throw new YjsServerDurabilityError('mock durability failure')
        },
      } as unknown as YjsServerService
    })

    const loginResponse = await client.post('/auth/login').json({
      email: user.email,
      password: 'password123',
    })

    const token = loginResponse.body().value
    const response = await client.post(`/workspaces/${sourceWorkspace.id}/duplicate`).bearerToken(token)

    response.assertStatus(500)

    const afterCount = await Workspace.query()
      .where('organization_id', sourceWorkspace.organizationId)
      .count('* as total')
    assert.equal(Number(afterCount[0].$extras.total), Number(beforeCount[0].$extras.total))
  })
})
