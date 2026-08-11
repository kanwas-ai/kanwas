import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { encodeBootstrapPayload } from '../../../src/workspace/bootstrap-codec.js'
import { createNoteDoc } from '../../../src/workspace/note-doc.js'
import { WorkspaceSocketProvider } from '../../../src/workspace/socketio-provider.js'
import type { CreateNoteBundlePayload, WorkspaceBootstrapPayload } from '../../../src/workspace/workspace-sync-types.js'

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

function attachConnectedSocket(provider: WorkspaceSocketProvider): ReturnType<typeof vi.fn> {
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
    const provider = new WorkspaceSocketProvider('sync.example.test', 'workspace-1', new Y.Doc(), { connect: false })

    expect(provider.url).toBe('https://sync.example.test')

    provider.destroy()
  })

  it('respects an explicit websocket scheme in the configured host', () => {
    const provider = new WorkspaceSocketProvider('wss://sync.example.test', 'workspace-1', new Y.Doc(), {
      connect: false,
    })

    expect(provider.url).toBe('https://sync.example.test')

    provider.destroy()
  })

  it('uses http for non-local hosts when the page itself is served over http', () => {
    ;(globalThis as { location?: { protocol: string } }).location = { protocol: 'http:' }

    const provider = new WorkspaceSocketProvider('sync.example.test', 'workspace-1', new Y.Doc(), {
      connect: false,
    })

    expect(provider.url).toBe('http://sync.example.test')

    provider.destroy()
  })
})

describe('WorkspaceSocketProvider document synchronization', () => {
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
