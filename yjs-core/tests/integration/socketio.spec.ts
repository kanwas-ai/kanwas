import { createHmac } from 'node:crypto'
import { createServer, type Server as HttpServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client'
import * as Y from 'yjs'
import { decodeBootstrapPayload } from 'shared'
import { attachYjsCore, type YjsCoreHandle } from '../../src/core.js'
import type { DocumentStore } from '../../src/document-store.js'
import { SOCKET_EVENT_BOOTSTRAP, SOCKET_EVENT_UPDATE } from '../../src/protocol.js'
import { createNoopLogger } from '../helpers/test-utils.js'

const TOKEN_SECRET = 'test-yjs-core-secret'
const SOCKET_PATH = '/yjs/socket.io'

function createRootBytes(): Uint8Array {
  const doc = new Y.Doc()
  const root = new Y.Map<unknown>()
  const xynode = new Y.Map<unknown>()
  const position = new Y.Map<unknown>()
  position.set('x', 0)
  position.set('y', 0)
  xynode.set('data', new Y.Map())
  xynode.set('id', 'root')
  xynode.set('position', position)
  xynode.set('type', 'canvas')
  root.set('edges', new Y.Array())
  root.set('id', 'root')
  root.set('items', new Y.Array())
  root.set('kind', 'canvas')
  root.set('name', '')
  root.set('xynode', xynode)
  doc.getMap('state').set('root', root)
  return Y.encodeStateAsUpdateV2(doc)
}

function createStore(rootBytes: Uint8Array = createRootBytes()): DocumentStore {
  let root = rootBytes
  const notes = new Map<string, Uint8Array>()

  return {
    deleteNote: vi.fn(async (workspaceId, noteId) => {
      notes.delete(`${workspaceId}:${noteId}`)
    }),
    loadNote: vi.fn(async (workspaceId, noteId) => notes.get(`${workspaceId}:${noteId}`) ?? null),
    loadRoot: vi.fn(async () => root),
    saveNote: vi.fn(async (workspaceId, noteId, bytes) => {
      notes.set(`${workspaceId}:${noteId}`, bytes)
    }),
    saveRoot: vi.fn(async (_workspaceId, bytes) => {
      root = bytes
    }),
  }
}

function mintToken(workspaceId: string, mode: 'editable' | 'readonly' = 'editable'): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 60, mode, uid: 'local-user', wid: workspaceId })
  ).toString('base64url')
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

async function listen(server: HttpServer): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected an ephemeral TCP address')
  }
  return `http://127.0.0.1:${address.port}`
}

function connect(origin: string, workspaceId: string, socketToken?: string): ClientSocket {
  return createSocketClient(origin, {
    auth: { clientKind: 'renderer', socketToken, workspaceId },
    forceNew: true,
    path: SOCKET_PATH,
    reconnection: false,
    transports: ['websocket'],
  })
}

describe('attachYjsCore', () => {
  let core: YjsCoreHandle | null = null
  let httpServer: HttpServer | null = null
  const clients: ClientSocket[] = []

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect()
    }
    clients.length = 0

    await core?.close().catch(() => undefined)
    core = null

    if (httpServer?.listening) {
      httpServer.close()
      await once(httpServer, 'close')
    }
    httpServer = null
  })

  it('attaches at the configured path and persists an authenticated workspace update', async () => {
    const store = createStore()
    httpServer = createServer((_request, response) => response.end('runtime'))
    core = attachYjsCore({
      httpServer,
      logger: createNoopLogger(),
      saveDebounceMs: 5,
      saveMaxWaitMs: 25,
      socketPath: SOCKET_PATH,
      store,
      tokenSecret: TOKEN_SECRET,
    })
    const origin = await listen(httpServer)
    const client = connect(origin, 'workspace-1', mintToken('workspace-1'))
    clients.push(client)

    const bootstrapBytes = await new Promise<Uint8Array>((resolve, reject) => {
      client.once(SOCKET_EVENT_BOOTSTRAP, resolve)
      client.once('connect_error', reject)
    })
    const bootstrap = decodeBootstrapPayload(bootstrapBytes)
    const rootBootstrap = bootstrap.docs.find((doc) => doc.kind === 'root')
    expect(rootBootstrap).toBeDefined()

    const clientDoc = new Y.Doc()
    Y.applyUpdateV2(clientDoc, rootBootstrap?.update as Uint8Array)
    const updates: Uint8Array[] = []
    clientDoc.on('updateV2', (update) => updates.push(update))
    const root = clientDoc.getMap('state').get('root') as Y.Map<unknown>
    root.set('name', 'updated locally')

    client.emit(SOCKET_EVENT_UPDATE, {
      docId: 'root',
      generation: rootBootstrap?.generation,
      kind: 'root',
      update: updates.at(-1),
    })

    await vi.waitFor(() => expect(store.saveRoot).toHaveBeenCalled(), { timeout: 1_000 })
    expect(core.roomManager.activeRoomCount).toBe(1)
  })

  it('rejects sockets without a workspace token', async () => {
    httpServer = createServer()
    core = attachYjsCore({
      httpServer,
      logger: createNoopLogger(),
      socketPath: SOCKET_PATH,
      store: createStore(),
      tokenSecret: TOKEN_SECRET,
    })
    const origin = await listen(httpServer)
    const client = connect(origin, 'workspace-1')
    clients.push(client)

    await new Promise<void>((resolve, reject) => {
      client.once('disconnect', () => resolve())
      client.once('connect_error', reject)
    })

    expect(core.roomManager.activeRoomCount).toBe(0)
  })

  it('closes idempotently without closing its application-owned HTTP server', async () => {
    httpServer = createServer((_request, response) => response.end('still-running'))
    core = attachYjsCore({
      httpServer,
      logger: createNoopLogger(),
      store: createStore(),
      tokenSecret: TOKEN_SECRET,
    })
    const origin = await listen(httpServer)

    await Promise.all([core.close(), core.close()])

    expect(httpServer.listening).toBe(true)
    await expect(fetch(origin).then((response) => response.text())).resolves.toBe('still-running')
    core = null
  })

  it('destroys rooms and closes Engine.IO when the document store rejects during shutdown', async () => {
    const saveFailure = new Error('folder persistence failed')
    const store = createStore()
    store.saveRoot = vi.fn(async () => {
      throw saveFailure
    })
    httpServer = createServer((_request, response) => response.end('still-running'))
    core = attachYjsCore({
      httpServer,
      logger: createNoopLogger(),
      saveDebounceMs: 60_000,
      saveMaxWaitMs: 60_000,
      socketPath: SOCKET_PATH,
      store,
      tokenSecret: TOKEN_SECRET,
    })
    const origin = await listen(httpServer)
    const client = connect(origin, 'workspace-rejecting-store', mintToken('workspace-rejecting-store'))
    clients.push(client)

    const bootstrapBytes = await new Promise<Uint8Array>((resolve, reject) => {
      client.once(SOCKET_EVENT_BOOTSTRAP, resolve)
      client.once('connect_error', reject)
    })
    const bootstrap = decodeBootstrapPayload(bootstrapBytes)
    const rootBootstrap = bootstrap.docs.find((doc) => doc.kind === 'root')
    expect(rootBootstrap).toBeDefined()

    const room = await core.roomManager.getRoom('workspace-rejecting-store')
    const roomInternals = room as unknown as {
      destroyed: boolean
      rootDirty: boolean
      rootState: { teardown(): void }
    }
    const rootTeardown = vi.spyOn(roomInternals.rootState, 'teardown')
    const engineClose = vi.spyOn(core.io.engine, 'close')

    const clientDoc = new Y.Doc()
    Y.applyUpdateV2(clientDoc, rootBootstrap?.update as Uint8Array)
    const updates: Uint8Array[] = []
    clientDoc.on('updateV2', (update) => updates.push(update))
    const root = clientDoc.getMap('state').get('root') as Y.Map<unknown>
    root.set('name', 'cannot persist this update')
    client.emit(SOCKET_EVENT_UPDATE, {
      docId: 'root',
      generation: rootBootstrap?.generation,
      kind: 'root',
      update: updates.at(-1),
    })

    await vi.waitFor(() => expect(roomInternals.rootDirty).toBe(true), { timeout: 1_000 })

    let closeError: unknown
    try {
      await core.close()
    } catch (error) {
      closeError = error
    }

    expect(closeError).toBeInstanceOf(AggregateError)
    expect((closeError as AggregateError).errors).toContain(saveFailure)
    expect(store.saveRoot).toHaveBeenCalled()
    expect(rootTeardown).toHaveBeenCalledTimes(1)
    expect(roomInternals.destroyed).toBe(true)
    expect(roomInternals.rootDirty).toBe(false)
    expect(core.roomManager.activeRoomCount).toBe(0)
    expect(engineClose).toHaveBeenCalledTimes(1)
    expect(httpServer.listening).toBe(true)
    await expect(fetch(origin).then((response) => response.text())).resolves.toBe('still-running')

    await expect(core.close()).rejects.toBe(closeError)
    expect(engineClose).toHaveBeenCalledTimes(1)
    core = null
  })
})
