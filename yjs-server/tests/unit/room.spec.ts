import { describe, expect, it, vi } from 'vitest'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness.js'
import * as Y from 'yjs'
import { createWorkspaceContentStore, decodeBootstrapPayload } from 'shared'
import { createNoteDoc, getNoteDocMeta } from 'shared/note-doc'
import { ContentConverter } from 'shared/server'
import { NoopBackendNotifier } from '../../src/backend-notifier.js'
import { MigratingDocumentStore } from '../../src/migrating-document-store.js'
import { SOCKET_EVENT_AWARENESS, SOCKET_EVENT_BOOTSTRAP } from '../../src/protocol.js'
import { RoomManager } from '../../src/room-manager.js'
import { WorkspaceRoom, type WorkspaceSnapshotBundle } from '../../src/room.js'
import type { CreateNoteBundlePayload } from '../../src/room-types.js'
import type { DocumentStore, LegacyDocumentStore } from '../../src/storage.js'
import { createCapturingLogger, createNoopLogger } from '../helpers/test-utils.js'
import { applyNoteBootstrap, applyWorkspaceBootstrap, type BootstrapPayload } from '../helpers/workspace-fixtures.js'

const logger = createNoopLogger()

function createRootDoc(noteIds: string[] = []): Y.Doc {
  const doc = new Y.Doc()
  doc.getMap('state').set('root', {
    id: 'root',
    name: '',
    kind: 'canvas',
    xynode: {
      id: 'root',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
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
    xynode: {
      id: 'root',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items: [
      {
        id: 'projects',
        name: 'projects',
        kind: 'canvas',
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
  })

  return doc
}

function createCanvasMap(id: string, name: string): Y.Map<unknown> {
  const canvas = new Y.Map<unknown>()
  const xynode = new Y.Map<unknown>()
  const position = new Y.Map<unknown>()
  position.set('x', 0)
  position.set('y', 0)
  xynode.set('data', new Y.Map())
  xynode.set('id', id)
  xynode.set('position', position)
  xynode.set('type', 'canvas')
  canvas.set('edges', new Y.Array())
  canvas.set('id', id)
  canvas.set('items', new Y.Array())
  canvas.set('kind', 'canvas')
  canvas.set('name', name)
  canvas.set('xynode', xynode)
  return canvas
}

function createCanonicalRootDoc(): Y.Doc {
  const doc = new Y.Doc()
  doc.getMap<unknown>('state').set('root', createCanvasMap('root', ''))
  return doc
}

function createInvalidLiveRootUpdate(currentDoc: Y.Doc): Uint8Array {
  const sourceDoc = new Y.Doc()
  Y.applyUpdateV2(sourceDoc, Y.encodeStateAsUpdateV2(currentDoc))

  const updates: Uint8Array[] = []
  sourceDoc.on('updateV2', (update) => {
    updates.push(update)
  })

  const root = sourceDoc.getMap<unknown>('state').get('root') as Y.Map<unknown>
  const items = root.get('items') as Y.Array<unknown>
  items.push([createCanvasMap('projects', 'projects')])

  const nestedCanvas = items.get(0) as Y.Map<unknown>
  nestedCanvas.delete('items')

  return Y.mergeUpdatesV2(updates)
}

function createRootUpdate(currentDoc: Y.Doc, mutate: (doc: Y.Doc) => void): Uint8Array {
  const sourceDoc = new Y.Doc()
  Y.applyUpdateV2(sourceDoc, Y.encodeStateAsUpdateV2(currentDoc))

  const updates: Uint8Array[] = []
  sourceDoc.on('updateV2', (update) => {
    updates.push(update)
  })

  mutate(sourceDoc)
  return Y.mergeUpdatesV2(updates)
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

function readBlockNoteText(noteDoc: Y.Doc): string {
  return noteDoc.getXmlFragment('content').toString()
}

function createBlockNoteDoc(noteId: string, text: string): Y.Doc {
  const noteDoc = createNoteDoc(noteId, 'blockNote')
  setBlockNoteText(noteDoc, text)
  return noteDoc
}

function createInvalidBlockNoteDoc(noteId: string, text: string): Y.Doc {
  const noteDoc = new Y.Doc({ guid: noteId })
  setBlockNoteText(noteDoc, text)
  return noteDoc
}

async function createLegacyWorkspaceBytes(noteId: string, markdown: string): Promise<Uint8Array> {
  const converter = new ContentConverter()
  const yDoc = new Y.Doc()

  try {
    yDoc.getMap('state').set('root', {
      edges: [],
      id: 'root',
      items: [
        {
          id: noteId,
          kind: 'node',
          name: 'Legacy Note',
          xynode: {
            data: {},
            id: noteId,
            position: { x: 100, y: 100 },
            type: 'blockNote',
          },
        },
      ],
      kind: 'canvas',
      name: '',
      xynode: {
        data: {},
        id: 'root',
        position: { x: 0, y: 0 },
        type: 'canvas',
      },
    })
    yDoc.getMap<Y.XmlFragment>('editors').set(noteId, await converter.createFragmentFromMarkdown(markdown))

    return Y.encodeStateAsUpdateV2(yDoc)
  } finally {
    yDoc.destroy()
  }
}

function toBundle(rootDoc: Y.Doc, notes: Record<string, Y.Doc> = {}): WorkspaceSnapshotBundle {
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

function createSocket(id: string) {
  return {
    disconnect: vi.fn(),
    emit: vi.fn(),
    id,
  }
}

function createDeferredPromise<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function getBootstrapPayload(socket: ReturnType<typeof createSocket>): BootstrapPayload {
  const bootstrapBytes = socket.emit.mock.calls.find(([event]) => event === SOCKET_EVENT_BOOTSTRAP)?.[1] as
    | Uint8Array
    | undefined

  if (!bootstrapBytes) {
    throw new Error('Expected bootstrap payload to be emitted')
  }

  return decodeBootstrapPayload(bootstrapBytes)
}

function getEmittedPayloads<T>(socket: ReturnType<typeof createSocket>, event: string): T[] {
  return socket.emit.mock.calls.filter(([emittedEvent]) => emittedEvent === event).map(([, payload]) => payload as T)
}

function createNoteAwarenessUpdate(noteId: string): { clientId: number; update: Uint8Array } {
  const doc = new Y.Doc({ guid: `${noteId}-awareness` })
  const awareness = new Awareness(doc)

  awareness.setLocalState({ user: { id: `user-${noteId}` } })

  return {
    clientId: doc.clientID,
    update: encodeAwarenessUpdate(awareness, [doc.clientID]),
  }
}

function getRoomInternals(room: WorkspaceRoom): {
  noteStates: Map<string, unknown>
  rootState: { doc: Y.Doc }
  socketClientIds: Map<string, Map<string, Set<number>>>
  socketSubscriptions: Map<
    string,
    { awarenessDocIds: Set<string>; docIds: Set<string>; roomType: 'note' | 'workspace' }
  >
} {
  return room as unknown as {
    noteStates: Map<string, unknown>
    rootState: { doc: Y.Doc }
    socketClientIds: Map<string, Map<string, Set<number>>>
    socketSubscriptions: Map<
      string,
      { awarenessDocIds: Set<string>; docIds: Set<string>; roomType: 'note' | 'workspace' }
    >
  }
}

describe('WorkspaceRoom', () => {
  it('rejects stored workspace roots that contain canvases without items', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCorruptedRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-root',
    })

    await expect(room.initialize()).rejects.toThrow(
      'Invalid canvas tree at root > projects: canvas.items must be an array'
    )
  })

  it('rejects snapshot replacement when a nested canvas is missing items', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => null),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
    })

    await expect(
      manager.replaceDocument('workspace-invalid-snapshot', toBundle(createCorruptedRootDoc()), {
        notifyBackend: false,
        persist: false,
        reason: 'unit-test-invalid-snapshot',
      })
    ).rejects.toThrow('Invalid canvas tree at root > projects: canvas.items must be an array')
  })

  it('ignores incoming root updates when a nested canvas is missing items', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-live-root-update',
    })

    await room.initialize()

    const socket = createSocket('socket-invalid-live-root-update')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    room.handleUpdate(socket as never, {
      docId: 'root',
      generation: 1,
      kind: 'root',
      update: createInvalidLiveRootUpdate(getRoomInternals(room).rootState.doc),
    })

    const internals = getRoomInternals(room)
    const root = internals.rootState.doc.getMap<any>('state').toJSON().root

    expect(root.items).toEqual([])
    expect(store.saveRoot).not.toHaveBeenCalled()

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('rejects plain root updates that introduce unknown notes', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-reject-unknown-note',
    })

    await room.initialize()

    const socket = createSocket('socket-reject-unknown-note')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const unknownNoteId = 'note-unknown'
    room.handleUpdate(socket as never, {
      docId: 'root',
      generation: 1,
      kind: 'root',
      update: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(unknownNoteId, createBlockNoteDoc(unknownNoteId, 'hello unknown'))
      }),
    })

    expect(getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes').has(unknownNoteId)).toBe(false)
    expect(getRoomInternals(room).noteStates.has(unknownNoteId)).toBe(false)

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('applies create-note bundles for new notes', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-create-note-bundle',
    })

    await room.initialize()

    const socket = createSocket('socket-create-note-bundle')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const noteId = 'note-created'
    const noteDoc = createBlockNoteDoc(noteId, 'hello bundled note')
    const payload: CreateNoteBundlePayload = {
      notes: [
        {
          noteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(noteDoc),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(noteId, createBlockNoteDoc(noteId, 'hello bundled note'))
      }),
    }

    room.handleCreateNoteBundle(socket as never, payload)

    const attachedNote = getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes').get(noteId)
    expect(attachedNote).toBeTruthy()
    expect(attachedNote ? readBlockNoteText(attachedNote) : '').toContain('hello bundled note')
    expect(getRoomInternals(room).noteStates.has(noteId)).toBe(true)

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('applies create-note bundles for new sticky notes', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-create-sticky-note-bundle',
    })

    await room.initialize()

    const socket = createSocket('socket-create-sticky-note-bundle')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const noteId = 'sticky-created'
    const noteDoc = createNoteDoc(noteId, 'stickyNote')
    setBlockNoteText(noteDoc, 'hello bundled sticky note')

    room.handleCreateNoteBundle(socket as never, {
      notes: [
        {
          noteId,
          noteKind: 'stickyNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(noteDoc),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(noteId, createNoteDoc(noteId, 'stickyNote'))
      }),
    })

    const attachedNote = getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes').get(noteId)
    expect(attachedNote).toBeTruthy()
    expect(attachedNote ? readBlockNoteText(attachedNote) : '').toContain('hello bundled sticky note')
    expect(getRoomInternals(room).noteStates.get(noteId)?.noteKind).toBe('stickyNote')

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('rejects create-note bundles whose root update does not attach the bundled note', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-create-note-bundle',
    })

    await room.initialize()

    const socket = createSocket('socket-invalid-create-note-bundle')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const noteId = 'note-missing-root-ref'
    room.handleCreateNoteBundle(socket as never, {
      notes: [
        {
          noteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(createBlockNoteDoc(noteId, 'hello bundled note')),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap('state').set('bundleTouch', true)
      }),
    })

    expect(getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes').has(noteId)).toBe(false)
    expect(getRoomInternals(room).noteStates.has(noteId)).toBe(false)

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('rejects create-note bundles whose note snapshot is invalid without attaching the note', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-create-note-snapshot',
    })

    await room.initialize()

    const socket = createSocket('socket-invalid-create-note-snapshot')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const noteId = 'note-invalid-snapshot'
    room.handleCreateNoteBundle(socket as never, {
      notes: [
        {
          noteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(createInvalidBlockNoteDoc(noteId, 'broken bundled note')),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(noteId, new Y.Doc({ guid: noteId }))
      }),
    })

    expect(getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes').has(noteId)).toBe(false)
    expect(getRoomInternals(room).noteStates.has(noteId)).toBe(false)
    expect(store.saveRoot).not.toHaveBeenCalled()
    expect(store.saveNote).not.toHaveBeenCalled()

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('blocks root persistence when an attached note is still unloaded', async () => {
    const noteId = 'note-unloaded'
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createRootDoc([noteId]))),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-root-save-guard',
    })

    await room.initialize({ skipBootstrapValidation: true })
    ;(room as unknown as { rootDirty: boolean }).rootDirty = true

    await expect((room as unknown as { queueSave: () => Promise<void> }).queueSave()).rejects.toThrow(
      `Cannot save root while attached note ${noteId} is not loaded`
    )
    expect(store.saveRoot).not.toHaveBeenCalled()
  })

  it('logs correlationId and validation diagnostics when rejecting an invalid incoming root update', async () => {
    const { entries, logger } = createCapturingLogger()
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-live-root-update-frontend',
    })

    await room.initialize()

    const socket = createSocket('socket-invalid-live-root-update-frontend')
    await room.attachSocket(
      socket as never,
      { clientKind: 'frontend', roomType: 'workspace' },
      { correlationId: 'corr-invalid-live-root-update' }
    )

    try {
      ;(
        room as unknown as {
          applyValidatedRootUpdate: (
            doc: Y.Doc,
            update: Uint8Array,
            origin: { docId: string; socketId: string }
          ) => void
        }
      ).applyValidatedRootUpdate(
        getRoomInternals(room).rootState.doc,
        createInvalidLiveRootUpdate(getRoomInternals(room).rootState.doc),
        {
          docId: 'root',
          socketId: 'socket-invalid-live-root-update-frontend',
        }
      )
    } catch {
      // Expected: rejected root updates throw an internal wrapper error after logging.
    }

    expect(entries).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          clientKind: 'frontend',
          correlationId: 'corr-invalid-live-root-update',
          offendingSummary: expect.objectContaining({
            hasItems: false,
            id: 'projects',
            itemsType: 'undefined',
            keys: ['edges', 'id', 'kind', 'name', 'xynode'],
            kind: 'canvas',
            name: 'projects',
            valueType: 'object',
          }),
          socketId: 'socket-invalid-live-root-update-frontend',
          validationPath: 'root > projects',
          validationPathSegments: ['root', 'projects'],
          validationReason: 'canvas_items_not_array',
        }),
        level: 'error',
        message: 'Rejected invalid root update',
      })
    )

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('bootstraps root and note docs to workspace sockets', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async (_workspaceId, requestedNoteId) => {
        expect(requestedNoteId).toBe(noteId)
        return Y.encodeStateAsUpdateV2(noteDoc)
      }),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-1',
    })

    await room.initialize()

    const socket = createSocket('socket-1')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const bootstrapPayload = getBootstrapPayload(socket)

    expect(bootstrapPayload.docs).toHaveLength(2)
    expect(bootstrapPayload.docs[0]).toMatchObject({ docId: 'root', kind: 'root' })
    expect(bootstrapPayload.docs[1]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })
  })

  it('bootstraps dedicated note rooms without sending the root doc', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-subscribe',
    })

    await room.initialize()

    const socket = createSocket('socket-1')
    await room.attachSocket(socket as never, { roomType: 'note', noteId })

    const bootstrapPayload = getBootstrapPayload(socket)

    expect(bootstrapPayload.docs).toHaveLength(1)
    expect(bootstrapPayload.docs[0]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })
  })

  it('keeps note awareness off for workspace sockets until they subscribe', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-awareness-subscription',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })

    const workspaceSocket = createSocket('socket-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })

    const awarenessPayload = createNoteAwarenessUpdate(noteId)
    room.handleAwarenessUpdate(noteSocket as never, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: awarenessPayload.update,
    })

    expect(
      getEmittedPayloads<{ docId: string }>(workspaceSocket, SOCKET_EVENT_AWARENESS).filter(
        (payload) => payload.docId === noteId
      )
    ).toEqual([])

    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    expect(
      getEmittedPayloads<{ docId: string; generation: number; kind: string; update: Uint8Array }>(
        workspaceSocket,
        SOCKET_EVENT_AWARENESS
      ).filter((payload) => payload.docId === noteId)
    ).toContainEqual(
      expect.objectContaining({
        docId: noteId,
        generation: 1,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )
  })

  it('removes tracked note awareness when a workspace socket unsubscribes', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-awareness-unsubscribe',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })
    noteSocket.emit.mockClear()

    const workspaceSocket = createSocket('socket-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })
    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    const awarenessPayload = createNoteAwarenessUpdate(noteId)
    room.handleAwarenessUpdate(workspaceSocket as never, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: awarenessPayload.update,
    })

    const internals = getRoomInternals(room)
    expect(internals.socketClientIds.get('socket-workspace')?.get(noteId)).toEqual(new Set([awarenessPayload.clientId]))

    noteSocket.emit.mockClear()
    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'unsubscribe',
      docId: noteId,
      kind: 'note',
    })

    expect(internals.socketClientIds.get('socket-workspace')?.has(noteId) ?? false).toBe(false)

    const noteState = internals.noteStates.get(noteId) as { awareness: Awareness }
    expect(noteState.awareness.getStates().has(awarenessPayload.clientId)).toBe(false)
    expect(getEmittedPayloads(noteSocket, SOCKET_EVENT_AWARENESS)).toContainEqual(
      expect.objectContaining({
        docId: noteId,
        generation: 1,
        kind: 'note',
        update: expect.any(Uint8Array),
      })
    )
  })

  it('loads all workspace notes in parallel during workspace bootstrap', async () => {
    const noteIds = ['note-1', 'note-2', 'note-3']
    const rootDoc = createRootDoc(noteIds)
    let activeLoads = 0
    let maxConcurrentLoads = 0

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async (_workspaceId, requestedNoteId) => {
        activeLoads += 1
        maxConcurrentLoads = Math.max(maxConcurrentLoads, activeLoads)
        await new Promise((resolve) => setTimeout(resolve, 10))
        activeLoads -= 1
        return Y.encodeStateAsUpdateV2(createBlockNoteDoc(requestedNoteId, `hello ${requestedNoteId}`))
      }),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-parallel-load',
    })

    await room.initialize()
    await room.attachSocket(createSocket('socket-parallel') as never, { roomType: 'workspace' })

    expect(store.loadNote).toHaveBeenCalledTimes(noteIds.length)
    expect(maxConcurrentLoads).toBeGreaterThan(1)
  })

  it('reuses one in-flight note load across concurrent room attachments', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    let loadCount = 0
    let resolveLoad: (() => void) | null = null
    const loadBarrier = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => {
        loadCount += 1
        await loadBarrier
        return Y.encodeStateAsUpdateV2(createBlockNoteDoc(noteId, 'shared load'))
      }),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-shared-load',
    })

    await room.initialize()

    const workspaceAttach = room.attachSocket(createSocket('socket-workspace') as never, { roomType: 'workspace' })
    const noteAttach = room.attachSocket(createSocket('socket-note') as never, { roomType: 'note', noteId })

    await Promise.resolve()
    expect(loadCount).toBe(1)

    resolveLoad?.()
    await Promise.all([workspaceAttach, noteAttach])

    expect(store.loadNote).toHaveBeenCalledTimes(1)
  })

  it('replaces a cold room from a snapshot bundle without loading storage first', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'rewound note')
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => {
        throw new Error('loadNote should be skipped')
      }),
      loadRoot: vi.fn(async () => {
        throw new Error('loadRoot should be skipped')
      }),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
    })

    const room = await manager.replaceDocument('workspace-cold', toBundle(rootDoc, { [noteId]: noteDoc }), {
      notifyBackend: false,
      reason: 'tests:replace',
      stage: 'replace',
    })

    expect(store.saveNote).toHaveBeenCalledTimes(1)
    expect(store.saveRoot).toHaveBeenCalledTimes(1)
    expect(store.loadRoot).not.toHaveBeenCalled()
    expect(store.loadNote).not.toHaveBeenCalled()

    await manager.destroyRoomIfEmpty('workspace-cold', room)
  })

  it('saves snapshot note blobs in parallel before saving the root snapshot', async () => {
    const noteIds = ['note-1', 'note-2', 'note-3']
    const rootDoc = createRootDoc(noteIds)
    let activeSaves = 0
    let maxConcurrentSaves = 0
    const persistenceOrder: string[] = []

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => {
        throw new Error('loadNote should be skipped')
      }),
      loadRoot: vi.fn(async () => {
        throw new Error('loadRoot should be skipped')
      }),
      saveNote: vi.fn(async (_workspaceId, noteId) => {
        persistenceOrder.push(`start:${noteId}`)
        activeSaves += 1
        maxConcurrentSaves = Math.max(maxConcurrentSaves, activeSaves)
        await new Promise((resolve) => setTimeout(resolve, 10))
        activeSaves -= 1
        persistenceOrder.push(`done:${noteId}`)
      }),
      saveRoot: vi.fn(async () => {
        persistenceOrder.push('saveRoot')
      }),
    }

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
    })

    const room = await manager.replaceDocument(
      'workspace-cold-parallel-save',
      toBundle(
        rootDoc,
        Object.fromEntries(noteIds.map((noteId) => [noteId, createBlockNoteDoc(noteId, `rewound ${noteId}`)]))
      ),
      {
        notifyBackend: false,
        reason: 'tests:replace-parallel-save',
        stage: 'replace',
      }
    )

    expect(store.saveNote).toHaveBeenCalledTimes(noteIds.length)
    expect(store.saveRoot).toHaveBeenCalledTimes(1)
    expect(maxConcurrentSaves).toBeGreaterThan(1)
    expect(persistenceOrder.at(-1)).toBe('saveRoot')

    await manager.destroyRoomIfEmpty('workspace-cold-parallel-save', room)
  })

  it('waits for all snapshot note saves before saving the root snapshot', async () => {
    const noteIds = ['note-1', 'note-2']
    const rootDoc = createRootDoc(noteIds)
    const noteSaves = new Map(noteIds.map((noteId) => [noteId, createDeferredPromise<void>()]))
    const persistenceOrder: string[] = []

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => {
        throw new Error('loadNote should be skipped')
      }),
      loadRoot: vi.fn(async () => {
        throw new Error('loadRoot should be skipped')
      }),
      saveNote: vi.fn(async (_workspaceId, noteId) => {
        persistenceOrder.push(`start:${noteId}`)
        const deferred = noteSaves.get(noteId)
        if (!deferred) {
          throw new Error(`Missing deferred save for ${noteId}`)
        }

        await deferred.promise
        persistenceOrder.push(`done:${noteId}`)
      }),
      saveRoot: vi.fn(async () => {
        persistenceOrder.push('saveRoot')
      }),
    }

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
    })

    const replaceTask = manager.replaceDocument(
      'workspace-cold-save-order',
      toBundle(
        rootDoc,
        Object.fromEntries(noteIds.map((noteId) => [noteId, createBlockNoteDoc(noteId, `rewound ${noteId}`)]))
      ),
      {
        notifyBackend: false,
        reason: 'tests:replace-save-order',
        stage: 'replace',
      }
    )

    await Promise.resolve()
    expect(store.saveRoot).not.toHaveBeenCalled()

    noteSaves.get('note-1')?.resolve()
    await Promise.resolve()
    expect(store.saveRoot).not.toHaveBeenCalled()

    noteSaves.get('note-2')?.resolve()
    const room = await replaceTask

    expect(store.saveRoot).toHaveBeenCalledTimes(1)
    expect(persistenceOrder.indexOf('saveRoot')).toBeGreaterThan(persistenceOrder.indexOf('done:note-1'))
    expect(persistenceOrder.indexOf('saveRoot')).toBeGreaterThan(persistenceOrder.indexOf('done:note-2'))

    await manager.destroyRoomIfEmpty('workspace-cold-save-order', room)
  })

  it('waits for in-flight snapshot note saves to settle before rejecting and skips root persistence', async () => {
    const noteIds = ['note-1', 'note-2']
    const rootDoc = createRootDoc(noteIds)
    const slowNoteSave = createDeferredPromise<void>()
    const noteFailure = new Error('save note failed')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => {
        throw new Error('loadNote should be skipped')
      }),
      loadRoot: vi.fn(async () => {
        throw new Error('loadRoot should be skipped')
      }),
      saveNote: vi.fn(async (_workspaceId, noteId) => {
        if (noteId === 'note-1') {
          throw noteFailure
        }

        await slowNoteSave.promise
      }),
      saveRoot: vi.fn(async () => undefined),
    }

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
    })

    const replaceTask = manager.replaceDocument(
      'workspace-cold-save-failure',
      toBundle(
        rootDoc,
        Object.fromEntries(noteIds.map((noteId) => [noteId, createBlockNoteDoc(noteId, `rewound ${noteId}`)]))
      ),
      {
        notifyBackend: false,
        reason: 'tests:replace-save-failure',
        stage: 'replace',
      }
    )

    let settled = false
    void replaceTask.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(store.saveRoot).not.toHaveBeenCalled()

    slowNoteSave.resolve()

    await expect(replaceTask).rejects.toThrow('save note failed')
    expect(settled).toBe(true)
    expect(store.saveRoot).not.toHaveBeenCalled()
  })

  it('migrates legacy workspace storage lazily before workspace bootstrap', async () => {
    const noteId = 'legacy-note-1'
    const workspaceId = 'workspace-legacy-bootstrap'
    const roots = new Map<string, Uint8Array>()
    const notesByWorkspace = new Map<string, Map<string, Uint8Array>>()
    const legacyDocument = await createLegacyWorkspaceBytes(noteId, '# hello from legacy')

    const baseStore: LegacyDocumentStore = {
      deleteNote: vi.fn(async (workspaceId, deletedNoteId) => {
        notesByWorkspace.get(workspaceId)?.delete(deletedNoteId)
      }),
      loadLegacyDocument: vi.fn(async () => legacyDocument),
      loadNote: vi.fn(async (workspaceId, requestedNoteId) => {
        return notesByWorkspace.get(workspaceId)?.get(requestedNoteId) ?? null
      }),
      loadRoot: vi.fn(async (workspaceId) => roots.get(workspaceId) ?? null),
      saveNote: vi.fn(async (workspaceId, savedNoteId, documentBytes) => {
        const notes = notesByWorkspace.get(workspaceId) ?? new Map<string, Uint8Array>()
        notes.set(savedNoteId, documentBytes)
        notesByWorkspace.set(workspaceId, notes)
      }),
      saveRoot: vi.fn(async (workspaceId, documentBytes) => {
        roots.set(workspaceId, documentBytes)
      }),
    }

    const store = new MigratingDocumentStore(baseStore, logger)
    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId,
    })

    await room.initialize()

    const workspaceSocket = createSocket('socket-legacy-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })

    const bootstrapPayload = getBootstrapPayload(workspaceSocket)

    expect(baseStore.loadLegacyDocument).toHaveBeenCalledTimes(1)
    expect(baseStore.saveRoot).toHaveBeenCalledTimes(1)
    expect(baseStore.saveNote).toHaveBeenCalledTimes(1)
    expect(baseStore.loadNote).toHaveBeenCalledTimes(1)

    expect(bootstrapPayload.docs).toHaveLength(2)
    expect(bootstrapPayload.docs[0]).toMatchObject({ docId: 'root', kind: 'root' })
    expect(bootstrapPayload.docs[1]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })

    const persistedRootBytes = roots.get(workspaceId)
    const persistedNoteBytes = notesByWorkspace.get(workspaceId)?.get(noteId)
    expect(bootstrapPayload.docs[0]?.update).toEqual(persistedRootBytes)
    expect(bootstrapPayload.docs[1]?.update).toEqual(persistedNoteBytes)

    const clientRootDoc = new Y.Doc()
    try {
      applyWorkspaceBootstrap(clientRootDoc, bootstrapPayload)

      const clientRoot = clientRootDoc.getMap<unknown>('state').get('root')
      expect(clientRoot).toBeInstanceOf(Y.Map)
      expect((clientRoot as Y.Map<unknown>).get('items')).toBeInstanceOf(Y.Array)

      expect(clientRootDoc.getMap<any>('state').toJSON().root).toEqual({
        edges: [],
        id: 'root',
        items: [
          {
            id: noteId,
            kind: 'node',
            name: 'Legacy Note',
            xynode: {
              data: {},
              id: noteId,
              position: { x: 100, y: 100 },
              type: 'blockNote',
            },
          },
        ],
        kind: 'canvas',
        name: '',
        xynode: {
          data: {},
          id: 'root',
          position: { x: 0, y: 0 },
          type: 'canvas',
        },
      })

      const clientNoteDoc = clientRootDoc.getMap<Y.Doc>('notes').get(noteId)
      expect(clientNoteDoc?.guid).toBe(noteId)
      expect(getNoteDocMeta(clientNoteDoc as Y.Doc)).toEqual({
        contentKind: 'blockNote',
        noteId,
        schemaVersion: 1,
      })

      const clientFragment = createWorkspaceContentStore(clientRootDoc).getBlockNoteFragment(noteId)
      expect(clientFragment).toBeDefined()
      await expect(new ContentConverter().fragmentToMarkdown(clientFragment as Y.XmlFragment)).resolves.toContain(
        '# hello from legacy'
      )
    } finally {
      clientRootDoc.destroy()
    }

    const noteSocket = createSocket('socket-legacy-note')
    await room.attachSocket(noteSocket as never, { noteId, roomType: 'note' })
    const noteBootstrapPayload = getBootstrapPayload(noteSocket)

    expect(noteBootstrapPayload.docs).toHaveLength(1)
    expect(noteBootstrapPayload.docs[0]).toMatchObject({ docId: noteId, kind: 'note', noteKind: 'blockNote' })
    expect(noteBootstrapPayload.docs[0]?.update).toEqual(persistedNoteBytes)

    const clientNoteRoomDoc = new Y.Doc({ guid: noteId })
    try {
      applyNoteBootstrap(clientNoteRoomDoc, noteId, noteBootstrapPayload)
      expect(getNoteDocMeta(clientNoteRoomDoc)).toEqual({ contentKind: 'blockNote', noteId, schemaVersion: 1 })
      await expect(
        new ContentConverter().fragmentToMarkdown(clientNoteRoomDoc.getXmlFragment('content'))
      ).resolves.toContain('# hello from legacy')
    } finally {
      clientNoteRoomDoc.destroy()
    }
  })

  it('cleans tracked note awareness when a note is removed from root', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-note-removal',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })

    const workspaceSocket = createSocket('socket-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })
    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    const awarenessPayload = createNoteAwarenessUpdate(noteId)
    room.handleAwarenessUpdate(workspaceSocket as never, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: awarenessPayload.update,
    })

    const internals = getRoomInternals(room)
    expect(internals.socketClientIds.get('socket-workspace')?.get(noteId)).toEqual(new Set([awarenessPayload.clientId]))

    internals.rootState.doc.getMap<Y.Doc>('notes').delete(noteId)
    ;(room as unknown as { syncAttachedNotes: () => void }).syncAttachedNotes()

    expect(internals.noteStates.has(noteId)).toBe(false)
    expect(internals.socketClientIds.get('socket-workspace')?.has(noteId) ?? false).toBe(false)
    expect(internals.socketSubscriptions.get('socket-workspace')?.awarenessDocIds.has(noteId) ?? false).toBe(false)
    expect(noteSocket.emit).toHaveBeenCalledWith('yjs:reload', { reason: 'note_removed' })
    expect(noteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('ignores stale workspace note awareness subscriptions after note removal', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-ignore-stale-subscribe',
    })

    await room.initialize()

    const workspaceSocket = createSocket('socket-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })

    const internals = getRoomInternals(room)
    internals.rootState.doc.getMap<Y.Doc>('notes').delete(noteId)
    ;(room as unknown as { syncAttachedNotes: () => void }).syncAttachedNotes()

    workspaceSocket.disconnect.mockClear()
    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    expect(workspaceSocket.disconnect).not.toHaveBeenCalled()
    expect(internals.socketSubscriptions.get('socket-workspace')?.awarenessDocIds.has(noteId) ?? false).toBe(false)
  })

  it('ignores stale note document updates without disconnecting the socket', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-ignore-stale-update',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })

    noteSocket.disconnect.mockClear()
    room.handleUpdate(noteSocket as never, {
      docId: noteId,
      generation: 99,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(createBlockNoteDoc(noteId, 'stale note update')),
    })

    const noteState = getRoomInternals(room).noteStates.get(noteId) as { doc: Y.Doc } | undefined
    expect(noteState).toBeDefined()
    expect(readBlockNoteText(noteState!.doc)).toContain('hello note')
    expect(noteSocket.disconnect).not.toHaveBeenCalled()
  })

  it('ignores stale note awareness updates without disconnecting the socket', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-ignore-stale-awareness',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })

    const noteState = getRoomInternals(room).noteStates.get(noteId) as { awareness: Awareness } | undefined
    expect(noteState).toBeDefined()
    const initialAwarenessSize = noteState!.awareness.getStates().size
    const awarenessPayload = createNoteAwarenessUpdate(noteId)

    noteSocket.disconnect.mockClear()
    room.handleAwarenessUpdate(noteSocket as never, {
      docId: noteId,
      generation: 99,
      kind: 'note',
      update: awarenessPayload.update,
    })

    expect(noteState!.awareness.getStates().size).toBe(initialAwarenessSize)
    expect(noteState!.awareness.getStates().has(awarenessPayload.clientId)).toBe(false)
    expect(noteSocket.disconnect).not.toHaveBeenCalled()
  })

  it('cleans tracked note awareness when a note subdoc is replaced', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-note-replace',
    })

    await room.initialize()

    const noteSocket = createSocket('socket-note')
    await room.attachSocket(noteSocket as never, { roomType: 'note', noteId })

    const workspaceSocket = createSocket('socket-workspace')
    await room.attachSocket(workspaceSocket as never, { roomType: 'workspace' })
    room.handleAwarenessSubscription(workspaceSocket as never, {
      action: 'subscribe',
      docId: noteId,
      kind: 'note',
    })

    const awarenessPayload = createNoteAwarenessUpdate(noteId)
    room.handleAwarenessUpdate(workspaceSocket as never, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: awarenessPayload.update,
    })

    const internals = getRoomInternals(room)
    expect(internals.socketClientIds.get('socket-workspace')?.get(noteId)).toEqual(new Set([awarenessPayload.clientId]))

    internals.rootState.doc.getMap<Y.Doc>('notes').set(noteId, new Y.Doc({ guid: noteId }))
    ;(room as unknown as { syncAttachedNotes: () => void }).syncAttachedNotes()

    expect(internals.noteStates.has(noteId)).toBe(true)
    expect(internals.socketClientIds.get('socket-workspace')?.has(noteId) ?? false).toBe(false)
    expect(internals.socketSubscriptions.get('socket-workspace')?.awarenessDocIds.has(noteId) ?? false).toBe(false)
    expect(noteSocket.emit).toHaveBeenCalledWith('yjs:reload', { reason: 'note_replaced' })
    expect(noteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('persists root changes before deleting removed note blobs', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const noteDoc = createBlockNoteDoc(noteId, 'hello note')
    const persistenceOrder: string[] = []

    const store: DocumentStore = {
      deleteNote: vi.fn(async (_workspaceId, deletedNoteId) => {
        persistenceOrder.push(`delete:${deletedNoteId}`)
      }),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(noteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => {
        persistenceOrder.push('saveRoot')
      }),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-delete-order',
    })

    await room.initialize()

    const internals = getRoomInternals(room)
    internals.rootState.doc.getMap<Y.Doc>('notes').delete(noteId)
    ;(room as unknown as { syncAttachedNotes: () => void }).syncAttachedNotes()
    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()

    expect(persistenceOrder).toEqual(['saveRoot', `delete:${noteId}`])
  })

  it('accepts create-note bundles with empty snapshots before later note content updates', async () => {
    const noteId = 'note-1'
    const persistedNotes = new Map<string, Uint8Array>()
    let persistedRoot: Uint8Array | null = null

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createRootDoc())),
      saveNote: vi.fn(async (_workspaceId, savedNoteId, documentBytes) => {
        persistedNotes.set(savedNoteId, documentBytes)
      }),
      saveRoot: vi.fn(async (_workspaceId, documentBytes) => {
        persistedRoot = documentBytes
      }),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-inline-loaded-note',
    })

    await room.initialize()

    const socket = createSocket('socket-inline-loaded-note')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const clientRootDoc = createRootDoc()
    const contentStore = createWorkspaceContentStore(clientRootDoc)
    contentStore.createNoteDoc(noteId, 'blockNote')
    const emptyNoteDoc = clientRootDoc.getMap<Y.Doc>('notes').get(noteId)

    if (!emptyNoteDoc) {
      throw new Error(`Expected attached note doc ${noteId}`)
    }

    room.handleCreateNoteBundle(socket as never, {
      notes: [
        {
          noteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(emptyNoteDoc),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(noteId, createBlockNoteDoc(noteId, ''))
      }),
    })

    setBlockNoteText(emptyNoteDoc, 'hello inline note')

    room.handleUpdate(socket as never, {
      docId: noteId,
      generation: 1,
      kind: 'note',
      update: Y.encodeStateAsUpdateV2(emptyNoteDoc),
    })

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(store.saveRoot).toHaveBeenCalledTimes(1)
    expect(store.saveNote).toHaveBeenCalledTimes(1)
    expect(persistedRoot).not.toBeNull()
    expect(persistedNotes.has(noteId)).toBe(true)

    const persistedNoteDoc = new Y.Doc({ guid: noteId })
    try {
      Y.applyUpdateV2(persistedNoteDoc, persistedNotes.get(noteId) as Uint8Array)

      expect(persistedNoteDoc.getXmlFragment('content').toString()).toContain('hello inline note')
    } finally {
      persistedNoteDoc.destroy()
      clientRootDoc.destroy()
    }
  })

  it('applies create-note bundles for multiple new notes in one root update', async () => {
    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(createCanonicalRootDoc())),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-create-multi-note-bundle',
    })

    await room.initialize()

    const socket = createSocket('socket-create-multi-note-bundle')
    await room.attachSocket(socket as never, { roomType: 'workspace' })

    const firstNoteId = 'note-created-1'
    const secondNoteId = 'note-created-2'
    room.handleCreateNoteBundle(socket as never, {
      notes: [
        {
          noteId: firstNoteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(createBlockNoteDoc(firstNoteId, 'first bundled note')),
        },
        {
          noteId: secondNoteId,
          noteKind: 'blockNote',
          noteSnapshot: Y.encodeStateAsUpdateV2(createBlockNoteDoc(secondNoteId, 'second bundled note')),
        },
      ],
      rootUpdate: createRootUpdate(getRoomInternals(room).rootState.doc, (doc) => {
        doc.getMap<Y.Doc>('notes').set(firstNoteId, createBlockNoteDoc(firstNoteId, 'first bundled note'))
        doc.getMap<Y.Doc>('notes').set(secondNoteId, createBlockNoteDoc(secondNoteId, 'second bundled note'))
      }),
    })

    const notesMap = getRoomInternals(room).rootState.doc.getMap<Y.Doc>('notes')
    expect(readBlockNoteText(notesMap.get(firstNoteId) as Y.Doc)).toContain('first bundled note')
    expect(readBlockNoteText(notesMap.get(secondNoteId) as Y.Doc)).toContain('second bundled note')
    expect(getRoomInternals(room).noteStates.has(firstNoteId)).toBe(true)
    expect(getRoomInternals(room).noteStates.has(secondNoteId)).toBe(true)

    await (room as unknown as { flushAndDestroy: () => Promise<void> }).flushAndDestroy()
  })

  it('rejects note bootstrap when persisted note metadata is invalid', async () => {
    const noteId = 'note-1'
    const rootDoc = createRootDoc([noteId])
    const invalidNoteDoc = createInvalidBlockNoteDoc(noteId, 'broken note')

    const store: DocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadNote: vi.fn(async () => Y.encodeStateAsUpdateV2(invalidNoteDoc)),
      loadRoot: vi.fn(async () => Y.encodeStateAsUpdateV2(rootDoc)),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const room = new WorkspaceRoom({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store,
      workspaceId: 'workspace-invalid-note',
    })

    await room.initialize()

    await expect(room.attachSocket(createSocket('socket-invalid') as never, { roomType: 'workspace' })).rejects.toThrow(
      'missing valid metadata'
    )
  })
})
