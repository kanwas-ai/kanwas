import { afterEach, describe, expect, it, vi } from 'vitest'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness.js'
import * as Y from 'yjs'
import { encodeBootstrapPayload } from '../../../src/workspace/bootstrap-codec.js'
import { createNoteDoc } from '../../../src/workspace/note-doc.js'
import { NoteSocketProvider } from '../../../src/workspace/note-socketio-provider.js'
import { WorkspaceSocketProvider } from '../../../src/workspace/socketio-provider.js'
import type {
  CreateNoteBundlePayload,
  WorkspaceBootstrapPayload,
  WorkspaceDocAwarenessPayload,
} from '../../../src/workspace/workspace-sync-types.js'

function createWorkspaceRootState(): Record<string, unknown> {
  return {
    id: 'root',
    kind: 'canvas',
    name: '',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    items: [],
    edges: [],
  }
}

function createCorruptedWorkspaceRootState(): Record<string, unknown> {
  return {
    ...createWorkspaceRootState(),
    items: [
      {
        id: 'projects',
        kind: 'canvas',
        name: 'projects',
        xynode: {
          id: 'projects',
          type: 'canvas',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
        edges: [],
      },
    ],
  }
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

function createPackedWorkspaceBootstrap(noteId: string, text: string): Uint8Array {
  const rootDoc = new Y.Doc()
  const noteDoc = createNoteDoc(noteId, 'blockNote')
  setBlockNoteText(noteDoc, text)
  rootDoc.getMap('state').set('root', createWorkspaceRootState())
  rootDoc.getMap<Y.Doc>('notes').set(noteId, noteDoc)

  const payload: WorkspaceBootstrapPayload = {
    docs: [
      {
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: Y.encodeStateAsUpdateV2(rootDoc),
      },
      {
        docId: noteId,
        generation: 1,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(noteDoc),
      },
    ],
  }

  return encodeBootstrapPayload(payload)
}

function createWorkspaceReconnectPayloadsAfterNoteRemoval(
  retainedNoteId: string,
  removedNoteId: string,
  retainedText: string,
  removedText: string
): {
  initial: Uint8Array
  reconnect: Uint8Array
} {
  const rootDoc = new Y.Doc()
  const retainedNoteDoc = createNoteDoc(retainedNoteId, 'blockNote')
  const removedNoteDoc = createNoteDoc(removedNoteId, 'blockNote')
  setBlockNoteText(retainedNoteDoc, retainedText)
  setBlockNoteText(removedNoteDoc, removedText)

  rootDoc.getMap('state').set('root', createWorkspaceRootState())
  const notes = rootDoc.getMap<Y.Doc>('notes')
  notes.set(retainedNoteId, retainedNoteDoc)
  notes.set(removedNoteId, removedNoteDoc)

  const initial = encodeBootstrapPayload({
    docs: [
      {
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: Y.encodeStateAsUpdateV2(rootDoc),
      },
      {
        docId: retainedNoteId,
        generation: 1,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(retainedNoteDoc),
      },
      {
        docId: removedNoteId,
        generation: 1,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(removedNoteDoc),
      },
    ],
  })

  notes.delete(removedNoteId)

  const reconnect = encodeBootstrapPayload({
    docs: [
      {
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: Y.encodeStateAsUpdateV2(rootDoc),
      },
      {
        docId: retainedNoteId,
        generation: 1,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(retainedNoteDoc),
      },
    ],
  })

  return { initial, reconnect }
}

function createCorruptedWorkspaceBootstrap(): Uint8Array {
  const rootDoc = new Y.Doc()
  rootDoc.getMap('state').set('root', createCorruptedWorkspaceRootState())

  return encodeBootstrapPayload({
    docs: [
      {
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: Y.encodeStateAsUpdateV2(rootDoc),
      },
    ],
  })
}

function createPackedNoteBootstrap(noteId: string, text: string): Uint8Array {
  const noteDoc = createNoteDoc(noteId, 'blockNote')
  setBlockNoteText(noteDoc, text)

  return encodeBootstrapPayload({
    docs: [
      {
        docId: noteId,
        generation: 1,
        kind: 'note',
        noteKind: 'blockNote',
        update: Y.encodeStateAsUpdateV2(noteDoc),
      },
    ],
  })
}

function createNoteAwarenessUpdate(noteId: string, userId = 'shared-test-user'): Uint8Array {
  const awarenessDoc = new Y.Doc({ guid: `${noteId}-awareness` })
  const awareness = new Awareness(awarenessDoc)

  awareness.setLocalState({ user: { id: userId } })

  return encodeAwarenessUpdate(awareness, [awarenessDoc.clientID])
}

function attachConnectedSocket(provider: WorkspaceSocketProvider | NoteSocketProvider): ReturnType<typeof vi.fn> {
  const emit = vi.fn()
  const connect = vi.fn()

  ;(
    provider as unknown as {
      socket: {
        active: boolean
        close: () => void
        connect: () => void
        disconnect: () => void
        emit: typeof emit
        off: () => void
      }
      connected: boolean
    }
  ).socket = {
    active: true,
    close: vi.fn(),
    connect,
    disconnect: vi.fn(),
    emit,
    off: vi.fn(),
  }
  ;(provider as unknown as { connected: boolean }).connected = true

  return emit
}

describe('WorkspaceSocketProvider URL normalization', () => {
  afterEach(() => {
    delete (globalThis as { location?: unknown }).location
  })

  it('uses http for localhost hosts', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })

    expect(provider.url).toBe('http://localhost:1999')

    provider.destroy()
  })

  it('uses https for non-local hosts by default', () => {
    const provider = new WorkspaceSocketProvider('yjs.kanwas.ai', 'workspace-1', new Y.Doc(), { connect: false })

    expect(provider.url).toBe('https://yjs.kanwas.ai')

    provider.destroy()
  })

  it('respects an explicit websocket scheme in the configured host', () => {
    const provider = new WorkspaceSocketProvider('wss://staging-yjs.kanwas.ai', 'workspace-1', new Y.Doc(), {
      connect: false,
    })

    expect(provider.url).toBe('https://staging-yjs.kanwas.ai')

    provider.destroy()
  })

  it('uses http for non-local hosts when the page itself is served over http', () => {
    ;(globalThis as { location?: { protocol: string } }).location = { protocol: 'http:' }

    const provider = new WorkspaceSocketProvider('staging-yjs.kanwas.ai', 'workspace-1', new Y.Doc(), {
      connect: false,
    })

    expect(provider.url).toBe('http://staging-yjs.kanwas.ai')

    provider.destroy()
  })
})

describe('WorkspaceSocketProvider note awareness', () => {
  it('applies packed workspace bootstrap payloads', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })

    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'hello packed workspace bootstrap')
    )

    expect(provider.synced).toBe(true)
    expect(provider.getNoteDoc('note-1')?.getXmlFragment('content').toString()).toContain(
      'hello packed workspace bootstrap'
    )

    provider.destroy()
  })

  it('rejects packed workspace bootstraps that contain canvases without items', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })
    const syncErrors: string[] = []

    provider.on('connection-error', (error) => {
      syncErrors.push(error.message)
    })
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createCorruptedWorkspaceBootstrap()
    )

    expect(provider.synced).toBe(false)
    expect(syncErrors).toEqual(['Invalid canvas tree at root > projects: canvas.items must be an array'])

    provider.destroy()
  })

  it('does not create note awareness before activation', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })

    expect(provider.getNoteAwareness('note-1')).toBeUndefined()

    provider.destroy()
  })

  it('creates and ref-counts note awareness subscriptions lazily', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })
    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { rootSynced: boolean }).rootSynced = true

    const firstAwareness = provider.acquireNoteAwareness('note-1')
    const secondAwareness = provider.acquireNoteAwareness('note-1')

    expect(firstAwareness).toBe(secondAwareness)
    expect(provider.getNoteAwareness('note-1')).toBe(firstAwareness)
    expect(emit).toHaveBeenCalledWith('yjs:awareness-subscription', {
      action: 'subscribe',
      docId: 'note-1',
      kind: 'note',
    })
    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness',
      expect.objectContaining({
        docId: 'note-1',
        generation: 1,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )

    provider.releaseNoteAwareness('note-1')
    expect(provider.getNoteAwareness('note-1')).toBe(firstAwareness)
    expect(emit).toHaveBeenCalledTimes(2)

    provider.releaseNoteAwareness('note-1')
    expect(provider.getNoteAwareness('note-1')).toBeUndefined()
    expect(emit).toHaveBeenCalledTimes(3)
    expect(emit).toHaveBeenLastCalledWith('yjs:awareness-subscription', {
      action: 'unsubscribe',
      docId: 'note-1',
      kind: 'note',
    })

    provider.destroy()
  })

  it('re-sends local note awareness when an active note becomes ready again', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })
    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { rootSynced: boolean }).rootSynced = true

    const noteAwareness = provider.acquireNoteAwareness('note-1')
    noteAwareness.setLocalStateField('user', { name: 'Test User' })
    emit.mockClear()

    const noteState = (
      provider as unknown as {
        noteStates: Map<
          string,
          { ready: boolean; generation: number; noteId: string; awareness: Awareness | null; doc: Y.Doc }
        >
        markNoteReady: (state: unknown) => void
      }
    ).noteStates.get('note-1')

    expect(noteState).toBeDefined()
    noteState!.ready = false
    ;(provider as unknown as { markNoteReady: (state: unknown) => void }).markNoteReady(noteState)

    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness',
      expect.objectContaining({
        docId: 'note-1',
        generation: noteState!.generation,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )

    provider.destroy()
  })

  it('re-subscribes only active notes on reconnect', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))
    rootDoc.getMap<Y.Doc>('notes').set('note-2', createNoteDoc('note-2', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })
    provider.acquireNoteAwareness('note-1')

    const emit = attachConnectedSocket(provider)
    emit.mockClear()
    ;(provider as unknown as { onConnected: () => void }).onConnected()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'hello packed workspace bootstrap')
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness-subscription',
      expect.objectContaining({ action: 'subscribe', docId: 'note-1', kind: 'note' })
    )
    expect(emit).not.toHaveBeenCalledWith(
      'yjs:awareness-subscription',
      expect.objectContaining({ action: 'subscribe', docId: 'note-2', kind: 'note' })
    )

    provider.destroy()
  })

  it('waits for fresh bootstrap before re-subscribing active note awareness on reconnect', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })
    provider.acquireNoteAwareness('note-1')

    const emit = attachConnectedSocket(provider)
    emit.mockClear()
    ;(provider as unknown as { onConnected: () => void }).onConnected()

    expect(emit).not.toHaveBeenCalledWith(
      'yjs:awareness-subscription',
      expect.objectContaining({ action: 'subscribe', docId: 'note-1', kind: 'note' })
    )

    provider.destroy()
  })

  it('drops stale note awareness subscriptions after reconnect bootstrap removes a note', () => {
    const rootDoc = new Y.Doc()
    const reconnectPayloads = createWorkspaceReconnectPayloadsAfterNoteRemoval('note-1', 'note-2', 'note 1', 'note 2')

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      reconnectPayloads.initial
    )
    provider.acquireNoteAwareness('note-1')
    provider.acquireNoteAwareness('note-2')

    const emit = attachConnectedSocket(provider)
    emit.mockClear()
    ;(provider as unknown as { onConnected: () => void }).onConnected()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      reconnectPayloads.reconnect
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness-subscription',
      expect.objectContaining({ action: 'subscribe', docId: 'note-1', kind: 'note' })
    )
    expect(emit).not.toHaveBeenCalledWith(
      'yjs:awareness-subscription',
      expect.objectContaining({ action: 'subscribe', docId: 'note-2', kind: 'note' })
    )
    expect(provider.getNoteAwareness('note-2')).toBeUndefined()

    provider.destroy()
  })

  it('re-sends the full workspace snapshot after reconnect bootstrap if the root doc changed while unsynced', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()
    ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
      'transport close'
    )
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()

    provider.doc.getMap('state').set('reconnect-root-edit', { updated: true })
    expect(emit).not.toHaveBeenCalled()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'server content after reconnect')
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:update',
      expect.objectContaining({
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: expect.any(Uint8Array),
      })
    )

    provider.destroy()
  })

  it('re-sends local workspace awareness after reconnect bootstrap if awareness changed while unsynced', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()
    ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
      'transport close'
    )
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()

    provider.awareness.setLocalState({ user: { name: 'Reconnect workspace user' } })
    expect(emit).not.toHaveBeenCalled()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'server content after reconnect')
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness',
      expect.objectContaining({
        docId: 'root',
        generation: 1,
        kind: 'root',
        update: expect.any(Uint8Array),
      })
    )

    provider.destroy()
  })

  it('ignores incoming note awareness while inactive', () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', createNoteDoc('note-1', 'blockNote'))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })

    ;(
      provider as unknown as { handleIncomingAwareness: (payload: WorkspaceDocAwarenessPayload) => void }
    ).handleIncomingAwareness({
      docId: 'note-1',
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate('note-1', 'inactive-user'),
    })

    expect(provider.getNoteAwareness('note-1')).toBeUndefined()

    const noteAwareness = provider.acquireNoteAwareness('note-1')
    ;(
      provider as unknown as { handleIncomingAwareness: (payload: WorkspaceDocAwarenessPayload) => void }
    ).handleIncomingAwareness({
      docId: 'note-1',
      generation: 1,
      kind: 'note',
      update: createNoteAwarenessUpdate('note-1', 'active-user'),
    })

    expect(noteAwareness.getStates().size).toBeGreaterThan(0)

    provider.destroy()
  })

  it('rejects whenSynced when the provider disconnects before workspace bootstrap completes', async () => {
    const rootDoc = new Y.Doc()
    rootDoc.getMap<Y.Doc>('notes').set('note-1', new Y.Doc({ guid: 'note-1' }))

    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', rootDoc, { connect: false })

    const syncPromise = provider.whenSynced()
    provider.disconnect()

    await expect(syncPromise).rejects.toThrow('disconnected before workspace note docs became ready')

    provider.destroy()
  })

  it('emits a create-note bundle for a newly attached note instead of split root and note updates', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()

    const noteDoc = createNoteDoc('note-2', 'blockNote')
    setBlockNoteText(noteDoc, 'new note content')
    provider.doc.getMap<Y.Doc>('notes').set('note-2', noteDoc)

    expect(emit).toHaveBeenCalledWith(
      'yjs:create-note-bundle',
      expect.objectContaining({
        notes: [
          expect.objectContaining({
            noteId: 'note-2',
            noteKind: 'blockNote',
            noteSnapshot: expect.any(Uint8Array),
          }),
        ],
        rootUpdate: expect.any(Uint8Array),
      } satisfies Partial<CreateNoteBundlePayload>)
    )

    expect(emit).not.toHaveBeenCalledWith('yjs:update', expect.objectContaining({ docId: 'root', kind: 'root' }))
    expect(emit).not.toHaveBeenCalledWith('yjs:update', expect.objectContaining({ docId: 'note-2', kind: 'note' }))

    provider.destroy()
  })

  it('emits one create-note bundle when a root update introduces multiple notes', () => {
    const provider = new WorkspaceSocketProvider('localhost:1999', 'workspace-1', new Y.Doc(), { connect: false })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedWorkspaceBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()

    provider.doc.transact(() => {
      const firstNote = createNoteDoc('note-2', 'blockNote')
      const secondNote = createNoteDoc('note-3', 'blockNote')
      setBlockNoteText(firstNote, 'first bundled note')
      setBlockNoteText(secondNote, 'second bundled note')
      provider.doc.getMap<Y.Doc>('notes').set('note-2', firstNote)
      provider.doc.getMap<Y.Doc>('notes').set('note-3', secondNote)
    })

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      'yjs:create-note-bundle',
      expect.objectContaining({
        notes: [
          expect.objectContaining({ noteId: 'note-2', noteKind: 'blockNote', noteSnapshot: expect.any(Uint8Array) }),
          expect.objectContaining({ noteId: 'note-3', noteKind: 'blockNote', noteSnapshot: expect.any(Uint8Array) }),
        ],
        rootUpdate: expect.any(Uint8Array),
      } satisfies Partial<CreateNoteBundlePayload>)
    )

    provider.destroy()
  })
})

describe('NoteSocketProvider sync lifecycle', () => {
  it('applies packed note bootstrap payloads', () => {
    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })

    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedNoteBootstrap('note-1', 'hello packed note bootstrap')
    )

    expect(provider.synced).toBe(true)
    expect(provider.noteKind).toBe('blockNote')
    expect(provider.doc.getXmlFragment('content').toString()).toContain('hello packed note bootstrap')

    provider.destroy()
  })

  it('rejects whenSynced when the provider disconnects before note bootstrap completes', async () => {
    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })

    const syncPromise = provider.whenSynced()
    provider.disconnect()

    await expect(syncPromise).rejects.toThrow('disconnected before note doc note-1 became ready')

    provider.destroy()
  })

  it('re-sends the full note snapshot after reconnect bootstrap if the doc changed while unsynced', () => {
    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedNoteBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()
    ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
      'transport close'
    )
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()

    setBlockNoteText(provider.doc, 'local reconnect edit')
    expect(emit).not.toHaveBeenCalled()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedNoteBootstrap('note-1', 'server content after reconnect')
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:update',
      expect.objectContaining({
        docId: 'note-1',
        generation: 1,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )

    provider.destroy()
  })

  it('re-sends local note awareness after reconnect bootstrap if awareness changed while unsynced', () => {
    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const emit = attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedNoteBootstrap('note-1', 'initial server content')
    )

    emit.mockClear()
    ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
      'transport close'
    )
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()

    provider.awareness.setLocalState({ user: { name: 'Reconnect user' } })
    expect(emit).not.toHaveBeenCalled()
    ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
      createPackedNoteBootstrap('note-1', 'server content after reconnect')
    )

    expect(emit).toHaveBeenCalledWith(
      'yjs:awareness',
      expect.objectContaining({
        docId: 'note-1',
        generation: 1,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )

    provider.destroy()
  })

  it('manually reconnects after a post-sync server disconnect', () => {
    vi.useFakeTimers()

    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })

    try {
      ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true
      attachConnectedSocket(provider)
      const socket = (
        provider as unknown as {
          socket: { active: boolean; connect: ReturnType<typeof vi.fn> }
        }
      ).socket

      ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
      ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
        createPackedNoteBootstrap('note-1', 'initial server content')
      )

      socket.active = false
      ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
        'io server disconnect'
      )

      expect(provider.isReconnecting).toBe(true)
      expect(socket.connect).not.toHaveBeenCalled()

      vi.advanceTimersByTime(250)

      expect(socket.connect).toHaveBeenCalledTimes(1)
    } finally {
      provider.destroy()
      vi.useRealTimers()
    }
  })

  it('does not manually reconnect after a server reload request', () => {
    vi.useFakeTimers()

    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })

    try {
      ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true
      attachConnectedSocket(provider)
      const socket = (
        provider as unknown as {
          socket: { active: boolean; connect: ReturnType<typeof vi.fn> }
        }
      ).socket

      ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
      ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
        createPackedNoteBootstrap('note-1', 'initial server content')
      )
      ;(provider as unknown as { handleReload: (payload?: { reason?: string }) => void }).handleReload({
        reason: 'note_replaced',
      })
      socket.active = false
      ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
        'io server disconnect'
      )

      vi.advanceTimersByTime(1_000)

      expect(provider.isReconnecting).toBe(false)
      expect(socket.connect).not.toHaveBeenCalled()
    } finally {
      provider.destroy()
      vi.useRealTimers()
    }
  })

  it('does not manually reconnect after an explicit local disconnect', () => {
    vi.useFakeTimers()

    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })

    try {
      ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true
      attachConnectedSocket(provider)
      const socket = (
        provider as unknown as {
          socket: { active: boolean; connect: ReturnType<typeof vi.fn> }
        }
      ).socket

      ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
      ;(provider as unknown as { handleBootstrap: (payload: Uint8Array) => void }).handleBootstrap(
        createPackedNoteBootstrap('note-1', 'initial server content')
      )

      provider.disconnect()
      socket.active = false
      ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
        'io server disconnect'
      )

      vi.advanceTimersByTime(1_000)

      expect(provider.isReconnecting).toBe(false)
      expect(socket.connect).not.toHaveBeenCalled()
    } finally {
      provider.destroy()
      vi.useRealTimers()
    }
  })

  it('emits status updates when reconnect attempts stop retrying', () => {
    const provider = new NoteSocketProvider('localhost:1999', 'workspace-1', 'note-1', new Y.Doc({ guid: 'note-1' }), {
      connect: false,
    })
    ;(provider as unknown as { shouldConnect: boolean }).shouldConnect = true

    const reconnectStates: boolean[] = []
    provider.on('status', () => {
      reconnectStates.push(provider.isReconnecting)
    })

    attachConnectedSocket(provider)
    ;(provider as unknown as { handleSocketConnect: () => void }).handleSocketConnect()
    reconnectStates.length = 0
    ;(provider as unknown as { handleSocketDisconnect: (reason: string) => void }).handleSocketDisconnect(
      'transport close'
    )
    ;(provider as unknown as { socket: { active: boolean } | null }).socket!.active = false
    ;(provider as unknown as { handleConnectionError: (error: Error) => void }).handleConnectionError(
      new Error('reconnect failed')
    )

    expect(reconnectStates).toEqual([true, false])

    provider.destroy()
  })
})
