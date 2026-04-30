import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createWorkspaceContentStore } from 'shared'
import { hydrateWorkspaceSnapshotBundle } from 'shared/server'
import { MigratingDocumentStore } from '../../src/migrating-document-store.js'
import { migrateLegacyWorkspace } from '../../src/migrations/legacy_workspace_to_note_subdocs.js'
import type { LegacyDocumentStore } from '../../src/storage.js'
import { createNoopLogger } from '../helpers/test-utils.js'
import { createBlockNoteNode, createCanvas, createLegacyDocumentBytes } from '../helpers/workspace-fixtures.js'

const logger = createNoopLogger()

describe('MigratingDocumentStore', () => {
  it('migrates legacy storage once, persists exact v3 bytes, and serves persisted data afterward', async () => {
    const workspaceId = 'workspace-migration-once'
    const root = createCanvas('root', '', [
      createBlockNoteNode('note-1', 'Note One'),
      createBlockNoteNode('note-2', 'Note Two'),
    ])
    const legacyDocument = await createLegacyDocumentBytes(root, {
      blockNotes: {
        'note-1': '# First note',
        'note-2': '## Second note',
      },
    })
    const migrated = await migrateLegacyWorkspace(legacyDocument)

    const roots = new Map<string, Uint8Array>()
    const notesByWorkspace = new Map<string, Map<string, Uint8Array>>()
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

    const store = new MigratingDocumentStore(baseStore, logger)
    const [rootBytesA, rootBytesB] = await Promise.all([store.loadRoot(workspaceId), store.loadRoot(workspaceId)])

    expect(rootBytesA).toEqual(rootBytesB)
    expect(baseStore.loadLegacyDocument).toHaveBeenCalledTimes(1)
    expect(baseStore.saveRoot).toHaveBeenCalledTimes(1)
    expect(baseStore.saveNote).toHaveBeenCalledTimes(2)
    expect(roots.get(workspaceId)).toEqual(rootBytesA)

    const persistedNotes = notesByWorkspace.get(workspaceId)
    expect(persistedNotes?.get('note-1')).toBeDefined()
    expect(persistedNotes?.get('note-2')).toBeDefined()

    const hydratedPersistedDoc = hydrateWorkspaceSnapshotBundle({
      notes: Object.fromEntries(
        Array.from(persistedNotes?.entries() ?? []).map(([noteId, bytes]) => [
          noteId,
          Buffer.from(bytes).toString('base64'),
        ])
      ),
      root: Buffer.from(roots.get(workspaceId) ?? new Uint8Array()).toString('base64'),
    })
    const expectedHydratedDoc = hydrateWorkspaceSnapshotBundle(migrated.snapshot)

    try {
      const contentStore = createWorkspaceContentStore(hydratedPersistedDoc)
      expect(hydratedPersistedDoc.getMap<any>('state').toJSON()).toEqual(
        expectedHydratedDoc.getMap<any>('state').toJSON()
      )
      expect(contentStore.getBlockNoteFragment('note-1')?.toString()).toContain('First note')
      expect(contentStore.getBlockNoteFragment('note-2')?.toString()).toContain('Second note')
    } finally {
      expectedHydratedDoc.destroy()
      hydratedPersistedDoc.destroy()
    }

    const rootBytesAfterMigration = await store.loadRoot(workspaceId)
    expect(rootBytesAfterMigration).toEqual(rootBytesA)
    await expect(store.loadNote(workspaceId, 'note-1')).resolves.toEqual(persistedNotes?.get('note-1') ?? null)
    await expect(store.loadNote(workspaceId, 'note-2')).resolves.toEqual(persistedNotes?.get('note-2') ?? null)
    expect(baseStore.loadLegacyDocument).toHaveBeenCalledTimes(1)
    expect(baseStore.saveRoot).toHaveBeenCalledTimes(1)
  })

  it('skips migration when v3 root bytes already exist', async () => {
    const workspaceId = 'workspace-existing-v3'
    const existingRootDoc = new Y.Doc()
    const existingRoot = new Y.Map<unknown>()
    existingRoot.set('marker', 'existing-v3')
    existingRootDoc.getMap('state').set('root', existingRoot)
    const existingRootBytes = Y.encodeStateAsUpdateV2(existingRootDoc)

    const baseStore: LegacyDocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadLegacyDocument: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => existingRootBytes),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    try {
      const store = new MigratingDocumentStore(baseStore, logger)
      await expect(store.loadRoot(workspaceId)).resolves.toEqual(existingRootBytes)

      expect(baseStore.loadLegacyDocument).not.toHaveBeenCalled()
      expect(baseStore.saveRoot).not.toHaveBeenCalled()
      expect(baseStore.saveNote).not.toHaveBeenCalled()
    } finally {
      existingRootDoc.destroy()
    }
  })

  it('does not persist partial v3 data when migration validation fails', async () => {
    const workspaceId = 'workspace-invalid-legacy'
    const legacyDocument = await createLegacyDocumentBytes(
      createCanvas('root', '', [createBlockNoteNode('dup-note', 'One'), createBlockNoteNode('dup-note', 'Two')]),
      {
        blockNotes: { 'dup-note': '# duplicate content' },
      }
    )

    const baseStore: LegacyDocumentStore = {
      deleteNote: vi.fn(async () => undefined),
      loadLegacyDocument: vi.fn(async () => legacyDocument),
      loadNote: vi.fn(async () => null),
      loadRoot: vi.fn(async () => null),
      saveNote: vi.fn(async () => undefined),
      saveRoot: vi.fn(async () => undefined),
    }

    const store = new MigratingDocumentStore(baseStore, logger)

    await expect(store.loadRoot(workspaceId)).rejects.toThrow(
      `Workspace ${workspaceId} failed legacy note-subdoc migration validation`
    )
    expect(baseStore.saveRoot).not.toHaveBeenCalled()
    expect(baseStore.saveNote).not.toHaveBeenCalled()
  })
})
