import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import {
  createWorkspaceContentStore,
  type CanvasItem,
  type NodeItem,
  type WorkspaceDocument,
  type WorkspaceSnapshotBundle,
} from 'shared'
import { createWorkspaceSnapshotBundle } from 'shared/server'
import DefaultWorkspaceTemplateService, {
  InvalidDefaultWorkspaceTemplateError,
  type PortableWorkspaceTemplateImageAsset,
  UnsupportedDefaultWorkspaceTemplateError,
} from '#services/default_workspace_template_service'
import WorkspaceBootstrapService from '#services/workspace_bootstrap_service'
import { createFakeImageBuffer } from '#tests/helpers/test_image'

test.group('DefaultWorkspaceTemplateService', () => {
  test('accepts a minimal portable workspace snapshot', async ({ assert }) => {
    const workspaceBootstrapService = await app.container.make(WorkspaceBootstrapService)
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = await workspaceBootstrapService.createSnapshotBundle()

    assert.doesNotThrow(() => service.validatePortableSnapshot(snapshot))
  })

  test('rejects snapshots without a canonical kanwas marker', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems([createNode('note-1', 'notes', 'blockNote')])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected template without canonical marker to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'must contain exactly one canonical instructions note')
    }
  })

  test('rejects snapshots with multiple canonical kanwas markers', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createNode('kanwas-1', 'instructions', 'blockNote', { systemNodeKind: 'kanwas_md' }),
      createNode('kanwas-2', 'instructions-copy', 'blockNote', { systemNodeKind: 'kanwas_md' }),
    ])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected template with duplicate markers to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'found 2')
    }
  })

  test('rejects snapshots that mark a non-blockNote node as canonical kanwas', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createNode('kanwas-text', 'instructions', 'text', { systemNodeKind: 'kanwas_md' }),
    ])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected non-blockNote marker to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'must mark a blockNote instructions note')
    }
  })

  test('rejects snapshots whose canonical kanwas marker is missing its note fragment', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems(
      [createNode('kanwas-1', 'instructions', 'blockNote', { systemNodeKind: 'kanwas_md' })],
      { createNoteDocs: false }
    )

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected missing note fragment to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'missing its note fragment')
    }
  })

  test('builds portable template files with bundled image assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageBuffer = createFakeImageBuffer()
    const storagePath = 'files/source/root/hero.png'
    const imageAsset = createImageAsset('image-1', 'hero-image.png', imageBuffer)
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      {
        id: 'image-1',
        name: 'hero-image',
        kind: 'node',
        xynode: {
          id: 'image-1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            storagePath,
            mimeType: imageAsset.mimeType,
            size: imageAsset.size,
            contentHash: imageAsset.contentHash,
          },
        },
      },
    ])

    try {
      await drive.use().put(storagePath, imageBuffer, { contentType: 'image/png' })

      const template = await service.buildPortableTemplateFile({
        workspaceId: 'source-workspace',
        name: 'Image Template',
        snapshot,
      })

      assert.lengthOf(template.assets ?? [], 1)
      assert.deepEqual(template.assets?.[0], imageAsset)
    } finally {
      await drive
        .use()
        .delete(storagePath)
        .catch(() => {})
    }
  })

  test('accepts image nodes with bundled assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const storagePath = 'files/source/root/hero.png'
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', storagePath, imageAsset),
    ])

    assert.doesNotThrow(() => service.validatePortableSnapshot(snapshot, [imageAsset]))
  })

  test('rejects image nodes without bundled assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', imageAsset),
    ])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected image nodes without assets to be rejected')
    } catch (error) {
      assert.instanceOf(error, UnsupportedDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'missing bundled image asset')
    }
  })

  test('rejects duplicate bundled image assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', imageAsset),
    ])

    try {
      service.validatePortableSnapshot(snapshot, [imageAsset, imageAsset])
      assert.fail('Expected duplicate image assets to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'duplicate bundled image asset image-1')
    }
  })

  test('rejects unreferenced bundled image assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const extraAsset = createImageAsset('image-2', 'extra-image.png')
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', imageAsset),
    ])

    try {
      service.validatePortableSnapshot(snapshot, [imageAsset, extraAsset])
      assert.fail('Expected unreferenced image assets to be rejected')
    } catch (error) {
      assert.instanceOf(error, UnsupportedDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'Bundled image asset image-2 is not referenced')
    }
  })

  test('accepts image asset metadata mismatches and normalizes bundled asset metadata', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const mismatchedAsset: PortableWorkspaceTemplateImageAsset = {
      ...imageAsset,
      mimeType: 'application/octet-stream',
      size: 999,
      contentHash: 'different-hash',
    }
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', {
        ...imageAsset,
        contentHash: 'different-hash',
      }),
    ])

    const parsed = service.parsePortableTemplateFile({
      version: 1,
      name: 'Image Template',
      exportedAt: new Date().toISOString(),
      sourceWorkspaceId: 'source-workspace',
      snapshot,
      assets: [mismatchedAsset],
    })

    assert.equal(parsed.assets?.[0].mimeType, imageAsset.mimeType)
    assert.equal(parsed.assets?.[0].size, imageAsset.size)
    assert.equal(parsed.assets?.[0].contentHash, imageAsset.contentHash)
  })

  test('rejects malformed bundled image assets', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const imageAsset = createImageAsset('image-1', 'hero-image.png')
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', imageAsset),
    ])

    try {
      service.parsePortableTemplateFile({
        version: 1,
        name: 'Bad Image Template',
        exportedAt: new Date().toISOString(),
        sourceWorkspaceId: 'source-workspace',
        snapshot,
        assets: [{ ...imageAsset, dataBase64: 'not base64!' }],
      })
      assert.fail('Expected malformed image asset to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'dataBase64')
    }
  })

  test('accepts arbitrary bundled bytes when the asset has supported image metadata', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const bytes = Buffer.from('not an image')
    const imageAsset: PortableWorkspaceTemplateImageAsset = {
      kind: 'image',
      nodeId: 'image-1',
      filename: 'hero-image.png',
      mimeType: 'image/png',
      size: bytes.byteLength,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      dataBase64: bytes.toString('base64'),
    }
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createImageNode('image-1', 'hero-image', 'files/source/root/hero.png', imageAsset),
    ])

    assert.doesNotThrow(() => service.validatePortableSnapshot(snapshot, [imageAsset]))
  })

  test('rejects snapshots with unsupported binary nodes', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems([
      createCanonicalKanwasNode(),
      createNode('file-1', 'report', 'file', {
        storagePath: 'files/source/root/report.pdf',
        mimeType: 'application/pdf',
        size: 123,
        originalFilename: 'report.pdf',
        contentHash: 'hash',
      }),
      createNode('audio-1', 'recording', 'audio', {
        storagePath: 'files/source/root/recording.mp3',
        mimeType: 'audio/mpeg',
        size: 123,
        originalFilename: 'recording.mp3',
        contentHash: 'hash',
      }),
    ])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected unsupported binary nodes to be rejected')
    } catch (error) {
      assert.instanceOf(error, UnsupportedDefaultWorkspaceTemplateError)
      assert.include((error as Error).message, 'unsupported node type "file"')
      assert.include((error as Error).message, 'unsupported node type "audio"')
    }
  })

  test('rejects links with preview images', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)
    const snapshot = createWorkspaceSnapshotWithRootItems([
      {
        id: 'link-1',
        name: 'docs-link',
        kind: 'node',
        xynode: {
          id: 'link-1',
          type: 'link',
          position: { x: 0, y: 0 },
          data: {
            url: 'https://example.com',
            loadingStatus: 'loaded',
            imageStoragePath: 'files/source/root/link-preview.png',
          },
        },
      },
    ])

    try {
      service.validatePortableSnapshot(snapshot)
      assert.fail('Expected link preview images to be rejected')
    } catch (error) {
      assert.instanceOf(error, UnsupportedDefaultWorkspaceTemplateError)
    }
  })

  test('rejects malformed template envelopes', async ({ assert }) => {
    const service = await app.container.make(DefaultWorkspaceTemplateService)

    try {
      service.parsePortableTemplateFile({ version: 1, name: 'Bad Template', exportedAt: 'nope' })
      assert.fail('Expected malformed template envelope to be rejected')
    } catch (error) {
      assert.instanceOf(error, InvalidDefaultWorkspaceTemplateError)
    }
  })
})

function createWorkspaceSnapshotWithRootItems(
  items: WorkspaceDocument['root']['items'],
  options: { createNoteDocs?: boolean } = {}
): WorkspaceSnapshotBundle {
  const yDoc = new Y.Doc()
  const contentStore = createWorkspaceContentStore(yDoc)
  const { bootstrap, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  try {
    bootstrap({
      root: {
        id: 'root',
        name: '',
        kind: 'canvas',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        edges: [],
        items,
      },
    })

    if (options.createNoteDocs !== false) {
      for (const noteId of collectBlockNoteIds(items)) {
        contentStore.createNoteDoc(noteId, 'blockNote')
      }
    }

    return createWorkspaceSnapshotBundle(yDoc)
  } finally {
    dispose()
    yDoc.destroy()
  }
}

function createCanonicalKanwasNode(): NodeItem {
  return createNode('kanwas-1', 'instructions', 'blockNote', { systemNodeKind: 'kanwas_md' })
}

function createImageAsset(
  nodeId: string,
  filename: string,
  imageBuffer: Buffer = createFakeImageBuffer()
): PortableWorkspaceTemplateImageAsset {
  return {
    kind: 'image',
    nodeId,
    filename,
    mimeType: 'image/png',
    size: imageBuffer.byteLength,
    contentHash: createHash('sha256').update(imageBuffer).digest('hex'),
    dataBase64: imageBuffer.toString('base64'),
  }
}

function createImageNode(
  id: string,
  name: string,
  storagePath: string,
  asset: PortableWorkspaceTemplateImageAsset
): NodeItem {
  return createNode(id, name, 'image', {
    storagePath,
    mimeType: asset.mimeType,
    size: asset.size,
    contentHash: asset.contentHash,
  })
}

function createNode(
  id: string,
  name: string,
  type: NodeItem['xynode']['type'],
  data: Record<string, unknown> = {}
): NodeItem {
  return {
    id,
    name,
    kind: 'node',
    xynode: {
      id,
      type,
      position: { x: 0, y: 0 },
      data,
    } as NodeItem['xynode'],
  }
}

function collectBlockNoteIds(items: Array<NodeItem | CanvasItem>): string[] {
  const noteIds: string[] = []

  for (const item of items) {
    if (item.kind === 'canvas') {
      noteIds.push(...collectBlockNoteIds(item.items))
      continue
    }

    if (item.xynode.type === 'blockNote') {
      noteIds.push(item.id)
    }
  }

  return noteIds
}
