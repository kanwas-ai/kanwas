import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness.js'
import * as Y from 'yjs'
import {
  createWorkspaceContentStore,
  decodeBootstrapPayload,
  type BootstrapBinaryPayload,
  type DocumentShareSocketAccessResolveResult,
  type WorkspaceBootstrapPayload,
} from 'shared'
import { NoteSocketProvider } from 'shared/note-provider'
import { getNoteDocMeta } from 'shared/note-doc'
import { createNoteDoc } from 'shared/note-doc'
import { MigratingDocumentStore } from '../../src/migrating-document-store.js'
import { startYjsServer, type RunningYjsServer } from '../../src/server.js'
import {
  SOCKET_EVENT_AWARENESS,
  SOCKET_EVENT_AWARENESS_SUBSCRIPTION,
  SOCKET_EVENT_BOOTSTRAP,
  SOCKET_EVENT_RELOAD,
  SOCKET_EVENT_UPDATE,
} from '../../src/protocol.js'
import type { DocumentStore, LegacyDocumentStore } from '../../src/storage.js'
import { createNoopLogger } from '../helpers/test-utils.js'
import { createBlockNoteNode, createCanvas, createLegacyDocumentBytes } from '../helpers/workspace-fixtures.js'

const TEST_ADMIN_SECRET = 'secret'

interface SocketOptions {
  longHashId?: string
  noteId?: string
  roomType?: 'workspace' | 'note'
  skipBootstrapValidation?: boolean
  workspaceId: string
  socketToken?: string | null
  tokenWorkspaceId?: string
  tokenExp?: number
  secret?: string
}

interface MintTokenOptions {
  workspaceId: string
  userId?: string
  mode?: 'editable' | 'read-only'
  exp?: number
  secret?: string
}

function mintTestSocketToken(opts: MintTokenOptions): string {
  const payload = {
    wid: opts.workspaceId,
    uid: opts.userId ?? 'test-user',
    mode: opts.mode ?? 'editable',
    exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600,
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const sig = createHmac('sha256', opts.secret ?? TEST_ADMIN_SECRET)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

function createRootDoc(noteIds: string[] = []): Y.Doc {
  const doc = new Y.Doc()
  doc.getMap('state').set('root', {
    id: 'root',
    name: '',
    kind: 'canvas',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items: [],
  })
  const notes = doc.getMap<Y.Doc>('notes')
  for (const noteId of noteIds) {
    notes.set(noteId, new Y.Doc({ guid: noteId }))
  }
  return doc
}

function createCorruptedRootDoc(): Y.Doc {
  const doc = new Y.Doc()
  doc.getMap('state').set('root', {
    id: 'root',
    name: '',
    kind: 'canvas',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items: [
      {
        id: 'projects',
        name: 'projects',
        kind: 'canvas',
        xynode: { id: 'projects', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
        edges: [],
      },
    ],
  })
  return doc
}

function setBlockNoteText(noteDoc: Y.Doc, text: string): void {
  const fragment = noteDoc.getXmlFragment('content')
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

function createBlockNoteDoc(noteId: string, text: string): Y.Doc {
  const noteDoc = createNoteDoc(noteId, 'blockNote')
  setBlockNoteText(noteDoc, text)
  return noteDoc
}

function readBlockNoteText(noteDoc: Y.Doc): string {
  return noteDoc.getXmlFragment('content').toString()
}

function toBundle(rootDoc: Y.Doc, notes: Record<string, Y.Doc> = {}) {
  return {
    notes: Object.fromEntries(
      Object.entries(notes).map(([noteId, noteDoc]) => [
        noteId,
        Buffer.from(Y.encodeStateAsUpdateV2(noteDoc)).toString('base64'),
      ])
    ),
    root: Buffer.from(Y.encodeStateAsUpdateV2(rootDoc)).toString('base64'),
  }
}

function getBaseUrl(server: RunningYjsServer): string {
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected Yjs server to listen on an address object')
  }

  return `http://127.0.0.1:${address.port}`
}

function createClientSocket(baseUrl: string, options: SocketOptions): ClientSocket {
  const resolveSocketToken = (): string | null => {
    if (options.socketToken !== undefined) {
      return options.socketToken
    }
    if (options.longHashId) {
      return null
    }
    return mintTestSocketToken({
      workspaceId: options.tokenWorkspaceId ?? options.workspaceId,
      exp: options.tokenExp,
      secret: options.secret,
    })
  }

  return createSocketClient(baseUrl, {
    auth: {
      longHashId: options.longHashId,
      noteId: options.noteId,
      roomType: options.roomType ?? 'workspace',
      skipBootstrapValidation: options.skipBootstrapValidation,
      workspaceId: options.workspaceId,
      socketToken: resolveSocketToken(),
    },
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  })
}

async function waitForDisconnectOrError(socket: ClientSocket, timeoutMs = 2000): Promise<void> {
  if (socket.disconnected && !socket.connected) {
    // already rejected / not yet connecting; attempt connect so we observe the failure
    socket.connect()
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Expected socket to disconnect or fail within ${timeoutMs}ms`))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      socket.off('connect_error', handleError)
      socket.off('disconnect', handleDisconnect)
    }

    const handleDisconnect = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      resolve()
    }

    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleError)
  })
}

async function waitForConnect(socket: ClientSocket): Promise<void> {
  if (socket.connected) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleError)
    }

    const handleConnect = () => {
      cleanup()
      resolve()
    }

    const handleError = (error: Error) => {
      cleanup()
      reject(error)
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleError)
    socket.connect()
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Timed out waiting for condition')
}

function onceBootstrap(socket: ClientSocket): Promise<WorkspaceBootstrapPayload> {
  return new Promise((resolve) => {
    socket.once(SOCKET_EVENT_BOOTSTRAP, (payload: BootstrapBinaryPayload) => resolve(decodeBootstrapPayload(payload)))
  })
}

function onceUpdate(socket: ClientSocket): Promise<WorkspaceBootstrapPayload['docs'][number]> {
  return new Promise((resolve) => {
    socket.once(SOCKET_EVENT_UPDATE, (payload: WorkspaceBootstrapPayload['docs'][number]) => resolve(payload))
  })
}

function onceDisconnect(socket: ClientSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('disconnect', (reason) => resolve(reason))
  })
}

function createDocumentShareResolver(resolve: (longHashId: string) => DocumentShareSocketAccessResolveResult) {
  return {
    enabled: true,
    resolveSocketAccess: vi.fn(async (longHashId: string) => resolve(longHashId)),
  }
}

function createNoteAwarenessUpdate(noteId: string, userId = 'socketio-note-user'): Uint8Array {
  const doc = new Y.Doc({ guid: `${noteId}-awareness` })
  const awareness = new Awareness(doc)

  awareness.setLocalState({ user: { id: userId } })

  return encodeAwarenessUpdate(awareness, [doc.clientID])
}

function applyWorkspaceBootstrap(rootDoc: Y.Doc, payload: WorkspaceBootstrapPayload): void {
  for (const docPayload of payload.docs) {
    if (docPayload.kind === 'root') {
      Y.applyUpdateV2(rootDoc, docPayload.update)
      continue
    }

    const noteDoc = rootDoc.getMap<Y.Doc>('notes').get(docPayload.docId)
    if (!noteDoc) {
      throw new Error(`Missing attached note doc ${docPayload.docId}`)
    }

    Y.applyUpdateV2(noteDoc, docPayload.update)
  }
}

function applyNoteBootstrap(noteDoc: Y.Doc, noteId: string, payload: WorkspaceBootstrapPayload): void {
  if (payload.docs.length !== 1) {
    throw new Error(`Expected one bootstrap doc for note ${noteId}`)
  }

  const [docPayload] = payload.docs
  if (docPayload.kind !== 'note' || docPayload.docId !== noteId) {
    throw new Error(`Expected note bootstrap for ${noteId}`)
  }

  Y.applyUpdateV2(noteDoc, docPayload.update)
}

describe('startYjsServer Socket.IO integration', () => {
  let runningServer: RunningYjsServer | null = null
  const sockets: ClientSocket[] = []

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect()
      socket.close()
    }
    sockets.length = 0

    if (runningServer) {
      runningServer.httpServer.closeAllConnections?.()
      await runningServer.close()
      runningServer = null
    }
  })

  it('bootstraps workspace rooms with root and all note docs', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello bootstrap')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), { workspaceId: 'workspace-bootstrap' })
    sockets.push(socket)

    const bootstrapPromise = onceBootstrap(socket)
    await waitForConnect(socket)
    const payload = await bootstrapPromise

    expect(payload.docs).toHaveLength(2)
    expect(payload.docs[0]).toMatchObject({ docId: 'root', kind: 'root' })
    expect(payload.docs[1]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })

    const clientRootDoc = new Y.Doc()
    applyWorkspaceBootstrap(clientRootDoc, payload)

    const clientNoteDoc = clientRootDoc.getMap<Y.Doc>('notes').get(noteId)
    expect(readBlockNoteText(clientNoteDoc as Y.Doc)).toContain('hello bootstrap')
  })

  it('bootstraps dedicated note rooms without sending the root doc', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'note room content')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), {
      workspaceId: 'workspace-note-room',
      roomType: 'note',
      noteId,
    })
    sockets.push(socket)

    const bootstrapPromise = onceBootstrap(socket)
    await waitForConnect(socket)
    const payload = await bootstrapPromise

    expect(payload.docs).toHaveLength(1)
    expect(payload.docs[0]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })

    const clientNoteDoc = new Y.Doc({ guid: noteId })
    applyNoteBootstrap(clientNoteDoc, noteId, payload)
    expect(readBlockNoteText(clientNoteDoc)).toContain('note room content')
  })

  it('allows recovery sockets to bootstrap persisted invalid workspace roots', async () => {
    const workspaceId = 'workspace-invalid-root-recovery'
    const corruptedRootDoc = createCorruptedRootDoc()
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(corruptedRootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const recoverySocket = createClientSocket(getBaseUrl(runningServer), {
      skipBootstrapValidation: true,
      workspaceId,
    })
    sockets.push(recoverySocket)

    const bootstrapPromise = onceBootstrap(recoverySocket)
    await waitForConnect(recoverySocket)
    const payload = await bootstrapPromise

    expect(payload.docs).toHaveLength(1)
    expect(payload.docs[0]).toMatchObject({ docId: 'root', kind: 'root' })

    const clientRootDoc = new Y.Doc()
    applyWorkspaceBootstrap(clientRootDoc, payload)
    expect(clientRootDoc.getMap('state').toJSON().root).toMatchObject({
      items: [
        {
          id: 'projects',
          kind: 'canvas',
          name: 'projects',
        },
      ],
    })
  })

  it('keeps rejecting strict sockets after a recovery socket initialized an invalid workspace room', async () => {
    const workspaceId = 'workspace-invalid-root-strict-after-recovery'
    const corruptedRootDoc = createCorruptedRootDoc()
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(corruptedRootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const recoverySocket = createClientSocket(baseUrl, {
      skipBootstrapValidation: true,
      workspaceId,
    })
    sockets.push(recoverySocket)

    const recoveryBootstrapPromise = onceBootstrap(recoverySocket)
    await waitForConnect(recoverySocket)
    await recoveryBootstrapPromise

    const strictSocket = createClientSocket(baseUrl, { workspaceId })
    sockets.push(strictSocket)

    let strictBootstrapReceived = false
    strictSocket.on(SOCKET_EVENT_BOOTSTRAP, () => {
      strictBootstrapReceived = true
    })

    const strictDisconnectPromise = onceDisconnect(strictSocket)
    await waitForConnect(strictSocket)
    const disconnectReason = await strictDisconnectPromise

    expect(disconnectReason).toBe('io server disconnect')
    expect(strictBootstrapReceived).toBe(false)
  })

  it('reconnects dedicated note providers and flushes local edits made while offline', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-note-provider-reconnect'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'note room before reconnect')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const provider = new NoteSocketProvider(baseUrl, workspaceId, noteId, new Y.Doc({ guid: noteId }), {
      connect: false,
      params: () => ({ socketToken: mintTestSocketToken({ workspaceId }) }),
    })

    try {
      const reconnectStates: boolean[] = []
      provider.on('status', () => {
        reconnectStates.push(provider.isReconnecting)
      })

      provider.connect()
      await provider.whenSynced()

      expect(readBlockNoteText(provider.doc)).toContain('note room before reconnect')

      const socketId = provider.socket?.id
      if (!socketId) {
        throw new Error('Expected connected provider socket id')
      }

      const serverSocket = runningServer.io.sockets.sockets.get(socketId) as
        | ({ conn: { close: () => void } } & object)
        | undefined
      if (!serverSocket) {
        throw new Error(`Expected server socket for provider ${socketId}`)
      }

      reconnectStates.length = 0
      serverSocket.conn.close()

      await waitFor(() => !provider.synced)
      const reconnectPromise = provider.whenSynced()
      setBlockNoteText(provider.doc, 'edited while reconnecting')

      await reconnectPromise
      await waitFor(() => reconnectStates.includes(true) && provider.connected && provider.synced)

      const recoverySocket = createClientSocket(baseUrl, {
        workspaceId,
        roomType: 'note',
        noteId,
      })
      sockets.push(recoverySocket)

      const recoveryBootstrapPromise = onceBootstrap(recoverySocket)
      await waitForConnect(recoverySocket)
      const recoveryPayload = await recoveryBootstrapPromise

      const recoveryDoc = new Y.Doc({ guid: noteId })
      applyNoteBootstrap(recoveryDoc, noteId, recoveryPayload)

      expect(readBlockNoteText(recoveryDoc)).toContain('edited while reconnecting')
      expect(reconnectStates).toContain(true)
    } finally {
      provider.destroy()
    }
  })

  it('accepts editable shared-link note sockets and syncs updates into the workspace room', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-shared-editable'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'shared editable before update')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId,
      accessMode: 'editable',
      active: true,
      revoked: false,
      status: 'active',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(baseUrl, { workspaceId })
    const sharedSocket = createClientSocket(baseUrl, {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-editable-token-1234',
    })
    sockets.push(workspaceSocket, sharedSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const sharedBootstrapPromise = onceBootstrap(sharedSocket)
    await waitForConnect(workspaceSocket)
    await waitForConnect(sharedSocket)

    const workspaceRootDoc = new Y.Doc()
    const sharedNoteDoc = new Y.Doc({ guid: noteId })
    applyWorkspaceBootstrap(workspaceRootDoc, await workspaceBootstrapPromise)
    applyNoteBootstrap(sharedNoteDoc, noteId, await sharedBootstrapPromise)

    const workspaceNoteDoc = workspaceRootDoc.getMap<Y.Doc>('notes').get(noteId)
    if (!workspaceNoteDoc) {
      throw new Error('Expected workspace note doc from bootstrap')
    }

    setBlockNoteText(sharedNoteDoc, 'from editable shared link')

    const workspaceUpdatePromise = onceUpdate(workspaceSocket)
    sharedSocket.emit(SOCKET_EVENT_UPDATE, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(sharedNoteDoc),
    })

    const workspacePayload = await workspaceUpdatePromise
    expect(workspacePayload).toMatchObject({ docId: noteId, kind: 'note', generation: 1 })
    Y.applyUpdateV2(workspaceNoteDoc, workspacePayload.update)
    expect(readBlockNoteText(workspaceNoteDoc)).toContain('from editable shared link')

    await waitFor(() => store.saveNote.mock.calls.length >= 1)
    expect(store.saveNote).toHaveBeenCalledWith(workspaceId, noteId, expect.any(Uint8Array), expect.any(Object))
    expect(documentShareResolver.resolveSocketAccess).toHaveBeenCalledTimes(1)
  })

  it('rejects readonly shared-link writes without breaking note awareness', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-shared-readonly'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'shared readonly before update')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId,
      accessMode: 'readonly',
      active: true,
      revoked: false,
      status: 'active',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(baseUrl, { workspaceId })
    const sharedSocket = createClientSocket(baseUrl, {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-readonly-token-1234',
    })
    sockets.push(workspaceSocket, sharedSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const sharedBootstrapPromise = onceBootstrap(sharedSocket)
    const workspaceUpdatePayloads: Array<WorkspaceBootstrapPayload['docs'][number]> = []
    const workspaceAwarenessPayloads: Array<WorkspaceBootstrapPayload['docs'][number]> = []
    workspaceSocket.on(SOCKET_EVENT_UPDATE, (payload: WorkspaceBootstrapPayload['docs'][number]) => {
      if (payload.docId === noteId) {
        workspaceUpdatePayloads.push(payload)
      }
    })
    workspaceSocket.on(SOCKET_EVENT_AWARENESS, (payload: WorkspaceBootstrapPayload['docs'][number]) => {
      if (payload.docId === noteId) {
        workspaceAwarenessPayloads.push(payload)
      }
    })

    await waitForConnect(workspaceSocket)
    await waitForConnect(sharedSocket)
    await workspaceBootstrapPromise

    const sharedNoteDoc = new Y.Doc({ guid: noteId })
    applyNoteBootstrap(sharedNoteDoc, noteId, await sharedBootstrapPromise)

    workspaceSocket.emit(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    sharedSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'before-readonly-reject'),
    })

    await waitFor(() => workspaceAwarenessPayloads.length >= 1)
    workspaceAwarenessPayloads.length = 0

    setBlockNoteText(sharedNoteDoc, 'readonly shared link write attempt')
    sharedSocket.emit(SOCKET_EVENT_UPDATE, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(sharedNoteDoc),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(sharedSocket.connected).toBe(true)
    expect(workspaceUpdatePayloads).toEqual([])
    expect(store.saveNote).not.toHaveBeenCalled()

    sharedSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'after-readonly-reject'),
    })

    await waitFor(() => workspaceAwarenessPayloads.length >= 1)
  })

  it('disconnects shared-link note sockets that send malformed document payloads', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-shared-malformed-payload'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'shared malformed payload content')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId,
      accessMode: 'editable',
      active: true,
      revoked: false,
      status: 'active',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const malformedSocket = createClientSocket(baseUrl, {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-malformed-payload-token-1234',
    })
    sockets.push(malformedSocket)

    const bootstrapPromise = onceBootstrap(malformedSocket)
    await waitForConnect(malformedSocket)
    await bootstrapPromise

    const disconnectPromise = onceDisconnect(malformedSocket)
    malformedSocket.emit(SOCKET_EVENT_UPDATE, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: null,
    })

    expect(await disconnectPromise).toBe('io server disconnect')
    expect(store.saveNote).not.toHaveBeenCalled()

    const recoverySocket = createClientSocket(baseUrl, {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-malformed-payload-token-1234',
    })
    sockets.push(recoverySocket)

    const recoveryBootstrapPromise = onceBootstrap(recoverySocket)
    await waitForConnect(recoverySocket)
    await recoveryBootstrapPromise

    expect(recoverySocket.connected).toBe(true)
  })

  it('rejects revoked shared-link note sockets before bootstrap', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-shared-revoked'
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => null),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId,
      accessMode: 'readonly',
      active: false,
      revoked: true,
      status: 'revoked',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-revoked-token-1234',
    })
    sockets.push(socket)

    let bootstrapReceived = false
    socket.on(SOCKET_EVENT_BOOTSTRAP, () => {
      bootstrapReceived = true
    })

    const disconnectPromise = onceDisconnect(socket)
    await waitForConnect(socket)
    const disconnectReason = await disconnectPromise

    expect(disconnectReason).toBe('io server disconnect')
    expect(bootstrapReceived).toBe(false)
    expect(documentShareResolver.resolveSocketAccess).toHaveBeenCalledTimes(1)
    expect(store.loadRoot).not.toHaveBeenCalled()
  })

  it('rejects shared-link note sockets when the requested note does not match the share', async () => {
    const workspaceId = 'workspace-shared-mismatch'
    const sharedNoteId = 'note-1'
    const requestedNoteId = 'note-2'
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => null),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId: sharedNoteId,
      accessMode: 'editable',
      active: true,
      revoked: false,
      status: 'active',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), {
      workspaceId,
      roomType: 'note',
      noteId: requestedNoteId,
      longHashId: 'shared-link-mismatch-token-1234',
    })
    sockets.push(socket)

    let bootstrapReceived = false
    socket.on(SOCKET_EVENT_BOOTSTRAP, () => {
      bootstrapReceived = true
    })

    const disconnectPromise = onceDisconnect(socket)
    await waitForConnect(socket)
    const disconnectReason = await disconnectPromise

    expect(disconnectReason).toBe('io server disconnect')
    expect(bootstrapReceived).toBe(false)
    expect(documentShareResolver.resolveSocketAccess).toHaveBeenCalledTimes(1)
    expect(store.loadRoot).not.toHaveBeenCalled()
  })

  it('keeps awareness flowing between workspace and shared-link note clients', async () => {
    const noteId = 'note-1'
    const workspaceId = 'workspace-shared-awareness'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'shared awareness content')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }
    const documentShareResolver = createDocumentShareResolver((longHashId) => ({
      longHashId,
      workspaceId,
      noteId,
      accessMode: 'readonly',
      active: true,
      revoked: false,
      status: 'active',
    }))

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      documentShareResolver,
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(baseUrl, { workspaceId })
    const sharedSocket = createClientSocket(baseUrl, {
      workspaceId,
      roomType: 'note',
      noteId,
      longHashId: 'shared-link-awareness-token-1234',
    })
    sockets.push(workspaceSocket, sharedSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const sharedBootstrapPromise = onceBootstrap(sharedSocket)
    const workspaceAwarenessPayloads: Array<WorkspaceBootstrapPayload['docs'][number]> = []
    const sharedAwarenessPayloads: Array<WorkspaceBootstrapPayload['docs'][number]> = []
    workspaceSocket.on(SOCKET_EVENT_AWARENESS, (payload: WorkspaceBootstrapPayload['docs'][number]) => {
      if (payload.docId === noteId) {
        workspaceAwarenessPayloads.push(payload)
      }
    })
    sharedSocket.on(SOCKET_EVENT_AWARENESS, (payload: WorkspaceBootstrapPayload['docs'][number]) => {
      if (payload.docId === noteId) {
        sharedAwarenessPayloads.push(payload)
      }
    })

    await waitForConnect(workspaceSocket)
    await waitForConnect(sharedSocket)
    await workspaceBootstrapPromise
    await sharedBootstrapPromise

    workspaceSocket.emit(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    sharedSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'shared-link-user'),
    })

    await waitFor(() => workspaceAwarenessPayloads.length >= 1)

    workspaceSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'workspace-user'),
    })

    await waitFor(() => sharedAwarenessPayloads.length >= 1)
  })

  it('only sends note awareness to workspace sockets after subscribe and stops after unsubscribe', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'note awareness content')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(baseUrl, { workspaceId: 'workspace-awareness-toggle' })
    const noteSocket = createClientSocket(baseUrl, {
      workspaceId: 'workspace-awareness-toggle',
      roomType: 'note',
      noteId,
    })
    sockets.push(workspaceSocket, noteSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const noteBootstrapPromise = onceBootstrap(noteSocket)
    const workspaceAwarenessPayloads: Array<WorkspaceBootstrapPayload['docs'][number]> = []
    workspaceSocket.on(SOCKET_EVENT_AWARENESS, (payload: WorkspaceBootstrapPayload['docs'][number]) => {
      workspaceAwarenessPayloads.push(payload)
    })

    await waitForConnect(workspaceSocket)
    await waitForConnect(noteSocket)
    await workspaceBootstrapPromise
    await noteBootstrapPromise
    workspaceAwarenessPayloads.length = 0

    noteSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'before-subscribe'),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workspaceAwarenessPayloads.filter((payload) => payload.docId === noteId)).toEqual([])

    workspaceSocket.emit(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    await waitFor(() => workspaceAwarenessPayloads.some((payload) => payload.docId === noteId))
    expect(workspaceAwarenessPayloads.find((payload) => payload.docId === noteId)).toMatchObject({
      docId: noteId,
      generation: 1,
      kind: 'note',
    })

    workspaceAwarenessPayloads.length = 0
    workspaceSocket.emit(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, {
      action: 'unsubscribe',
      docId: noteId,
      kind: 'note',
    })

    noteSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'after-unsubscribe'),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(workspaceAwarenessPayloads.filter((payload) => payload.docId === noteId)).toEqual([])
  })

  it('queues early awareness subscriptions until workspace bootstrap is ready', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'delayed note load')
    let resolveLoadNote: ((value: Uint8Array) => void) | null = null
    const loadNotePromise = new Promise<Uint8Array>((resolve) => {
      resolveLoadNote = resolve
    })

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => loadNotePromise),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), { workspaceId: 'workspace-queued-awareness' })
    sockets.push(socket)

    let disconnectReason: string | null = null
    socket.on('connect', () => {
      socket.emit(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, {
        action: 'subscribe',
        docId: noteId,
        kind: 'note',
      })
    })
    socket.on('disconnect', (reason) => {
      disconnectReason = reason
    })

    const bootstrapPromise = onceBootstrap(socket)
    await waitForConnect(socket)
    await new Promise((resolve) => setTimeout(resolve, 50))
    resolveLoadNote?.(Y.encodeStateAsUpdateV2(noteDoc))

    const payload = await bootstrapPromise

    expect(disconnectReason).toBeNull()
    expect(payload.docs).toHaveLength(2)
    expect(payload.docs[0]).toMatchObject({ docId: 'root', kind: 'root' })
    expect(payload.docs[1]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })

    const noteSocket = createClientSocket(getBaseUrl(runningServer), {
      workspaceId: 'workspace-queued-awareness',
      roomType: 'note',
      noteId,
    })
    sockets.push(noteSocket)
    const noteBootstrapPromise = onceBootstrap(noteSocket)
    await waitForConnect(noteSocket)
    await noteBootstrapPromise

    let receivedQueuedSubscriptionAwareness = false
    socket.once(SOCKET_EVENT_AWARENESS, (message: WorkspaceBootstrapPayload['docs'][number]) => {
      if (message.docId === noteId && message.kind === 'note') {
        receivedQueuedSubscriptionAwareness = true
      }
    })

    noteSocket.emit(SOCKET_EVENT_AWARENESS, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate(noteId, 'queued-subscription'),
    })

    await waitFor(() => receivedQueuedSubscriptionAwareness)
  })

  it('migrates legacy storage end-to-end and serves persisted v3 docs on restart', async () => {
    const workspaceId = 'workspace-legacy-end-to-end'
    const roots = new Map<string, Uint8Array>()
    const notesByWorkspace = new Map<string, Map<string, Uint8Array>>()
    const legacyDocument = await createLegacyDocumentBytes(
      createCanvas('root', '', [
        createBlockNoteNode('legacy-note', 'Legacy Note'),
        createBlockNoteNode('empty-note', 'Empty Note'),
      ]),
      {
        blockNotes: {
          'legacy-note': '# Hello from legacy migration',
        },
      }
    )

    const baseStore: LegacyDocumentStore = {
      deleteNote: vi.fn(async (requestedWorkspaceId, noteId) => {
        notesByWorkspace.get(requestedWorkspaceId)?.delete(noteId)
      }),
      loadLegacyDocument: vi.fn(async () => legacyDocument),
      loadNote: vi.fn(async (requestedWorkspaceId, noteId) => {
        return notesByWorkspace.get(requestedWorkspaceId)?.get(noteId) ?? null
      }),
      loadRoot: vi.fn(async (requestedWorkspaceId) => roots.get(requestedWorkspaceId) ?? null),
      saveNote: vi.fn(async (requestedWorkspaceId, noteId, bytes) => {
        const notes = notesByWorkspace.get(requestedWorkspaceId) ?? new Map<string, Uint8Array>()
        notes.set(noteId, bytes)
        notesByWorkspace.set(requestedWorkspaceId, notes)
      }),
      saveRoot: vi.fn(async (requestedWorkspaceId, bytes) => {
        roots.set(requestedWorkspaceId, bytes)
      }),
    }
    const store = new MigratingDocumentStore(baseStore, createNoopLogger())

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const firstBaseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(firstBaseUrl, { workspaceId })
    const noteSocket = createClientSocket(firstBaseUrl, {
      workspaceId,
      roomType: 'note',
      noteId: 'empty-note',
    })
    sockets.push(workspaceSocket, noteSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const noteBootstrapPromise = onceBootstrap(noteSocket)
    await waitForConnect(workspaceSocket)
    await waitForConnect(noteSocket)

    const workspacePayload = await workspaceBootstrapPromise
    const notePayload = await noteBootstrapPromise

    expect(baseStore.loadLegacyDocument).toHaveBeenCalledTimes(1)
    expect(baseStore.saveRoot).toHaveBeenCalledTimes(1)
    expect(baseStore.saveNote).toHaveBeenCalledTimes(2)
    expect(workspacePayload.docs).toHaveLength(3)
    expect(notePayload.docs).toHaveLength(1)

    const firstClientRootDoc = new Y.Doc()
    const dedicatedEmptyNoteDoc = new Y.Doc({ guid: 'empty-note' })
    try {
      applyWorkspaceBootstrap(firstClientRootDoc, workspacePayload)
      applyNoteBootstrap(dedicatedEmptyNoteDoc, 'empty-note', notePayload)

      expect(
        firstClientRootDoc
          .getMap<any>('state')
          .toJSON()
          .root.items.map((item: { id: string }) => item.id)
      ).toEqual(['legacy-note', 'empty-note'])

      const contentStore = createWorkspaceContentStore(firstClientRootDoc)
      expect(getNoteDocMeta(firstClientRootDoc.getMap<Y.Doc>('notes').get('legacy-note') as Y.Doc)).toEqual({
        contentKind: 'blockNote',
        noteId: 'legacy-note',
        schemaVersion: 1,
      })
      expect(getNoteDocMeta(firstClientRootDoc.getMap<Y.Doc>('notes').get('empty-note') as Y.Doc)).toEqual({
        contentKind: 'blockNote',
        noteId: 'empty-note',
        schemaVersion: 1,
      })
      expect(readBlockNoteText(firstClientRootDoc.getMap<Y.Doc>('notes').get('legacy-note') as Y.Doc)).toContain(
        'Hello from legacy migration'
      )
      expect(contentStore.getBlockNoteFragment('empty-note')?.length).toBe(0)
      expect(getNoteDocMeta(dedicatedEmptyNoteDoc)).toEqual({
        contentKind: 'blockNote',
        noteId: 'empty-note',
        schemaVersion: 1,
      })
      expect(dedicatedEmptyNoteDoc.getXmlFragment('content').length).toBe(0)
    } finally {
      dedicatedEmptyNoteDoc.destroy()
      firstClientRootDoc.destroy()
    }

    workspaceSocket.disconnect()
    workspaceSocket.close()
    noteSocket.disconnect()
    noteSocket.close()
    runningServer.httpServer.closeAllConnections?.()
    await runningServer.close()

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const secondSocket = createClientSocket(getBaseUrl(runningServer), { workspaceId })
    sockets.push(secondSocket)
    const secondBootstrapPromise = onceBootstrap(secondSocket)
    await waitForConnect(secondSocket)

    const secondPayload = await secondBootstrapPromise
    expect(baseStore.loadLegacyDocument).toHaveBeenCalledTimes(1)
    expect(baseStore.saveRoot).toHaveBeenCalledTimes(1)
    expect(baseStore.saveNote).toHaveBeenCalledTimes(2)
    expect(secondPayload.docs).toHaveLength(3)

    const secondClientRootDoc = new Y.Doc()
    try {
      applyWorkspaceBootstrap(secondClientRootDoc, secondPayload)
      expect(
        secondClientRootDoc
          .getMap<any>('state')
          .toJSON()
          .root.items.map((item: { id: string }) => item.id)
      ).toEqual(['legacy-note', 'empty-note'])
      expect(readBlockNoteText(secondClientRootDoc.getMap<Y.Doc>('notes').get('legacy-note') as Y.Doc)).toContain(
        'Hello from legacy migration'
      )
      expect(createWorkspaceContentStore(secondClientRootDoc).getBlockNoteFragment('empty-note')?.length).toBe(0)
    } finally {
      secondClientRootDoc.destroy()
    }
  }, 15_000)

  it('syncs note updates between workspace rooms and dedicated note rooms', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'before update')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const baseUrl = getBaseUrl(runningServer)
    const workspaceSocket = createClientSocket(baseUrl, { workspaceId: 'workspace-update' })
    const noteSocket = createClientSocket(baseUrl, {
      workspaceId: 'workspace-update',
      roomType: 'note',
      noteId,
    })
    sockets.push(workspaceSocket, noteSocket)

    const workspaceBootstrapPromise = onceBootstrap(workspaceSocket)
    const noteBootstrapPromise = onceBootstrap(noteSocket)
    await waitForConnect(workspaceSocket)
    await waitForConnect(noteSocket)

    const workspaceRootDoc = new Y.Doc()
    const dedicatedNoteDoc = new Y.Doc({ guid: noteId })
    applyWorkspaceBootstrap(workspaceRootDoc, await workspaceBootstrapPromise)
    applyNoteBootstrap(dedicatedNoteDoc, noteId, await noteBootstrapPromise)

    const workspaceNoteDoc = workspaceRootDoc.getMap<Y.Doc>('notes').get(noteId)
    if (!workspaceNoteDoc) {
      throw new Error('Expected workspace note doc from bootstrap')
    }

    setBlockNoteText(dedicatedNoteDoc, 'from note room')

    const workspaceUpdatePromise = onceUpdate(workspaceSocket)
    noteSocket.emit(SOCKET_EVENT_UPDATE, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(dedicatedNoteDoc),
    })

    const workspacePayload = await workspaceUpdatePromise
    expect(workspacePayload).toMatchObject({ docId: noteId, kind: 'note', generation: 1 })
    Y.applyUpdateV2(workspaceNoteDoc, workspacePayload.update)
    expect(readBlockNoteText(workspaceNoteDoc)).toContain('from note room')

    setBlockNoteText(workspaceNoteDoc, 'from workspace room')

    const noteRoomUpdatePromise = onceUpdate(noteSocket)
    workspaceSocket.emit(SOCKET_EVENT_UPDATE, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(workspaceNoteDoc),
    })

    const noteRoomPayload = await noteRoomUpdatePromise
    expect(noteRoomPayload).toMatchObject({ docId: noteId, kind: 'note', generation: 1 })
    Y.applyUpdateV2(dedicatedNoteDoc, noteRoomPayload.update)
    expect(readBlockNoteText(dedicatedNoteDoc)).toContain('from workspace room')

    await waitFor(() => store.saveNote.mock.calls.length >= 1)
    expect(store.saveNote).toHaveBeenCalledWith('workspace-update', noteId, expect.any(Uint8Array), expect.any(Object))
    expect(store.saveRoot).not.toHaveBeenCalled()
  })

  it('broadcasts reload and disconnects sockets when applying a snapshot bundle', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier: {
        notifyDocumentUpdated: vi.fn(async () => true),
      },
      host: '127.0.0.1',
      logger: createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10_000,
      socketPingTimeoutMs: 5_000,
      store,
    })

    const socket = createClientSocket(getBaseUrl(runningServer), { workspaceId: 'workspace-reload' })
    sockets.push(socket)

    let reloadReceived = false
    socket.on(SOCKET_EVENT_RELOAD, () => {
      reloadReceived = true
    })

    const bootstrapPromise = onceBootstrap(socket)
    await waitForConnect(socket)
    await bootstrapPromise

    const replacementRoot = createRootDoc()
    replacementRoot.getMap('state').set('root', {
      id: 'root',
      name: 'replaced',
      kind: 'canvas',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [],
    })
    const response = await fetch(
      `http://${getBaseUrl(runningServer).replace('http://', '')}/documents/workspace-reload/replace`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toBundle(replacementRoot)),
      }
    )

    expect(response.ok).toBe(true)
    await waitFor(() => reloadReceived)
    await waitFor(() => socket.disconnected)
  })

  describe('socket token authentication', () => {
    async function startAuthTestServer(): Promise<RunningYjsServer> {
      const rootDoc = createRootDoc()
      const store: DocumentStore = {
        deleteNote: vi.fn(async () => undefined),
        loadNote: vi.fn(async () => null),
        loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
        saveNote: vi.fn(async () => undefined),
        saveRoot: vi.fn(async () => undefined),
      }

      return startYjsServer({
        adminSecret: TEST_ADMIN_SECRET,
        backendNotifier: {
          notifyDocumentUpdated: vi.fn(async () => true),
        },
        host: '127.0.0.1',
        logger: createNoopLogger(),
        port: 0,
        saveDebounceMs: 5,
        socketPingIntervalMs: 10_000,
        socketPingTimeoutMs: 5_000,
        store,
      })
    }

    it('rejects a socket with no token and no longHashId', async () => {
      runningServer = await startAuthTestServer()

      const socket = createClientSocket(getBaseUrl(runningServer), {
        workspaceId: 'workspace-no-auth',
        socketToken: null,
      })
      sockets.push(socket)

      await waitForDisconnectOrError(socket)
      expect(socket.connected).toBe(false)
    })

    it('accepts a socket with a valid token for the handshake workspaceId', async () => {
      runningServer = await startAuthTestServer()

      const socket = createClientSocket(getBaseUrl(runningServer), {
        workspaceId: 'workspace-valid-token',
      })
      sockets.push(socket)

      const bootstrapPromise = onceBootstrap(socket)
      await waitForConnect(socket)
      await bootstrapPromise
      expect(socket.connected).toBe(true)
    })

    it('rejects a socket whose token wid does not match the handshake workspaceId', async () => {
      runningServer = await startAuthTestServer()

      const socket = createClientSocket(getBaseUrl(runningServer), {
        workspaceId: 'workspace-B',
        tokenWorkspaceId: 'workspace-A',
      })
      sockets.push(socket)

      await waitForDisconnectOrError(socket)
      expect(socket.connected).toBe(false)
    })

    it('rejects an expired token', async () => {
      runningServer = await startAuthTestServer()

      const socket = createClientSocket(getBaseUrl(runningServer), {
        workspaceId: 'workspace-expired',
        tokenExp: Math.floor(Date.now() / 1000) - 60,
      })
      sockets.push(socket)

      await waitForDisconnectOrError(socket)
      expect(socket.connected).toBe(false)
    })

    it('rejects a token signed with a different secret', async () => {
      runningServer = await startAuthTestServer()

      const socket = createClientSocket(getBaseUrl(runningServer), {
        workspaceId: 'workspace-bad-secret',
        secret: 'not-the-real-secret',
      })
      sockets.push(socket)

      await waitForDisconnectOrError(socket)
      expect(socket.connected).toBe(false)
    })
  })
})
