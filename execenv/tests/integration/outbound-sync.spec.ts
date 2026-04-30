/**
 * Outbound sync tests (yDoc → Filesystem).
 *
 * Tests for hydrating filesystem from yDoc content.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { type WorkspaceConnection, type CanvasItem, type NodeItem } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { workspaceToFilesystem, ContentConverter, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

import { writeFSNode, clearDirectory } from '../../src/filesystem.js'
import {
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
  trackConnection,
  cleanupConnections,
  createTestSyncer,
  delay,
  resetWorkspaceToEmpty,
} from '../helpers/index.js'

describe('yDoc to Filesystem Sync (Outbound)', () => {
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
    console.error(`Created temp workspace: ${workspacePath}`)
  })

  afterEach(async () => {
    cleanupConnections(activeConnections)

    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to delete temp workspace: ${err}`)
    }
  })

  it('should hydrate filesystem with content created in yDoc', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

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

    // Create canvas with a node in yDoc
    const nodeId = `node-hydrate-${Date.now()}`
    const canvasId = `canvas-hydrate-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Hydration Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Note Created In YDoc',
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

    // Create BlockNote content in yDoc using ContentConverter
    const contentConverter = new ContentConverter()
    const testMarkdown = '# Created in YDoc\n\nThis content was created programmatically in yDoc.'
    const fragment = await contentConverter.createFragmentFromMarkdown(testMarkdown)

    connection.contentStore.setBlockNoteFragment(nodeId, fragment)

    await delay(500)

    // Now hydrate the filesystem
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify the .md file was created with correct content
    const notePath = path.join(workspacePath, 'hydration-test-canvas', 'note-created-in-ydoc.md')
    const fileExists = await fs
      .access(notePath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)

    const fileContent = await fs.readFile(notePath, 'utf-8')
    console.error(`Hydrated file content: ${fileContent}`)

    expect(fileContent).toContain('Created in YDoc')
    expect(fileContent).toContain('This content was created programmatically')
  })

  it('should reflect yDoc content changes in filesystem after re-hydration', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

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

    // Create canvas with a node
    const nodeId = `node-rehydrate-${Date.now()}`
    const canvasId = `canvas-rehydrate-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Rehydration Test Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Note To Rehydrate',
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

    // Create initial content
    const contentConverter = new ContentConverter()
    const initialMarkdown = '# Initial Content\n\nThis is the original content.'
    const fragment = await contentConverter.createFragmentFromMarkdown(initialMarkdown)
    connection.contentStore.setBlockNoteFragment(nodeId, fragment)

    await delay(500)

    // First hydration
    let fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify initial content
    const notePath = path.join(workspacePath, 'rehydration-test-canvas', 'note-to-rehydrate.md')
    let fileContent = await fs.readFile(notePath, 'utf-8')
    expect(fileContent).toContain('Initial Content')

    // Now update the content in yDoc (simulating UI edit)
    const updatedMarkdown = '# Updated Content\n\nThis content was modified in yDoc!'
    const updatedFragment = await contentConverter.createFragmentFromMarkdown(updatedMarkdown)
    connection.contentStore.setBlockNoteFragment(nodeId, updatedFragment)

    await delay(500)

    // Re-hydrate the filesystem
    fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify updated content
    fileContent = await fs.readFile(notePath, 'utf-8')
    console.error(`Re-hydrated file content: ${fileContent}`)

    expect(fileContent).toContain('Updated Content')
    expect(fileContent).toContain('This content was modified in yDoc')
    expect(fileContent).not.toContain('Initial Content')
  })

  it('should complete full two-way sync cycle: FS → yDoc → modify → FS', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

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

    // Step 1: Create empty canvas
    const canvasId = `canvas-twoway-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Two Way Sync Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Step 2: Hydrate filesystem (creates canvas directory)
    let fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Step 3: Create .md file in filesystem (FS → yDoc direction)
    const { syncer, contentConverter } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    const originalContent = '# Original from FS\n\nCreated in filesystem first.'
    const canvasDir = path.join(workspacePath, 'two-way-sync-canvas')
    const notePath = path.join(canvasDir, 'two-way-note.md')
    await fs.writeFile(notePath, originalContent)

    // Sync FS → yDoc
    const createResult = await syncer.syncChange({
      type: 'create',
      path: 'two-way-sync-canvas/two-way-note.md',
      content: originalContent,
    })

    expect(createResult.success).toBe(true)
    expect(createResult.action).toBe('created_node')
    const nodeId = createResult.nodeId!

    await delay(500)

    // Step 4: Verify content is in yDoc
    const fragmentAfterCreate = connection.contentStore.getBlockNoteFragment(nodeId)
    expect(fragmentAfterCreate).toBeDefined()

    const markdownAfterCreate = await contentConverter.fragmentToMarkdown(fragmentAfterCreate as any)
    expect(markdownAfterCreate).toContain('Original from FS')

    // Step 5: Modify content in yDoc (simulating UI edit)
    const modifiedContent = '# Modified in YDoc\n\nThis was edited in the UI after being created from FS.'
    const modifiedFragment = await contentConverter.createFragmentFromMarkdown(modifiedContent)
    connection.contentStore.setBlockNoteFragment(nodeId, modifiedFragment)

    await delay(500)

    // Step 6: Re-hydrate filesystem (yDoc → FS direction)
    fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Step 7: Verify filesystem has the modified content
    const finalFileContent = await fs.readFile(notePath, 'utf-8')
    console.error(`Final file content after two-way sync: ${finalFileContent}`)

    expect(finalFileContent).toContain('Modified in YDoc')
    expect(finalFileContent).toContain('edited in the UI')
    expect(finalFileContent).not.toContain('Original from FS')
  })

  it('should sync yDoc changes to second connection filesystem', async () => {
    // Connection 1: Create canvas and content
    const conn1 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    if (!conn1.proxy.root) {
      conn1.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [],
        edges: [],
      }
    }

    const nodeId = `node-cross-conn-${Date.now()}`
    const canvasId = `canvas-cross-conn-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Cross Connection Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Cross Connection Note',
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
    conn1.proxy.root.items.push(canvas)

    // Create content in conn1
    const contentConverter1 = new ContentConverter()
    const testContent =
      '# Cross Connection Content\n\nCreated in connection 1, should appear in connection 2 filesystem.'
    const fragment = await contentConverter1.createFragmentFromMarkdown(testContent)
    conn1.contentStore.setBlockNoteFragment(nodeId, fragment)

    await delay(1000) // Wait for Yjs server sync

    // Connection 2: Connect and hydrate filesystem
    const conn2 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Verify canvas synced to conn2
    const canvasInConn2 = conn2.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    expect(canvasInConn2).toBeDefined()
    const crossConnNodes = canvasInConn2.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(crossConnNodes.length).toBe(1)

    // Hydrate filesystem from conn2
    const fsTree = await workspaceToFilesystem(conn2.proxy, conn2.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Verify content was written to filesystem
    const notePath = path.join(workspacePath, 'cross-connection-canvas', 'cross-connection-note.md')
    const fileExists = await fs
      .access(notePath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)

    const fileContent = await fs.readFile(notePath, 'utf-8')
    console.error(`Cross-connection file content: ${fileContent}`)

    expect(fileContent).toContain('Cross Connection Content')
    expect(fileContent).toContain('should appear in connection 2')
  })

  it('should handle concurrent edits: FS edit while yDoc has changes', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

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

    // Create canvas with node
    const nodeId = `node-concurrent-${Date.now()}`
    const canvasId = `canvas-concurrent-${Date.now()}`

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Concurrent Edit Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'Concurrent Note',
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

    // Create initial content in yDoc
    const contentConverter = new ContentConverter()
    const initialContent = '# Initial\n\nStarting content.'
    const fragment = await contentConverter.createFragmentFromMarkdown(initialContent)
    connection.contentStore.setBlockNoteFragment(nodeId, fragment)

    await delay(500)

    // Hydrate filesystem
    let fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
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

    // Simulate: yDoc gets updated (e.g., by another user)
    const yDocUpdate = '# YDoc Version\n\nModified in yDoc.'
    const yDocFragment = await contentConverter.createFragmentFromMarkdown(yDocUpdate)
    connection.contentStore.setBlockNoteFragment(nodeId, yDocFragment)

    // Meanwhile, FS edit happens (sync from filesystem)
    const fsUpdate = '# FS Version\n\nModified in filesystem.'
    const notePath = path.join(workspacePath, 'concurrent-edit-canvas', 'concurrent-note.md')
    await fs.writeFile(notePath, fsUpdate)

    // Sync FS change to yDoc (FS wins in this scenario)
    const updateResult = await syncer.syncChange({
      type: 'update',
      path: 'concurrent-edit-canvas/concurrent-note.md',
      content: fsUpdate,
    })

    expect(updateResult.success).toBe(true)
    expect(updateResult.action).toBe('updated_content')

    await delay(500)

    // Verify yDoc now has FS version
    const finalFragment = connection.contentStore.getBlockNoteFragment(nodeId)
    const finalMarkdown = await contentConverter.fragmentToMarkdown(finalFragment as any)
    console.error(`Final markdown after concurrent edit: ${finalMarkdown}`)

    expect(finalMarkdown).toContain('FS Version')
    expect(finalMarkdown).toContain('Modified in filesystem')

    // Re-hydrate and verify FS still has correct content
    fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    const rehydratedContent = await fs.readFile(notePath, 'utf-8')
    expect(rehydratedContent).toContain('FS Version')
  })
})
