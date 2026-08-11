import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import Workspace from '#models/workspace'
import YjsServerService, { YjsServerDurabilityError } from '#services/yjs_server_service'
import { createTestWorkspace } from '#tests/helpers/workspace'
import { loadWorkspaceYDoc, readWorkspaceSnapshotBundle, saveWorkspaceYDoc } from '#tests/helpers/workspace_yjs'
import MockYjsServerService from '#tests/mocks/yjs_server_service'
import type { WorkspaceSnapshotBundle } from 'shared'

test.group('Embed bootstrap', (group) => {
  group.each.teardown(() => {
    app.container.swap(YjsServerService, () => new MockYjsServerService() as any)
  })

  test('should reject bootstrap without template', async ({ client }) => {
    const response = await client.post('/embed/bootstrap').json({})

    response.assertStatus(422)
  })

  test('should reject bootstrap when template workspace is not flagged as embed template', async ({ client }) => {
    const templateOwner = await User.create({
      email: 'private-workspace@example.com',
      password: 'password123',
    })

    const privateWorkspace = await createTestWorkspace(templateOwner, 'Private Workspace')

    const response = await client.post('/embed/bootstrap').json({
      templateId: privateWorkspace.id.replace(/-/g, ''),
    })

    response.assertStatus(404)
  })

  test('should clone template workspace document', async ({ client, assert }) => {
    const templateOwner = await User.create({
      email: 'template@example.com',
      password: 'password123',
    })

    const templateWorkspace = await createTestWorkspace(templateOwner, 'Template Workspace')
    templateWorkspace.isEmbedTemplate = true
    await templateWorkspace.save()
    const { proxy, yDoc, cleanup } = loadWorkspaceYDoc(templateWorkspace)
    proxy.root = {
      kind: 'canvas',
      id: 'root',
      name: '',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'canvas',
          id: 'template-canvas',
          name: 'Template Canvas',
          xynode: { id: 'template-canvas', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
          edges: [],
          items: [],
        },
      ],
    }
    await saveWorkspaceYDoc(templateWorkspace, yDoc)
    cleanup()

    const response = await client.post('/embed/bootstrap').json({
      templateId: templateWorkspace.id.replace(/-/g, ''),
    })

    response.assertStatus(200)

    const createdWorkspace = await Workspace.findOrFail(response.body().workspaceId)
    assert.deepEqual(readWorkspaceSnapshotBundle(createdWorkspace), readWorkspaceSnapshotBundle(templateWorkspace))
    assert.equal(response.body().workspace.name, templateWorkspace.name)
  })

  test('should return 404 when template workspace does not exist', async ({ client }) => {
    const response = await client.post('/embed/bootstrap').json({
      templateId: randomUUID(),
    })

    response.assertStatus(404)
  })

  test('should return 500 and compensate created guest resources when template persistence fails', async ({
    client,
    assert,
  }) => {
    const templateOwner = await User.create({
      email: 'template-fail@example.com',
      password: 'password123',
    })

    const templateWorkspace = await createTestWorkspace(templateOwner, 'Template Workspace')
    templateWorkspace.isEmbedTemplate = true
    await templateWorkspace.save()

    app.container.swap(YjsServerService, () => {
      const mockYjsServerService = new MockYjsServerService()

      return {
        async replaceDocument(workspaceId: string, document: WorkspaceSnapshotBundle, options?: { reason?: string }) {
          if (options?.reason === 'embed-bootstrap-template') {
            throw new YjsServerDurabilityError('mock Yjs server failure')
          }

          await mockYjsServerService.replaceDocument(workspaceId, document, options)
        },
      } as unknown as YjsServerService
    })

    const beforeWorkspaceCount = await Workspace.query().count('* as total')
    const beforeUserCount = await User.query().count('* as total')

    const response = await client.post('/embed/bootstrap').json({
      templateId: templateWorkspace.id.replace(/-/g, ''),
    })

    response.assertStatus(500)

    const afterWorkspaceCount = await Workspace.query().count('* as total')
    const afterUserCount = await User.query().count('* as total')

    assert.equal(Number(afterWorkspaceCount[0].$extras.total), Number(beforeWorkspaceCount[0].$extras.total))
    assert.equal(Number(afterUserCount[0].$extras.total), Number(beforeUserCount[0].$extras.total))
  })
})
