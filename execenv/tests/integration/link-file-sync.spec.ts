/**
 * Link file sync integration tests.
 *
 * Tests for creating, updating, and deleting LinkNodes via .url.yaml files.
 * Unlike binary files, links don't need backend storage - they're just YAML metadata.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import yaml from 'yaml'
import crypto from 'crypto'

import {
  type WorkspaceConnection,
  type CanvasItem,
  type NodeItem,
  type LinkNodeData,
  LINK_IFRAME_LAYOUT,
  LINK_NODE_LAYOUT,
  NODE_NAME_HEIGHT,
} from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { workspaceToFilesystem, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

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

describe('Link File Sync (.url.yaml)', () => {
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
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'execenv-link-test-'))
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

  it('should create link node when .url.yaml file is added', async () => {
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

    const canvasId = `canvas-link-create-${Date.now()}`
    const canvasName = 'link-create-test'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
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

    // Set up syncer (links don't need real file handlers)
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

    // Create a .url.yaml file
    const canvasDir = path.join(workspacePath, canvasName)
    const linkFilePath = path.join(canvasDir, 'example-site.url.yaml')
    const linkContent = yaml.stringify({
      url: 'https://example.com',
      title: 'Example Domain',
      description: 'This is an example website',
      siteName: 'Example',
      displayMode: 'iframe',
    })
    await fs.writeFile(linkFilePath, linkContent)

    console.error(`Wrote .url.yaml to: ${linkFilePath}`)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify LinkNode was added to canvas
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item) => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const nodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')

    expect(nodes.length).toBe(1)
    expect(nodes[0].name).toBe('example-site')
    expect(nodes[0].xynode.type).toBe('link')

    const linkData = nodes[0].xynode.data as LinkNodeData
    expect(linkData.url).toBe('https://example.com')
    expect(linkData.title).toBe('Example Domain')
    expect(linkData.description).toBe('This is an example website')
    expect(linkData.siteName).toBe('Example')
    expect(linkData.displayMode).toBe('iframe')
    expect(linkData.loadingStatus).toBe('pending')
    expect(nodes[0].xynode.measured).toBeUndefined()

    console.error(`Created link node: ${JSON.stringify(nodes[0])}`)
  })

  it('should update link node when .url.yaml is modified', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create canvas with a link node
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

    const nodeId = `node-link-update-${Date.now()}`
    const canvasId = `canvas-link-update-${Date.now()}`
    const canvasName = 'link-update-test'

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'link-to-update',
          xynode: {
            id: nodeId,
            type: 'link',
            position: { x: 0, y: 0 },
            data: {
              url: 'https://old-url.com',
              loadingStatus: 'pending',
            } as LinkNodeData,
            measured: LINK_NODE_LAYOUT.DEFAULT_MEASURED,
          },
        },
      ],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Create filesystem structure manually
    const canvasDir = path.join(workspacePath, canvasName)
    await fs.mkdir(canvasDir, { recursive: true })
    await fs.writeFile(path.join(canvasDir, 'link-to-update.url.yaml'), yaml.stringify({ url: 'https://old-url.com' }))

    // Set up syncer
    const { syncer, pathMapper } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Manually register the mapping since we created the file manually
    pathMapper.addMapping({
      path: `${canvasName}/link-to-update.url.yaml`,
      nodeId,
      canvasId,
      originalName: 'link-to-update',
      type: 'node',
    })

    // Track updates
    let updateResult: { nodeId?: string; action?: string } | null = null

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

          const result = await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })

          if (result.action === 'updated_content') {
            updateResult = { nodeId: result.nodeId, action: result.action }
          }
        },
        onReady: () => console.error('[FileWatcher] Ready'),
        onError: (err) => console.error('[FileWatcher] Error:', err),
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    // Update the .url.yaml file
    const linkFilePath = path.join(canvasDir, 'link-to-update.url.yaml')
    const updatedContent = yaml.stringify({
      url: 'https://new-url.com',
      title: 'New Title',
      description: 'Updated description',
      displayMode: 'iframe',
    })
    await fs.writeFile(linkFilePath, updatedContent)

    console.error(`Updated .url.yaml at: ${linkFilePath}`)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify update was processed
    expect(updateResult).not.toBeNull()
    expect(updateResult!.action).toBe('updated_content')
    expect(updateResult!.nodeId).toBe(nodeId)

    // Verify node data was updated
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item) => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const linkNode = updatedCanvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === nodeId)
    expect(linkNode).toBeDefined()

    const linkData = linkNode!.xynode.data as LinkNodeData
    expect(linkData.url).toBe('https://new-url.com')
    expect(linkData.title).toBe('New Title')
    expect(linkData.description).toBe('Updated description')
    expect(linkData.displayMode).toBe('iframe')
    expect(linkNode!.xynode.measured).toEqual(LINK_NODE_LAYOUT.DEFAULT_MEASURED)
  })

  it('should delete link node when .url.yaml is removed', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create canvas with a link node
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

    const nodeId = `node-link-delete-${Date.now()}`
    const canvasId = `canvas-link-delete-${Date.now()}`
    const canvasName = 'link-delete-test'

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'link-to-delete',
          xynode: {
            id: nodeId,
            type: 'link',
            position: { x: 0, y: 0 },
            data: {
              url: 'https://delete-me.com',
              loadingStatus: 'pending',
            } as LinkNodeData,
            measured: LINK_NODE_LAYOUT.DEFAULT_MEASURED,
          },
        },
      ],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Create filesystem structure manually
    const canvasDir = path.join(workspacePath, canvasName)
    await fs.mkdir(canvasDir, { recursive: true })
    const linkFilePath = path.join(canvasDir, 'link-to-delete.url.yaml')
    await fs.writeFile(linkFilePath, yaml.stringify({ url: 'https://delete-me.com' }))

    // Set up syncer
    const { syncer, pathMapper } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Manually register the mapping
    pathMapper.addMapping({
      path: `${canvasName}/link-to-delete.url.yaml`,
      nodeId,
      canvasId,
      originalName: 'link-to-delete',
      type: 'node',
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
    expect(
      await fs
        .access(linkFilePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    // Delete the file
    await fs.unlink(linkFilePath)

    console.error(`Deleted .url.yaml at: ${linkFilePath}`)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify node was removed
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const nodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(nodes.length).toBe(0)

    // Verify path mapper was cleaned up
    expect(pathMapper.getMapping(`${canvasName}/link-to-delete.url.yaml`)).toBeUndefined()
  })

  it('should hydrate .url.yaml from yDoc LinkNode', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas with a LinkNode
    const canvasId = `canvas-hydrate-${Date.now()}`
    const canvasName = 'hydrate-link-test'
    const nodeId = crypto.randomUUID()

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'node',
          id: nodeId,
          name: 'hydrated-link',
          xynode: {
            id: nodeId,
            type: 'link',
            position: { x: 100, y: 100 },
            data: {
              url: 'https://hydrate-test.com',
              title: 'Hydration Test',
              description: 'Testing hydration',
              siteName: 'Test Site',
              displayMode: 'iframe',
              loadingStatus: 'loaded',
            } as LinkNodeData,
            width: LINK_IFRAME_LAYOUT.WIDTH,
            height: LINK_IFRAME_LAYOUT.HEIGHT + NODE_NAME_HEIGHT,
            measured: {
              width: LINK_IFRAME_LAYOUT.WIDTH,
              height: LINK_IFRAME_LAYOUT.HEIGHT + NODE_NAME_HEIGHT,
            },
          },
        },
      ],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem from yDoc
    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    console.error(`Hydrated filesystem to: ${workspacePath}`)

    // Verify .url.yaml file was created
    const linkFilePath = path.join(workspacePath, canvasName, 'hydrated-link.url.yaml')
    expect(
      await fs
        .access(linkFilePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    // Verify content matches
    const fileContent = await fs.readFile(linkFilePath, 'utf-8')
    const parsedContent = yaml.parse(fileContent)

    expect(parsedContent.url).toBe('https://hydrate-test.com')
    expect(parsedContent.title).toBe('Hydration Test')
    expect(parsedContent.description).toBe('Testing hydration')
    expect(parsedContent.siteName).toBe('Test Site')
    expect(parsedContent.displayMode).toBe('iframe')

    console.error(`Verified .url.yaml content: ${JSON.stringify(parsedContent)}`)
  })

  it('should preserve link data through round-trip sync', async () => {
    const connection = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Create root canvas if needed
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

    // Create a test canvas
    const canvasId = `canvas-roundtrip-${Date.now()}`
    const canvasName = 'round-trip-link-test'
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: canvasName,
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    connection.proxy.root.items.push(canvas)

    await delay(500)

    // Step 1: Hydrate filesystem (creates canvas directory)
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

    // Step 2: Create .url.yaml file
    const originalLinkData = {
      url: 'https://roundtrip-test.com',
      title: 'Round Trip Test',
      description: 'Testing full round-trip sync',
      siteName: 'Test Site',
    }

    const canvasDir = path.join(workspacePath, canvasName)
    const linkFilePath = path.join(canvasDir, 'roundtrip-link.url.yaml')
    await fs.writeFile(linkFilePath, yaml.stringify(originalLinkData))

    console.error(`Step 2: Created .url.yaml file`)

    // Step 3: Sync to yDoc
    const result = await syncer.syncChange({
      type: 'create',
      path: `${canvasName}/roundtrip-link.url.yaml`,
      content: yaml.stringify(originalLinkData),
    })

    expect(result.success).toBe(true)
    expect(result.action).toBe('created_node')

    console.error(`Step 3: Synced to yDoc, node ID: ${result.nodeId}`)

    // Verify node exists in yDoc
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    )
    const linkNode = updatedCanvas!.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.xynode.type === 'link'
    )
    expect(linkNode).toBeDefined()

    const nodeData = linkNode!.xynode.data as LinkNodeData
    expect(nodeData.url).toBe('https://roundtrip-test.com')
    console.error(`Step 3: Verified node in yDoc`)

    // Step 4: Clear filesystem
    await clearDirectory(workspacePath)
    console.error(`Step 4: Cleared filesystem`)

    // Step 5: Re-hydrate filesystem from yDoc
    fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    console.error(`Step 5: Re-hydrated filesystem`)

    // Step 6: Verify .url.yaml was recreated with correct content
    const recreatedFilePath = path.join(workspacePath, canvasName, 'roundtrip-link.url.yaml')
    expect(
      await fs
        .access(recreatedFilePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true)

    const recreatedContent = await fs.readFile(recreatedFilePath, 'utf-8')
    const parsedContent = yaml.parse(recreatedContent)

    expect(parsedContent.url).toBe(originalLinkData.url)
    expect(parsedContent.title).toBe(originalLinkData.title)
    expect(parsedContent.description).toBe(originalLinkData.description)
    expect(parsedContent.siteName).toBe(originalLinkData.siteName)

    console.error(`Step 6: Round-trip complete - link data preserved!`)
  })
})
