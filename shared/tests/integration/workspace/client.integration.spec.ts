import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import WebSocket from 'ws'
import * as Y from 'yjs'
import {
  connectToNote,
  connectToWorkspace,
  type NoteConnection,
  type WorkspaceConnection,
} from '../../../src/workspace/client.js'
import { workspaceToFilesystem } from '../../../src/workspace/converter.js'
import { createWorkspaceSnapshotBundle } from '../../../src/workspace/snapshot-bundle.js'
import { createWorkspaceContentStore } from '../../../src/workspace/workspace-content-store.js'
import type { CanvasItem } from '../../../src/types.js'
import {
  fetchTestSocketToken,
  setupTestEnvironment,
  waitForBackendHealth,
  waitForYjsServerHealth,
  type TestEnvironment,
} from '../setup.js'

// Test environment - populated in beforeEach
let testEnv: TestEnvironment
let socketToken: string

// Track connections for cleanup
const activeConnections: WorkspaceConnection[] = []
const activeNoteConnections: NoteConnection[] = []

function trackConnection(conn: WorkspaceConnection): WorkspaceConnection {
  activeConnections.push(conn)
  return conn
}

function trackNoteConnection(conn: NoteConnection): NoteConnection {
  activeNoteConnections.push(conn)
  return conn
}

// Helper to wait for sync propagation
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean, timeoutMs: number = 3000, intervalMs: number = 50): Promise<void> {
  const start = Date.now()

  while (!predicate()) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`Timed out waiting for expected state after ${timeoutMs}ms`)
    }
    await delay(intervalMs)
  }
}

function setBlockNoteText(fragment: Y.XmlFragment, text: string): void {
  const existingChildren = fragment.toArray()
  if (existingChildren.length > 0) {
    fragment.delete(0, existingChildren.length)
  }

  const paragraph = new Y.XmlElement('paragraph')
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  paragraph.insert(0, [textNode])
  fragment.insert(0, [paragraph])
}

function readBlockNoteText(noteDoc: Y.Doc): string {
  return noteDoc.getXmlFragment('content').toString()
}

const DEBUG_INTEGRATION_REWIND = process.env.DEBUG_INTEGRATION_REWIND === '1'

function debugLog(...args: unknown[]): void {
  if (DEBUG_INTEGRATION_REWIND) {
    console.log(...args)
  }
}

async function replaceWorkspaceSnapshot(workspaceId: string, yjsServerHost: string, doc: Y.Doc): Promise<void> {
  const response = await fetch(
    `http://${yjsServerHost}/documents/${workspaceId}/replace?notifyBackend=false&reason=shared-client-test`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_SECRET || 'secret23'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createWorkspaceSnapshotBundle(doc)),
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to replace workspace snapshot for ${workspaceId}: ${response.status} ${await response.text()}`
    )
  }
}

describe('connectToWorkspace integration', () => {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3333'
  const yjsServerHost = process.env.YJS_SERVER_HOST || 'localhost:1999'

  beforeAll(async () => {
    await waitForBackendHealth(backendUrl)
    await waitForYjsServerHealth(yjsServerHost)
  }, 20000)

  beforeEach(async () => {
    // Setup test environment - let errors propagate
    testEnv = await setupTestEnvironment({
      backendUrl,
      yjsServerHost,
    })
    socketToken = await fetchTestSocketToken(testEnv)
  })

  afterEach(() => {
    // Clean up all connections after each test
    for (const conn of activeConnections) {
      try {
        conn.disconnect()
      } catch {
        // Ignore errors during cleanup
      }
    }
    activeConnections.length = 0

    for (const conn of activeNoteConnections) {
      try {
        conn.disconnect()
      } catch {
        // Ignore errors during cleanup
      }
    }
    activeNoteConnections.length = 0
  })

  describe('connection', () => {
    it('should connect to workspace and sync', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      expect(connection.proxy).toBeDefined()
      expect(connection.yDoc).toBeDefined()
      expect(connection.provider).toBeDefined()
      expect(connection.disconnect).toBeTypeOf('function')
    })

    it('should return synced provider', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Provider should be synced after connectToWorkspace resolves
      expect(connection.provider.synced).toBe(true)
    })

    it('should connect to a dedicated note room and sync note content', async () => {
      const noteId = `dedicated-note-${Date.now()}`
      const seedDoc = new Y.Doc()
      seedDoc.getMap('state').set('root', {
        id: 'root',
        kind: 'canvas',
        name: '',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [
          {
            id: noteId,
            kind: 'node',
            name: 'Dedicated note',
            xynode: {
              id: noteId,
              type: 'blockNote',
              position: { x: 0, y: 0 },
              data: {},
            },
          },
        ],
        edges: [],
      })

      const contentStore = createWorkspaceContentStore(seedDoc)
      contentStore.createNoteDoc(noteId, 'blockNote')
      const fragment = contentStore.getBlockNoteFragment(noteId)
      expect(fragment).toBeDefined()
      setBlockNoteText(fragment as Y.XmlFragment, 'hello dedicated note room')

      await replaceWorkspaceSnapshot(testEnv.workspaceId, testEnv.yjsServerHost, seedDoc)

      const noteConnection = trackNoteConnection(
        await connectToNote({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          noteId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      expect(noteConnection.provider.synced).toBe(true)
      expect(noteConnection.provider.noteKind).toBe('blockNote')
      expect(readBlockNoteText(noteConnection.doc)).toContain('hello dedicated note room')
    })

    it('should timeout on unreachable host', async () => {
      await expect(
        connectToWorkspace({
          host: 'localhost:59999', // Non-existent port
          workspaceId: 'test-workspace',
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          timeout: 1000, // Short timeout
        })
      ).rejects.toThrow()
    })
  })

  describe('proxy operations', () => {
    it('should allow modifying proxy.root', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Initialize root if not present
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

      // Add a canvas to root
      const testCanvas: CanvasItem = {
        id: `test-canvas-${Date.now()}`,
        name: 'Test Canvas',
        kind: 'canvas',
        xynode: { id: `test-canvas-${Date.now()}`, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
        items: [],
        edges: [],
      }

      connection.proxy.root.items.push(testCanvas)

      // Verify the change is reflected
      expect(connection.proxy.root.items.length).toBeGreaterThan(0)
      expect(connection.proxy.root.items.some((item) => item.id === testCanvas.id)).toBe(true)
    })

    it('should reflect changes in yDoc', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Initialize root
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

      const testCanvas: CanvasItem = {
        id: `ydoc-test-${Date.now()}`,
        name: 'YDoc Test Canvas',
        kind: 'canvas',
        xynode: { id: `ydoc-test-${Date.now()}`, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
        items: [],
        edges: [],
      }

      connection.proxy.root.items.push(testCanvas)

      // Give Yjs time to process
      await delay(100)

      // Verify yDoc has the state map
      const stateMap = connection.yDoc.getMap('state')
      expect(stateMap).toBeDefined()

      // The root array should be in the state map
      const root = stateMap.get('root')
      expect(root).toBeDefined()
    })
  })

  describe('data persistence', () => {
    it('should persist data across connections', async () => {
      const uniqueId = `persist-test-${Date.now()}`

      // First connection: write data
      const conn1 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

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

      conn1.proxy.root.items.push({
        id: uniqueId,
        name: 'Persistence Test',
        kind: 'canvas',
        xynode: { id: uniqueId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
        items: [],
        edges: [],
      })

      // Wait for the Yjs server debounce window so the change persists before reconnect.
      await delay(1200)
      conn1.disconnect()

      // Remove from tracking since we manually disconnected
      activeConnections.splice(activeConnections.indexOf(conn1), 1)

      // Second connection: read data
      await delay(200)
      const conn2 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      await waitFor(() => conn2.proxy.root?.items?.some((item) => item.id === uniqueId) === true)

      // Verify the canvas exists
      expect(conn2.proxy.root).toBeDefined()
      expect(conn2.proxy.root?.items?.some((item) => item.id === uniqueId)).toBe(true)
    })
  })

  describe('multiple connections', () => {
    it('should sync changes between two connections', async () => {
      const uniqueId = `multi-conn-${Date.now()}`

      // Open two connections to the same workspace
      const conn1 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      const conn2 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Initialize root on conn1
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

      // Add canvas via conn1
      conn1.proxy.root.items.push({
        id: uniqueId,
        name: 'Multi-Connection Test',
        kind: 'canvas',
        xynode: { id: uniqueId, type: 'canvas', position: { x: 100, y: 100 }, data: {} },
        items: [],
        edges: [],
      })

      await waitFor(() => conn2.proxy.root?.items?.some((item) => item.id === uniqueId) === true)

      // Verify conn2 sees the change
      expect(conn2.proxy.root).toBeDefined()
      expect(conn2.proxy.root?.items?.some((item) => item.id === uniqueId)).toBe(true)
    })
  })

  describe('converter integration', () => {
    it('should convert workspace to filesystem', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Use the converter
      const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc)

      // Should return a root folder
      expect(fsTree).toBeDefined()
      expect(fsTree.type).toBe('folder')
      // Root folder name is '.' (current directory)
      expect(fsTree.name).toBe('.')
    })
  })

  describe('disconnect', () => {
    it('should clean up resources on disconnect', async () => {
      const connection = await connectToWorkspace({
        host: testEnv.yjsServerHost,
        workspaceId: testEnv.workspaceId,
        WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
        socketToken,
      })

      // Verify connected before disconnect
      expect(connection.provider.synced).toBe(true)

      // Disconnect
      connection.disconnect()

      // Give time for disconnect to propagate
      await delay(100)

      // Provider should no longer be connected (or at minimum, should not throw)

      expect(connection.provider.shouldConnect).toBe(false)
    })
  })

  describe('replace', () => {
    it('should serve replaced state to reconnecting clients', { timeout: 30000 }, async () => {
      // This test checks what happens when a client reconnects after the server
      // document has been replaced. The issue might be that the Yjs server still
      // has the old Y.Doc in memory and syncs it to the reconnecting client.

      // First connection - make some changes
      const conn1 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      await delay(500)

      // Initialize with some content
      conn1.proxy.root = {
        id: 'root',
        kind: 'canvas',
        name: 'Original Content',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [
          {
            id: 'item-to-be-removed',
            name: 'This should disappear after replace',
            kind: 'canvas',
            xynode: { id: 'item-to-be-removed', type: 'canvas', position: { x: 100, y: 100 }, data: {} },
            items: [],
            edges: [],
          },
        ],
        edges: [],
      }

      // Wait for sync to server
      await delay(2000)

      const originalItemCount = conn1.proxy.root?.items?.length || 0
      debugLog('Original item count:', originalItemCount)
      expect(originalItemCount).toBe(1)

      // Disconnect first client
      conn1.disconnect()
      activeConnections.splice(activeConnections.indexOf(conn1), 1)
      await delay(500)

      // Send a document WITHOUT the extra item directly to the Yjs server
      const Y = await import('yjs')
      const replacementDoc = new Y.Doc()
      replacementDoc.getMap('state').set('root', {
        id: 'root',
        kind: 'canvas',
        name: 'Replaced Content',
        xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        items: [], // No items!
        edges: [],
      })
      const replacementSnapshot = createWorkspaceSnapshotBundle(replacementDoc)

      const replaceResp = await fetch(`http://${testEnv.yjsServerHost}/documents/${testEnv.workspaceId}/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BACKEND_API_SECRET || 'secret23'}`,
        },
        body: JSON.stringify(replacementSnapshot),
      })
      debugLog('Yjs server replace response:', replaceResp.status)
      expect(replaceResp.ok).toBe(true)

      // Wait for the Yjs server to process
      await delay(1000)

      // New client connects (simulates page reload)
      const conn2 = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      // Wait for sync
      await delay(1000)

      // THE KEY TEST: Does the new client see the replaced state or the old state?
      const newItemCount = conn2.proxy.root?.items?.length || 0
      const rootName = conn2.proxy.root?.name || ''
      debugLog('After reconnect - item count:', newItemCount)
      debugLog('After reconnect - root name:', rootName)

      // If this fails, the Yjs server is serving the old state to reconnecting clients!
      expect(newItemCount).toBe(0)
      expect(rootName).toBe('Replaced Content')
    })

    it('should receive reload broadcast from the Yjs server when calling replace endpoint directly', async () => {
      const connection = trackConnection(
        await connectToWorkspace({
          host: testEnv.yjsServerHost,
          workspaceId: testEnv.workspaceId,
          WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
          socketToken,
        })
      )

      let reloadReceived = false
      const handleReload = () => {
        reloadReceived = true
      }

      connection.provider.on('reload', handleReload)

      // Wait for connection to be fully synced
      await delay(500)

      // Call the Yjs server replace endpoint directly (bypasses backend validation)
      // This tests the broadcast mechanism in isolation
      const yjsServerReplaceUrl = `http://${testEnv.yjsServerHost}/documents/${testEnv.workspaceId}/replace`
      debugLog('Yjs server replace URL:', yjsServerReplaceUrl)

      // Create a minimal valid Y.Doc state
      const tempDoc = new (await import('yjs')).Doc()
      tempDoc.getMap('state').set('root', { id: 'root', kind: 'canvas', name: '', items: [], edges: [] })
      const snapshot = createWorkspaceSnapshotBundle(tempDoc)

      const replaceResponse = await fetch(yjsServerReplaceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BACKEND_API_SECRET || 'secret23'}`,
        },
        body: JSON.stringify(snapshot),
      })

      debugLog('Yjs server replace response status:', replaceResponse.status)
      const responseText = await replaceResponse.text()
      debugLog('Yjs server replace response body:', responseText)

      // Wait for broadcast
      await delay(500)

      debugLog('Reload received:', reloadReceived)

      if (replaceResponse.status === 200) {
        expect(reloadReceived).toBe(true)
      } else {
        debugLog('Yjs server replace failed, skipping broadcast assertion')
      }

      connection.provider.off('reload', handleReload)
    })
  })
})
