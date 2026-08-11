import { test } from '@japa/runner'
import {
  OrganizationWorkspaceNotFoundError,
  WorkspaceOrganizationContextRequiredError,
  WorkspaceService,
} from '#services/workspace_service'
import DefaultWorkspaceTemplateService from '#services/default_workspace_template_service'
import Workspace from '#models/workspace'
import User from '#models/user'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { createHash } from 'node:crypto'
import {
  createWorkspaceContentStore,
  type BlockNoteNode,
  type CanvasItem,
  type ImageNodeData,
  type NodeItem,
} from 'shared'
import {
  loadWorkspaceYDoc,
  readWorkspaceDocumentBytes,
  readWorkspaceSnapshotBundle,
  saveWorkspaceYDoc,
} from '#tests/helpers/workspace_yjs'
import { createFakeImageBuffer } from '#tests/helpers/test_image'

test.group('WorkspaceService', () => {
  test('should create workspace with default structure', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    const workspace = await db.transaction(async (trx) => {
      return await workspaceService.createWorkspaceForUser(user.id, 'Test Workspace', trx)
    })

    assert.exists(workspace)
    assert.equal(workspace.name, 'Test Workspace')

    // Verify organization membership relationship
    const membership = await OrganizationMembership.query()
      .where('organization_id', workspace.organizationId)
      .where('user_id', user.id)
      .first()
    assert.exists(membership)
    assert.equal(membership!.role, 'admin')

    // Verify workspace document exists in the Yjs server durability store
    assert.isAbove(readWorkspaceDocumentBytes(workspace).byteLength, 0)

    // Verify workspace tree has the minimal default structure
    const document = loadWorkspaceYDoc(workspace)

    assert.exists(document.proxy.root)
    assert.equal(document.proxy.root.kind, 'canvas')

    // Filter items by kind
    const canvases = document.proxy.root.items.filter((i) => i.kind === 'canvas')
    const nodes = document.proxy.root.items.filter((i) => i.kind === 'node')

    assert.lengthOf(canvases, 0, 'Workspace tree should not create extra root canvases')

    assert.lengthOf(nodes, 1, 'Root should only include the instructions node')
    const instructionsNode = nodes.find((node) => node.name === 'instructions')
    assert.exists(instructionsNode)
    assert.equal(instructionsNode!.kind, 'node')

    const kanwasMarkers = collectKanwasMarkers(document.proxy.root)
    assert.lengthOf(kanwasMarkers, 1)
    assert.equal(kanwasMarkers[0].id, instructionsNode!.id)
    assert.equal(kanwasMarkers[0].xynode.data.systemNodeKind, 'kanwas_md')
    assert.isFalse(kanwasMarkers[0].xynode.data.explicitlyEdited)

    const contentStore = createWorkspaceContentStore(document.yDoc)
    assert.exists(contentStore.getBlockNoteFragment(kanwasMarkers[0].id))

    document.cleanup()
  })

  test('should create workspace with custom name', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    const workspace = await db.transaction(async (trx) => {
      return await workspaceService.createWorkspaceForUser(user.id, 'My Custom Workspace', trx)
    })

    assert.equal(workspace.name, 'My Custom Workspace')
  })

  test('should rollback on failure', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    try {
      await db.transaction(async (trx) => {
        await workspaceService.createWorkspaceForUser(user.id, 'Test Workspace', trx)

        // Simulate an error after workspace creation
        throw new Error('Simulated failure')
      })

      assert.fail('Should have thrown an error')
    } catch (error) {
      assert.equal((error as Error).message, 'Simulated failure')
    }

    // Verify no workspace was created
    const workspaces = await Workspace.all()
    assert.lengthOf(workspaces, 0)
  })

  test('should create workspaces for multiple users independently', async ({ assert }) => {
    const user1 = await User.create({
      email: 'user1@example.com',
      password: 'password123',
    })

    const user2 = await User.create({
      email: 'user2@example.com',
      password: 'password123',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    const workspace1 = await db.transaction(async (trx) => {
      return await workspaceService.createWorkspaceForUser(user1.id, 'Workspace 1', trx)
    })

    const workspace2 = await db.transaction(async (trx) => {
      return await workspaceService.createWorkspaceForUser(user2.id, 'Workspace 2', trx)
    })

    // Verify workspace 1
    const workspace1Membership = await OrganizationMembership.query()
      .where('organization_id', workspace1.organizationId)
      .where('user_id', user1.id)
      .first()
    assert.exists(workspace1Membership)
    assert.equal(workspace1Membership!.role, 'admin')
    assert.isAbove(readWorkspaceDocumentBytes(workspace1).byteLength, 0)

    // Verify workspace 2
    const workspace2Membership = await OrganizationMembership.query()
      .where('organization_id', workspace2.organizationId)
      .where('user_id', user2.id)
      .first()
    assert.exists(workspace2Membership)
    assert.equal(workspace2Membership!.role, 'admin')
    assert.isAbove(readWorkspaceDocumentBytes(workspace2).byteLength, 0)

    // Verify both workspaces have default structure
    const document1 = loadWorkspaceYDoc(workspace1)
    const doc1Canvases = document1.proxy.root.items.filter((i) => i.kind === 'canvas')
    const doc1Nodes = document1.proxy.root.items.filter((i) => i.kind === 'node')
    assert.lengthOf(doc1Canvases, 0)
    assert.lengthOf(doc1Nodes, 1)
    assert.exists(doc1Nodes.find((node) => node.name === 'instructions'))

    const document2 = loadWorkspaceYDoc(workspace2)
    const doc2Canvases = document2.proxy.root.items.filter((i) => i.kind === 'canvas')
    const doc2Nodes = document2.proxy.root.items.filter((i) => i.kind === 'node')
    assert.lengthOf(doc2Canvases, 0)
    assert.lengthOf(doc2Nodes, 1)
    assert.exists(doc2Nodes.find((node) => node.name === 'instructions'))

    document1.cleanup()
    document2.cleanup()
  })

  test('should require workspace context for member-only users in multiple organizations', async ({ assert }) => {
    const adminA = await User.create({
      email: 'admin-a@example.com',
      password: 'password123',
    })

    const adminB = await User.create({
      email: 'admin-b@example.com',
      password: 'password123',
    })

    const member = await User.create({
      email: 'member@example.com',
      password: 'password123',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    const workspaceA = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(adminA.id, 'Org A Workspace', trx)
    })

    const workspaceB = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(adminB.id, 'Org B Workspace', trx)
    })

    await OrganizationMembership.create({
      organizationId: workspaceA.organizationId,
      userId: member.id,
      role: 'member',
    })

    await OrganizationMembership.create({
      organizationId: workspaceB.organizationId,
      userId: member.id,
      role: 'member',
    })

    try {
      await db.transaction(async (trx) => {
        await workspaceService.createWorkspaceForUser(member.id, 'Ambiguous Workspace', trx)
      })
      assert.fail('Expected workspace creation to require explicit workspace context')
    } catch (error) {
      assert.instanceOf(error, WorkspaceOrganizationContextRequiredError)
      assert.equal(
        (error as Error).message,
        'Workspace context is required when user belongs to multiple organizations'
      )
    }
  })

  test('should fail to get organization workspace when organization has none', async ({ assert }) => {
    const organization = await Organization.create({
      name: 'No Members Org',
    })

    const workspaceService = await app.container.make(WorkspaceService)

    try {
      await db.transaction(async (trx) => {
        await workspaceService.getOrganizationWorkspace(organization.id, trx)
      })

      assert.fail('Expected organization without a workspace to fail lookup')
    } catch (error) {
      assert.instanceOf(error, OrganizationWorkspaceNotFoundError)
      assert.equal((error as Error).message, `Organization ${organization.id} does not have a workspace`)
    }
  })

  test('should use uploaded default workspace template when configured', async ({ assert }) => {
    const user = await User.create({
      email: 'template-user@example.com',
      password: 'password123',
    })

    const templateUser = await User.create({
      email: 'template-owner@example.com',
      password: 'password123',
    })

    const templateWorkspace = await db.transaction(async (trx) => {
      return app.container
        .make(WorkspaceService)
        .then((service) => service.createWorkspaceForUser(templateUser.id, 'Template Workspace', trx))
    })

    const defaultWorkspaceTemplateService = await app.container.make(DefaultWorkspaceTemplateService)
    const templateSnapshot = readWorkspaceSnapshotBundle(templateWorkspace)
    const templateFile = await defaultWorkspaceTemplateService.buildPortableTemplateFile({
      workspaceId: templateWorkspace.id,
      name: 'Template Workspace',
      snapshot: templateSnapshot,
    })
    await defaultWorkspaceTemplateService.replaceActiveTemplate(templateFile)

    const workspaceService = await app.container.make(WorkspaceService)
    const workspace = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(user.id, 'Uses Template', trx)
    })

    assert.deepEqual(readWorkspaceSnapshotBundle(workspace), templateSnapshot)

    const document = loadWorkspaceYDoc(workspace)

    try {
      const kanwasMarkers = collectKanwasMarkers(document.proxy.root)
      assert.lengthOf(kanwasMarkers, 1)
      assert.exists(createWorkspaceContentStore(document.yDoc).getBlockNoteFragment(kanwasMarkers[0].id))
    } finally {
      document.cleanup()
    }
  })

  test('should materialize uploaded default workspace template image assets for new workspaces', async ({ assert }) => {
    const user = await User.create({
      email: 'template-image-user@example.com',
      password: 'password123',
    })

    const templateUser = await User.create({
      email: 'template-image-owner@example.com',
      password: 'password123',
    })

    const templateWorkspace = await db.transaction(async (trx) => {
      return app.container
        .make(WorkspaceService)
        .then((service) => service.createWorkspaceForUser(templateUser.id, 'Image Template Workspace', trx))
    })

    const imageBuffer = createFakeImageBuffer()
    const sourceStoragePath = `files/${templateWorkspace.id}/root/hero.png`
    const contentHash = createHash('sha256').update(imageBuffer).digest('hex')
    let materializedStoragePath: string | null = null

    try {
      await drive.use().put(sourceStoragePath, imageBuffer, { contentType: 'image/png' })

      const templateDocument = loadWorkspaceYDoc(templateWorkspace)
      try {
        templateDocument.proxy.root.items.push({
          id: 'image-1',
          name: 'hero-image',
          kind: 'node',
          xynode: {
            id: 'image-1',
            type: 'image',
            position: { x: 240, y: 120 },
            data: {
              storagePath: sourceStoragePath,
              mimeType: 'image/png',
              size: imageBuffer.byteLength,
              contentHash,
            },
          },
        })
        await saveWorkspaceYDoc(templateWorkspace, templateDocument.yDoc)
      } finally {
        templateDocument.cleanup()
      }

      const defaultWorkspaceTemplateService = await app.container.make(DefaultWorkspaceTemplateService)
      const templateFile = await defaultWorkspaceTemplateService.buildPortableTemplateFile({
        workspaceId: templateWorkspace.id,
        name: 'Image Template Workspace',
        snapshot: readWorkspaceSnapshotBundle(templateWorkspace),
      })
      await defaultWorkspaceTemplateService.replaceActiveTemplate({
        ...templateFile,
        assets: templateFile.assets?.map((asset) => ({
          ...asset,
          mimeType: 'application/octet-stream',
          size: 999,
          contentHash: 'different-hash',
        })),
      })

      const workspaceService = await app.container.make(WorkspaceService)
      const workspace = await db.transaction(async (trx) => {
        return workspaceService.createWorkspaceForUser(user.id, 'Uses Image Template', trx)
      })

      const document = loadWorkspaceYDoc(workspace)
      try {
        const imageNode = document.proxy.root.items.find(
          (item) => item.kind === 'node' && item.xynode.type === 'image'
        ) as NodeItem | undefined

        assert.exists(imageNode)
        const imageData = imageNode!.xynode.data as ImageNodeData
        materializedStoragePath = imageData.storagePath
        assert.equal(imageData.storagePath, `files/${workspace.id}/root/hero-image.png`)
        assert.equal(imageData.mimeType, 'image/png')
        assert.equal(imageData.size, imageBuffer.byteLength)
        assert.equal(imageData.contentHash, contentHash)

        const materializedBytes = Buffer.from(await drive.use().getBytes(imageData.storagePath))
        assert.deepEqual(materializedBytes, imageBuffer)
      } finally {
        document.cleanup()
      }
    } finally {
      const defaultWorkspaceTemplateService = await app.container.make(DefaultWorkspaceTemplateService)
      await defaultWorkspaceTemplateService.clearActiveTemplate()
      await drive
        .use()
        .delete(sourceStoragePath)
        .catch(() => {})
      if (materializedStoragePath) {
        await drive
          .use()
          .delete(materializedStoragePath)
          .catch(() => {})
      }
    }
  })

  test('should fall back to the minimal workspace after clearing the uploaded template', async ({ assert }) => {
    const user = await User.create({
      email: 'fallback-user@example.com',
      password: 'password123',
    })

    const templateUser = await User.create({
      email: 'fallback-template-owner@example.com',
      password: 'password123',
    })

    const templateWorkspace = await db.transaction(async (trx) => {
      return app.container
        .make(WorkspaceService)
        .then((service) => service.createWorkspaceForUser(templateUser.id, 'Template Workspace', trx))
    })

    const defaultWorkspaceTemplateService = await app.container.make(DefaultWorkspaceTemplateService)
    const templateFile = await defaultWorkspaceTemplateService.buildPortableTemplateFile({
      workspaceId: templateWorkspace.id,
      name: 'Template Workspace',
      snapshot: readWorkspaceSnapshotBundle(templateWorkspace),
    })
    await defaultWorkspaceTemplateService.replaceActiveTemplate(templateFile)
    await defaultWorkspaceTemplateService.clearActiveTemplate()

    const workspaceService = await app.container.make(WorkspaceService)
    const workspace = await db.transaction(async (trx) => {
      return workspaceService.createWorkspaceForUser(user.id, 'Falls Back', trx)
    })

    const document = loadWorkspaceYDoc(workspace)

    try {
      const rootCanvases = document.proxy.root.items.filter((item) => item.kind === 'canvas')
      const rootNodes = document.proxy.root.items.filter((item) => item.kind === 'node')

      assert.lengthOf(rootCanvases, 0)
      assert.lengthOf(rootNodes, 1)

      const kanwasMarkers = collectKanwasMarkers(document.proxy.root)
      assert.lengthOf(kanwasMarkers, 1)
      assert.equal(kanwasMarkers[0].name, 'instructions')
      assert.isFalse(kanwasMarkers[0].xynode.data.explicitlyEdited)
      assert.exists(createWorkspaceContentStore(document.yDoc).getBlockNoteFragment(kanwasMarkers[0].id))
    } finally {
      document.cleanup()
    }
  })
})

type KanwasMarkerNode = NodeItem & { xynode: BlockNoteNode }

function collectKanwasMarkers(root: CanvasItem): KanwasMarkerNode[] {
  const markers: KanwasMarkerNode[] = []

  for (const item of root.items) {
    if (item.kind === 'canvas') {
      markers.push(...collectKanwasMarkers(item))
      continue
    }

    if (isKanwasMarkerNode(item)) {
      markers.push(item)
    }
  }

  return markers
}

function isKanwasMarkerNode(item: NodeItem): item is KanwasMarkerNode {
  return item.xynode.type === 'blockNote' && item.xynode.data.systemNodeKind === 'kanwas_md'
}
