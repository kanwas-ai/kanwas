/**
 * File content sync tests.
 *
 * Tests for creating, updating, and deleting nodes via .md files.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { type WorkspaceConnection, type CanvasItem, type NodeItem } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { ContentConverter, workspaceToFilesystem, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

import { writeFSNode, clearDirectory } from '../../src/filesystem.js'
import { FileWatcher, type FileChangeEvent } from '../../src/watcher.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  trackWatcher,
  cleanupConnections,
  cleanupWatchers,
  createTestSyncer,
  delay,
  resetWorkspaceToEmpty,
} from '../helpers/index.js'

async function seedBlockNoteContent(connection: WorkspaceConnection, nodeId: string, markdown: string): Promise<void> {
  const contentConverter = new ContentConverter()
  const fragment = await contentConverter.createFragmentFromMarkdown(markdown)
  connection.contentStore.setBlockNoteFragment(nodeId, fragment)
}

describe('File Content Sync', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeConnections: WorkspaceConnection[] = []
  const activeWatchers: FileWatcher[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-test-'))
    console.error(`Created temp workspace: ${workspacePath}`)
  })

  afterEach(async () => {
    await cleanupWatchers(activeWatchers)
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to delete temp workspace: ${err}`)
    }
  })

  it('should create node when .md file is added to canvas', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create an empty canvas first
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvasId = `canvas-file-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'File Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Set up syncer
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          console.error(`[FileWatcher] ${event.type}: ${event.path}`)

          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
            return
          }

          let content: string | undefined
          if (event.type !== 'delete' && !event.isDirectory) {
            try {
              content = await fs.readFile(event.path, 'utf-8')
            } catch {
              // Ignore
            }
          }

          await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })
        },
        onReady: () => console.error('[FileWatcher] Ready'),
        onError: (err) => console.error('[FileWatcher] Error:', err),
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    // Create a new .md file
    const canvasDir = path.join(workspacePath, 'file-test-canvas')
    const newNotePath = path.join(canvasDir, 'new-note.md')
    const newNoteContent = '# New Note\n\nThis is a test note.'
    await fs.writeFile(newNotePath, newNoteContent)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify node was added to canvas
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item) => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const nodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('new-note')
    expect(nodes[0].xynode.type).toBe('blockNote')
  })

  it('should update node content when .md file is modified', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create canvas with a node
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const nodeId = `node-update-${Date.now()}`
    const canvasId = `canvas-update-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Update Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Note To Update',
          xynode: {
            id: nodeId,
            type: 'blockNote',
            position: { x: 0, y: 0 },
            data: {},
            measured: { width: 300, height: 200 },
          },
        },
      ],
    }
    connection.proxy.root.items.push(canvas)

    await seedBlockNoteContent(connection, nodeId, '# Note To Update\n\nOriginal content.')

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Set up syncer
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          console.error(`[FileWatcher] ${event.type}: ${event.path}`)

          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
            return
          }

          let content: string | undefined
          if (event.type !== 'delete' && !event.isDirectory) {
            try {
              content = await fs.readFile(event.path, 'utf-8')
            } catch {
              // Ignore
            }
          }

          await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })
        },
        onReady: () => console.error('[FileWatcher] Ready'),
        onError: (err) => console.error('[FileWatcher] Error:', err),
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    // Update the file
    const notePath = path.join(workspacePath, 'update-test-canvas', 'note-to-update.md')
    const updatedContent = '# Updated Title\n\nThis content was updated!'
    await fs.writeFile(notePath, updatedContent)

    // Wait for watcher to detect and sync
    await delay(2000)

    const fragment = connection.contentStore.getBlockNoteFragment(nodeId)
    expect(fragment).toBeDefined()

    const contentConverter = new ContentConverter()
    const markdown = await contentConverter.fragmentToMarkdown(fragment!)

    expect(markdown).toContain('Updated Title')
    expect(markdown).toContain('This content was updated!')
  })

  it('should delete node when .md file is removed', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create canvas with a node (using just structure, no BlockNote content)
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const nodeId = `node-delete-${Date.now()}`
    const canvasId = `canvas-delete-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Delete Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Note To Delete',
          xynode: {
            id: nodeId,
            type: 'blockNote',
            position: { x: 0, y: 0 },
            data: {},
            measured: { width: 300, height: 200 },
          },
        },
      ],
    }
    connection.proxy.root.items.push(canvas)

    await seedBlockNoteContent(connection, nodeId, '# Note To Delete\n\nSome content')

    await delay(500)

    // Hydrate filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    const canvasDir = path.join(workspacePath, 'delete-test-canvas')

    // Set up syncer
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          console.error(`[FileWatcher] ${event.type}: ${event.path}`)

          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
            return
          }

          let content: string | undefined
          if (event.type !== 'delete' && !event.isDirectory) {
            try {
              content = await fs.readFile(event.path, 'utf-8')
            } catch {
              // Ignore
            }
          }

          await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })
        },
        onReady: () => console.error('[FileWatcher] Ready'),
        onError: (err) => console.error('[FileWatcher] Error:', err),
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    // Verify file exists
    const notePath = path.join(canvasDir, 'note-to-delete.md')
    expect(
      await fs
        .access(notePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    // Delete the file
    await fs.unlink(notePath)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify node was removed
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const nodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(nodes.length).toBe(0)
  })
})

describe('Canvas Deletion', () => {
  let testEnv: TestEnvironment
  let workspacePath: string
  const activeConnections: WorkspaceConnection[] = []

  beforeAll(async () => {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
    const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)

    testEnv = await setupTestEnvironment()
  }, 20000)

  beforeEach(async () => {
    await resetWorkspaceToEmpty(testEnv.workspaceId, testEnv.yjsServerHost)
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-test-'))
  })

  afterEach(async () => {
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should delete canvas when canvas directory is removed', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create a canvas
    if (!connection.proxy.root) {
      connection.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const canvasId = `canvas-del-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Canvas To Delete',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Create canvas directory manually (avoid workspaceToFilesystem due to BlockNote issues from previous tests)
    const canvasDir = path.join(workspacePath, 'canvas-to-delete')
    await fs.mkdir(canvasDir, { recursive: true })

    // Set up syncer
    const { syncer } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Verify canvas exists before deletion
    expect(
      await fs
        .access(canvasDir)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    // Delete the canvas directory
    await fs.rm(canvasDir, { recursive: true, force: true })

    // Sync the deletion
    const result = await syncer.syncChange({
      type: 'delete',
      path: 'canvas-to-delete',
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('deleted_canvas')
    expect(result.canvasId).toBe(canvasId)

    // Verify canvas was removed from workspace
    const deletedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    expect(deletedCanvas).toBeUndefined()
  })
})
