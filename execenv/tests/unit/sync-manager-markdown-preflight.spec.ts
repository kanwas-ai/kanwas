import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import pino from 'pino'
import * as Y from 'yjs'

import { PathMapper, createWorkspaceContentStore, type CanvasItem, type NodeItem } from 'shared'
import { ContentConverter, FilesystemSyncer, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

import { SyncManager } from '../../src/sync-manager.js'

const testLogger = pino({ level: 'silent' })

function createRootWithBlockNote(nodeId: string): CanvasItem {
  const blockNote: NodeItem = {
    kind: 'node',
    id: nodeId,
    name: 'Block Note',
    xynode: {
      id: nodeId,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
      measured: { width: 320, height: 180 },
    },
  }

  return {
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
    items: [blockNote],
  }
}

describe('SyncManager markdown preflight', () => {
  let workspacePath: string

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-manager-preflight-'))
  })

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true })
  })

  it('does not amplify blockNote line breaks across repeated file updates', async () => {
    const nodeId = 'block-note-node'
    const relativePath = 'Block-Note.md'
    const absolutePath = path.join(workspacePath, relativePath)

    const yDoc = new Y.Doc()
    const root = createRootWithBlockNote(nodeId)
    const contentStore = createWorkspaceContentStore(yDoc)

    const pathMapper = new PathMapper(testLogger)
    pathMapper.addMapping({
      path: relativePath,
      nodeId,
      canvasId: 'root',
      originalName: 'Block Note',
      type: 'node',
    })

    const contentConverter = new ContentConverter(testLogger)
    const initialFragment = await contentConverter.createFragmentFromMarkdown('> line 1\n> line 2')
    contentStore.setBlockNoteFragment(nodeId, initialFragment)

    const syncer = new FilesystemSyncer({
      proxy: { root } as any,
      yDoc,
      pathMapper,
      contentConverter,
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
      logger: testLogger,
    })

    const syncManager = new SyncManager({
      workspaceId: 'workspace-preflight-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    ;(syncManager as any).connection = {
      proxy: { root },
      contentStore,
      yDoc,
      disconnect: () => {},
    }
    ;(syncManager as any).pathMapper = pathMapper
    ;(syncManager as any).syncer = syncer
    ;(syncManager as any).contentConverter = contentConverter
    ;(syncManager as any).metadataManager = {
      handleSyncResult: async () => {},
    }
    ;(syncManager as any).markdownShadowByNodeId.set(nodeId, await contentConverter.fragmentToMarkdown(initialFragment))

    let stableMarkdown: string | null = null

    for (let iteration = 0; iteration < 5; iteration++) {
      const currentFragment = contentStore.getBlockNoteFragment(nodeId)
      expect(currentFragment).toBeDefined()
      const markdownBefore = await contentConverter.fragmentToMarkdown(currentFragment as Y.XmlFragment)

      await fs.writeFile(absolutePath, markdownBefore, 'utf-8')
      const result = await syncManager.handleFileChange('update', absolutePath)

      expect(result?.success).toBe(true)
      expect(['updated_content', 'no_op']).toContain(result?.action)

      const updatedFragment = contentStore.getBlockNoteFragment(nodeId)
      expect(updatedFragment).toBeDefined()
      const markdownAfter = await contentConverter.fragmentToMarkdown(updatedFragment as Y.XmlFragment)

      if (stableMarkdown === null) {
        stableMarkdown = markdownAfter
      } else {
        expect(markdownAfter).toBe(stableMarkdown)
      }
    }

    expect(stableMarkdown).not.toBeNull()
    expect(stableMarkdown).toContain('line 1\\\n> line 2')
  })

  it('preserves fenced code trailing backslashes across repeated file updates', async () => {
    const nodeId = 'block-note-code-fence-node'
    const relativePath = 'Block-Note-Code.md'
    const absolutePath = path.join(workspacePath, relativePath)

    const yDoc = new Y.Doc()
    const root = createRootWithBlockNote(nodeId)
    const contentStore = createWorkspaceContentStore(yDoc)

    const pathMapper = new PathMapper(testLogger)
    pathMapper.addMapping({
      path: relativePath,
      nodeId,
      canvasId: 'root',
      originalName: 'Block Note Code',
      type: 'node',
    })

    const contentConverter = new ContentConverter(testLogger)
    const initialFragment = await contentConverter.createFragmentFromMarkdown(
      '```text\nline with slash \\\nnext line\n```'
    )
    contentStore.setBlockNoteFragment(nodeId, initialFragment)

    const syncer = new FilesystemSyncer({
      proxy: { root } as any,
      yDoc,
      pathMapper,
      contentConverter,
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
      logger: testLogger,
    })

    const syncManager = new SyncManager({
      workspaceId: 'workspace-preflight-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    ;(syncManager as any).connection = {
      proxy: { root },
      contentStore,
      yDoc,
      disconnect: () => {},
    }
    ;(syncManager as any).pathMapper = pathMapper
    ;(syncManager as any).syncer = syncer
    ;(syncManager as any).contentConverter = contentConverter
    ;(syncManager as any).metadataManager = {
      handleSyncResult: async () => {},
    }
    ;(syncManager as any).markdownShadowByNodeId.set(nodeId, await contentConverter.fragmentToMarkdown(initialFragment))

    let stableMarkdown: string | null = null

    for (let iteration = 0; iteration < 5; iteration++) {
      const currentFragment = contentStore.getBlockNoteFragment(nodeId)
      expect(currentFragment).toBeDefined()
      const markdownBefore = await contentConverter.fragmentToMarkdown(currentFragment as Y.XmlFragment)

      await fs.writeFile(absolutePath, markdownBefore, 'utf-8')
      const result = await syncManager.handleFileChange('update', absolutePath)

      expect(result?.success).toBe(true)
      expect(['updated_content', 'no_op']).toContain(result?.action)

      const updatedFragment = contentStore.getBlockNoteFragment(nodeId)
      expect(updatedFragment).toBeDefined()
      const markdownAfter = await contentConverter.fragmentToMarkdown(updatedFragment as Y.XmlFragment)

      if (stableMarkdown === null) {
        stableMarkdown = markdownAfter
      } else {
        expect(markdownAfter).toBe(stableMarkdown)
      }
    }

    expect(stableMarkdown).not.toBeNull()
    expect(stableMarkdown).toContain('```text')
    expect(stableMarkdown).toContain('line with slash \\\nnext line')
  })

  it('does not amplify BlockNote list spacing across repeated file updates', async () => {
    const nodeId = 'block-note-list-node'
    const relativePath = 'Block-Note-List.md'
    const absolutePath = path.join(workspacePath, relativePath)
    const inputMarkdown = '# Title\n\n- one\n- two\n- three'

    const yDoc = new Y.Doc()
    const root = createRootWithBlockNote(nodeId)
    const contentStore = createWorkspaceContentStore(yDoc)

    const pathMapper = new PathMapper(testLogger)
    pathMapper.addMapping({
      path: relativePath,
      nodeId,
      canvasId: 'root',
      originalName: 'Block Note List',
      type: 'node',
    })

    const contentConverter = new ContentConverter(testLogger)
    const initialFragment = await contentConverter.createFragmentFromMarkdown(inputMarkdown)
    contentStore.setBlockNoteFragment(nodeId, initialFragment)
    const canonicalMarkdown = await contentConverter.fragmentToMarkdown(initialFragment)

    const syncer = new FilesystemSyncer({
      proxy: { root } as any,
      yDoc,
      pathMapper,
      contentConverter,
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
      logger: testLogger,
    })

    const syncManager = new SyncManager({
      workspaceId: 'workspace-preflight-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    ;(syncManager as any).connection = {
      proxy: { root },
      contentStore,
      yDoc,
      disconnect: () => {},
    }
    ;(syncManager as any).pathMapper = pathMapper
    ;(syncManager as any).syncer = syncer
    ;(syncManager as any).contentConverter = contentConverter
    ;(syncManager as any).metadataManager = {
      handleSyncResult: async () => {},
    }
    ;(syncManager as any).markdownShadowByNodeId.set(nodeId, await contentConverter.fragmentToMarkdown(initialFragment))

    let stableMarkdown: string | null = null

    for (let iteration = 0; iteration < 5; iteration++) {
      await fs.writeFile(absolutePath, inputMarkdown, 'utf-8')
      const result = await syncManager.handleFileChange('update', absolutePath)

      expect(result?.success).toBe(true)
      expect(['updated_content', 'no_op']).toContain(result?.action)

      const updatedFragment = contentStore.getBlockNoteFragment(nodeId)
      expect(updatedFragment).toBeDefined()
      const markdownAfter = await contentConverter.fragmentToMarkdown(updatedFragment as Y.XmlFragment)

      if (stableMarkdown === null) {
        stableMarkdown = markdownAfter
      } else {
        expect(markdownAfter).toBe(stableMarkdown)
      }
    }

    expect(stableMarkdown).toBe('# Title\n\n* one\n* two\n* three\n')
  })

  it('applies section intents for unchanged mapped markdown updates', async () => {
    const nodeId = 'block-note-placement-node'
    const relativePath = 'Block-Note-Placement.md'
    const absolutePath = path.join(workspacePath, relativePath)
    const placementPath = path.join('/tmp/kanwas-placement', `${relativePath}.json`)
    const inputMarkdown = '# Title\n\nBody'

    const yDoc = new Y.Doc()
    const root = createRootWithBlockNote(nodeId)
    const contentStore = createWorkspaceContentStore(yDoc)

    const pathMapper = new PathMapper(testLogger)
    pathMapper.addMapping({
      path: relativePath,
      nodeId,
      canvasId: 'root',
      originalName: 'Block Note Placement',
      type: 'node',
    })

    const contentConverter = new ContentConverter(testLogger)
    const initialFragment = await contentConverter.createFragmentFromMarkdown(inputMarkdown)
    contentStore.setBlockNoteFragment(nodeId, initialFragment)
    const canonicalMarkdown = await contentConverter.fragmentToMarkdown(initialFragment)

    const syncer = new FilesystemSyncer({
      proxy: { root } as any,
      yDoc,
      pathMapper,
      contentConverter,
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
      logger: testLogger,
    })

    const syncManager = new SyncManager({
      workspaceId: 'workspace-preflight-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    ;(syncManager as any).connection = {
      proxy: { root },
      contentStore,
      yDoc,
      disconnect: () => {},
    }
    ;(syncManager as any).pathMapper = pathMapper
    ;(syncManager as any).syncer = syncer
    ;(syncManager as any).contentConverter = contentConverter
    ;(syncManager as any).metadataManager = {
      handleSyncResult: async () => {},
    }
    ;(syncManager as any).markdownShadowByNodeId.set(nodeId, canonicalMarkdown)

    await fs.writeFile(absolutePath, canonicalMarkdown, 'utf-8')
    await fs.mkdir(path.dirname(placementPath), { recursive: true })
    await fs.writeFile(
      placementPath,
      JSON.stringify({ section: { mode: 'create', title: 'Overview', layout: 'horizontal', x: 120, y: 240 } }),
      'utf-8'
    )

    const result = await syncManager.handleFileChange('update', absolutePath)

    expect(result?.success).toBe(true)
    expect(result?.action).toBe('updated_content')
    expect((root.items[0] as NodeItem).xynode.data).toMatchObject({ sectionId: expect.any(String) })
    await expect(fs.access(placementPath)).rejects.toThrow()
  })

  it('keeps unchanged mapped markdown updates as no-op when no placement intent exists', async () => {
    const nodeId = 'block-note-noop-node'
    const relativePath = 'Block-Note-Noop.md'
    const absolutePath = path.join(workspacePath, relativePath)
    const inputMarkdown = '# Title\n\nBody'

    const yDoc = new Y.Doc()
    const root = createRootWithBlockNote(nodeId)
    const contentStore = createWorkspaceContentStore(yDoc)

    const pathMapper = new PathMapper(testLogger)
    pathMapper.addMapping({
      path: relativePath,
      nodeId,
      canvasId: 'root',
      originalName: 'Block Note Noop',
      type: 'node',
    })

    const contentConverter = new ContentConverter(testLogger)
    const initialFragment = await contentConverter.createFragmentFromMarkdown(inputMarkdown)
    contentStore.setBlockNoteFragment(nodeId, initialFragment)
    const canonicalMarkdown = await contentConverter.fragmentToMarkdown(initialFragment)

    const syncer = new FilesystemSyncer({
      proxy: { root } as any,
      yDoc,
      pathMapper,
      contentConverter,
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
      logger: testLogger,
    })

    const syncManager = new SyncManager({
      workspaceId: 'workspace-preflight-unit',
      yjsServerHost: 'localhost:1999',
      workspacePath,
      backendUrl: 'http://localhost:3333',
      authToken: 'test-token',
      userId: 'test-user',
      logger: testLogger,
    })

    ;(syncManager as any).connection = {
      proxy: { root },
      contentStore,
      yDoc,
      disconnect: () => {},
    }
    ;(syncManager as any).pathMapper = pathMapper
    ;(syncManager as any).syncer = syncer
    ;(syncManager as any).contentConverter = contentConverter
    ;(syncManager as any).metadataManager = {
      handleSyncResult: async () => {},
    }
    ;(syncManager as any).markdownShadowByNodeId.set(nodeId, canonicalMarkdown)

    await fs.writeFile(absolutePath, canonicalMarkdown, 'utf-8')

    const result = await syncManager.handleFileChange('update', absolutePath)

    expect(result?.success).toBe(true)
    expect(result?.action).toBe('no_op')
    expect((root.items[0] as NodeItem).xynode.data).not.toHaveProperty('sectionId')
  })
})
