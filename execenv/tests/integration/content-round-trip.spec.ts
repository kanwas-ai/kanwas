/**
 * Content round-trip sync tests.
 *
 * Tests for syncing content from filesystem to yDoc and reading it back.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import * as Y from 'yjs'

import { type WorkspaceConnection, type CanvasItem, type NodeItem } from 'shared'
import { connectTestWorkspace } from '../helpers/connect.js'
import { workspaceToFilesystem, ContentConverter, createNoOpFileUploader, createNoOpFileReader } from 'shared/server'

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

describe('Content Round-Trip Sync', () => {
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

  function assertCanvasTreeHasItems(canvas: CanvasItem, pathSegments: string[] = ['root']): void {
    expect(Array.isArray(canvas.items), `Canvas at ${pathSegments.join(' > ')} is missing items[]`).toBe(true)

    for (const item of canvas.items) {
      if (item.kind === 'canvas') {
        assertCanvasTreeHasItems(item, [...pathSegments, item.name || item.id])
      }
    }
  }

  it('should sync markdown content from filesystem to yDoc and read it back', async () => {
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

    const canvasId = `canvas-content-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Content Round Trip Canvas',
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
    const { syncer, contentConverter } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
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

    // Create a new .md file with specific content
    const testContent = '# Test Heading\n\nThis is a **bold** paragraph.\n\n- Item 1\n- Item 2'
    const canvasDir = path.join(workspacePath, 'content-round-trip-canvas')
    const newNotePath = path.join(canvasDir, 'test-note.md')
    await fs.writeFile(newNotePath, testContent)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify node was created
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const canvasNodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(canvasNodes.length).toBe(1)

    const createdNode = canvasNodes[0]
    expect(createdNode.xynode.type).toBe('blockNote')

    // Now read the content back from yDoc
    const fragment = connection.contentStore.getBlockNoteFragment(createdNode.id)

    console.error(`Fragment type: ${fragment?.constructor?.name}`)
    console.error(`Fragment exists: ${!!fragment}`)

    expect(fragment).toBeDefined()

    // Try to convert back to markdown
    const readBackMarkdown = await contentConverter.fragmentToMarkdown(fragment as any)

    console.error(`Read back markdown: ${readBackMarkdown}`)

    // Verify content was preserved
    expect(readBackMarkdown).toContain('Test Heading')
    expect(readBackMarkdown).toContain('bold')
    expect(readBackMarkdown).toContain('Item 1')
  })

  it('should preserve heading levels through filesystem → yDoc round-trip', async () => {
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

    const canvasId = `canvas-heading-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Heading Level Test Canvas',
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
    const { syncer, contentConverter } = createTestSyncer(connection, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Start watcher
    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
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

    // Create a file with MULTIPLE heading levels (this is what the agent creates)
    const testContent = `# Level 1 Heading

## Level 2 Heading

### Level 3 Heading

#### Level 4 Heading

Some paragraph text.

## Another Level 2

More content here.`

    const canvasDir = path.join(workspacePath, 'heading-level-test-canvas')
    const newNotePath = path.join(canvasDir, 'multi-level-headings.md')
    await fs.writeFile(newNotePath, testContent)

    // Wait for watcher to detect and sync
    await delay(2000)

    // Verify node was created
    const updatedCanvas = connection.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem
    const canvasNodes = updatedCanvas.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(canvasNodes.length).toBe(1)

    const createdNode = canvasNodes[0]
    expect(createdNode.xynode.type).toBe('blockNote')

    // Read the content back from yDoc
    const fragment = connection.contentStore.getBlockNoteFragment(createdNode.id)

    expect(fragment).toBeDefined()

    // Convert back to markdown
    const readBackMarkdown = await contentConverter.fragmentToMarkdown(fragment as any)

    console.error('\n=== HEADING LEVEL ROUND-TRIP TEST ===')
    console.error('Original content written to filesystem:')
    console.error(testContent)
    console.error('\nContent read back from yDoc:')
    console.error(readBackMarkdown)
    console.error('=====================================\n')

    // Verify ALL heading levels are preserved
    expect(readBackMarkdown).toContain('# Level 1 Heading')
    expect(readBackMarkdown).toContain('## Level 2 Heading')
    expect(readBackMarkdown).toContain('### Level 3 Heading')
    expect(readBackMarkdown).toContain('#### Level 4 Heading')
    expect(readBackMarkdown).toContain('## Another Level 2')
  })

  it('should keep fragment identity across repeated updates and propagate without map-key replacement', async () => {
    // First connection creates content
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

    const canvasId = `canvas-two-conn-${Date.now()}`
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: 'Two Connection Content Canvas',
      xynode: { id: canvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
      edges: [],
      items: [],
    }
    conn1.proxy.root.items.push(canvas)

    await delay(500)

    // Hydrate filesystem for conn1
    const fsTree = await workspaceToFilesystem(conn1.proxy, conn1.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    // Set up syncer for conn1
    const { syncer, contentConverter } = createTestSyncer(conn1, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    // Create a node with initial content
    const initialContent = '# Shared Note\n\nInitial content.'
    const canvasDir = path.join(workspacePath, 'two-connection-content-canvas')
    const notePath = path.join(canvasDir, 'shared-note.md')
    await fs.writeFile(notePath, initialContent)

    // Sync the file creation
    const syncResult = await syncer.syncChange({
      type: 'create',
      path: 'two-connection-content-canvas/shared-note.md',
      content: initialContent,
    })

    expect(syncResult.success).toBe(true)
    expect(syncResult.action).toBe('created_node')

    const nodeId = syncResult.nodeId!
    const notesMapConn1 = conn1.yDoc.getMap<Y.Doc>('notes')
    const noteDocConn1 = notesMapConn1.get(nodeId)
    const fragmentConn1 = conn1.contentStore.getBlockNoteFragment(nodeId)
    expect(noteDocConn1).toBeDefined()
    expect(fragmentConn1).toBeDefined()

    // Wait for create to propagate before connecting second client assertions
    await delay(1000)

    // Second connection observes the same node
    const conn2 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    // Verify the canvas and node exist in conn2
    const canvasInConn2 = conn2.proxy.root?.items?.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === canvasId
    ) as CanvasItem

    expect(canvasInConn2).toBeDefined()
    const nodesInConn2 = canvasInConn2.items.filter((i): i is NodeItem => i.kind === 'node')
    expect(nodesInConn2.length).toBe(1)
    expect(nodesInConn2[0].id).toBe(nodeId)

    // Read fragment from conn2 and set observers before updates
    const notesMapConn2 = conn2.yDoc.getMap<Y.Doc>('notes')
    const noteDocConn2 = notesMapConn2.get(nodeId)
    const fragmentInConn2 = conn2.contentStore.getBlockNoteFragment(nodeId)
    expect(noteDocConn2).toBeDefined()
    expect(fragmentInConn2).toBeDefined()
    const observedFragmentConn2 = fragmentInConn2 as Y.XmlFragment

    let noteDocReplacementEvents = 0
    let collaborativeUpdateEvents = 0

    const onNotesMapChange = (event: Y.YMapEvent<Y.Doc>) => {
      if (event.keysChanged.has(nodeId)) {
        noteDocReplacementEvents += 1
      }
    }
    const onDocUpdate = () => {
      collaborativeUpdateEvents += 1
    }

    notesMapConn2.observe(onNotesMapChange)
    noteDocConn2!.on('updateV2', onDocUpdate)

    const updateOne = '# Shared Note\n\nFirst update content.'
    const updateTwo = '# Shared Note\n\nSecond update content with **bold** text.'

    await syncer.syncChange({
      type: 'update',
      path: 'two-connection-content-canvas/shared-note.md',
      content: updateOne,
    })
    await delay(1000)
    expect(notesMapConn1.get(nodeId)).toBe(noteDocConn1)

    await syncer.syncChange({
      type: 'update',
      path: 'two-connection-content-canvas/shared-note.md',
      content: updateTwo,
    })
    await delay(1000)

    const finalFragmentConn1 = conn1.contentStore.getBlockNoteFragment(nodeId)
    const finalFragmentConn2 = conn2.contentStore.getBlockNoteFragment(nodeId)
    expect(finalFragmentConn1).toBe(fragmentConn1)
    expect(finalFragmentConn2).toBe(observedFragmentConn2)
    expect(noteDocReplacementEvents).toBe(0)
    expect(collaborativeUpdateEvents).toBeGreaterThan(0)

    // Validate latest markdown is visible to both clients with final formatting
    const markdownInConn1 = await contentConverter.fragmentToMarkdown(finalFragmentConn1 as any)
    const contentConverter2 = new ContentConverter()
    const markdownInConn2 = await contentConverter2.fragmentToMarkdown(finalFragmentConn2 as any)

    expect(markdownInConn1).toContain('Second update content')
    expect(markdownInConn1).toContain('bold')
    expect(markdownInConn2).toContain('Second update content')
    expect(markdownInConn2).toContain('bold')
    expect(markdownInConn2).not.toContain('First update content')

    notesMapConn2.unobserve(onNotesMapChange)
    noteDocConn2!.off('updateV2', onDocUpdate)
  })

  it('preserves nested canvas items across burst markdown creation and reconnect', async () => {
    const conn1 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    const conn2 = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

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

    const projectsCanvasId = `projects-${Date.now()}`
    const repositioningCanvasId = `repositioning-${Date.now()}`
    const usecasesCanvasId = `usecases-${Date.now()}`

    conn1.proxy.root.items.push({
      kind: 'canvas',
      id: projectsCanvasId,
      name: 'projects',
      xynode: { id: projectsCanvasId, type: 'canvas', position: { x: 50, y: 50 }, data: {} },
      edges: [],
      items: [
        {
          kind: 'canvas',
          id: repositioningCanvasId,
          name: 'kanwas-repositioning',
          xynode: { id: repositioningCanvasId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
          edges: [],
          items: [
            {
              kind: 'canvas',
              id: usecasesCanvasId,
              name: 'kanwas-video-usecases',
              xynode: { id: usecasesCanvasId, type: 'canvas', position: { x: 150, y: 150 }, data: {} },
              edges: [],
              items: [],
            },
          ],
        },
      ],
    })

    await delay(500)

    const fsTree = await workspaceToFilesystem(conn1.proxy, conn1.yDoc)
    await clearDirectory(workspacePath)
    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, workspacePath)
      }
    }

    const { syncer } = createTestSyncer(conn1, {
      fileUploader: createNoOpFileUploader(),
      fileReader: createNoOpFileReader(),
    })

    const watcher = trackWatcher(
      new FileWatcher({
        watchPath: workspacePath,
        onFileChange: async (event: FileChangeEvent) => {
          const relativePath = path.relative(workspacePath, event.path)
          if (relativePath === '.ready' || relativePath.startsWith('.ready')) {
            return
          }

          let content: string | undefined
          if (event.type !== 'delete' && !event.isDirectory) {
            try {
              content = await fs.readFile(event.path, 'utf-8')
            } catch {
              // Ignore races while files settle.
            }
          }

          await syncer.syncChange({
            type: event.type,
            path: relativePath,
            content,
          })
        },
        onReady: () => undefined,
        onError: (err) => {
          throw err
        },
      }),
      activeWatchers
    )

    watcher.start()
    await delay(1000)

    conn2.disconnect()

    const nestedCanvasDir = path.join(workspacePath, 'projects', 'kanwas-repositioning', 'kanwas-video-usecases')
    const filenames = [
      'overview.md',
      'day-01-discovery.md',
      'day-02-storyboard.md',
      'day-03-setup.md',
      'day-04-capture.md',
      'day-05-review.md',
      'day-06-recut.md',
      'day-07-motion.md',
      'day-08-audio.md',
      'day-09-copy.md',
    ]

    for (const filename of filenames) {
      await fs.writeFile(
        path.join(nestedCanvasDir, filename),
        `# ${filename}\n\nGenerated during reconnect regression test.`
      )
    }

    await delay(2000)

    const reconnected = trackConnection(await connectTestWorkspace(testEnv), activeConnections)

    await delay(1000)

    expect(reconnected.proxy.root).toBeDefined()
    assertCanvasTreeHasItems(reconnected.proxy.root as CanvasItem)

    const projectsCanvas = reconnected.proxy.root!.items.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'projects'
    )
    const repositioningCanvas = projectsCanvas?.items.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'kanwas-repositioning'
    )
    const usecasesCanvas = repositioningCanvas?.items.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.name === 'kanwas-video-usecases'
    )

    expect(projectsCanvas).toBeDefined()
    expect(repositioningCanvas).toBeDefined()
    expect(usecasesCanvas).toBeDefined()
    expect(Array.isArray(repositioningCanvas?.items)).toBe(true)
    expect(usecasesCanvas?.items.filter((item) => item.kind === 'node')).toHaveLength(filenames.length)
  })
})
