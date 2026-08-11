import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import {
  createWorkspaceContentStore,
  type CanvasItem,
  type NodeItem,
  type WorkspaceContentStore,
  type WorkspaceDocument,
} from 'shared'
import { copyBlockNoteFragment, createWorkspaceSnapshotBundle, workspaceToFilesystem, type FSNode } from 'shared/server'

export interface LegacyNoteMigrationWarning {
  noteId: string
  issue: 'missing_blocknote_fragment'
}

export interface MigrationValidationResult {
  failures: string[]
  valid: boolean
  warnings: LegacyNoteMigrationWarning[]
}

export interface MigratedWorkspaceSnapshot {
  snapshot: ReturnType<typeof createWorkspaceSnapshotBundle>
  validation: MigrationValidationResult
}

function setCanonicalMigratedRoot(migratedDoc: Y.Doc, root: CanvasItem): void {
  const { bootstrap, dispose } = createYjsProxy<WorkspaceDocument>(migratedDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  try {
    bootstrap({ root })

    const attachedRoot = migratedDoc.getMap('state').get('root')
    if (!(attachedRoot instanceof Y.Map)) {
      throw new Error('Migrated workspace root must be a Y.Map')
    }
  } finally {
    dispose()
  }
}

function listNoteNodes(canvas: CanvasItem | null): NodeItem[] {
  if (!canvas) {
    return []
  }

  const notes: NodeItem[] = []
  for (const item of canvas.items) {
    if (item.kind === 'node') {
      if (item.xynode.type === 'blockNote') {
        notes.push(item)
      }
      continue
    }

    notes.push(...listNoteNodes(item))
  }

  return notes
}

function pruneLegacyRoot(canvas: CanvasItem): CanvasItem {
  const items: Array<NodeItem | CanvasItem> = []

  for (const item of canvas.items) {
    if (item.kind === 'canvas') {
      if (item.id !== 'system' && item.name !== 'system') {
        items.push(pruneLegacyRoot(item))
      }
      continue
    }

    if ((item.xynode.type as string) === 'plainNote') {
      continue
    }

    items.push({
      ...item,
      xynode: {
        ...item.xynode,
        position: { ...item.xynode.position },
        data: { ...(item.xynode.data ?? {}) },
        ...(item.xynode.measured ? { measured: { ...item.xynode.measured } } : {}),
      },
    } as NodeItem)
  }

  return {
    ...canvas,
    xynode: {
      ...canvas.xynode,
      position: { ...canvas.xynode.position },
      data: { ...(canvas.xynode.data ?? {}) },
    },
    edges: [...canvas.edges],
    items,
  }
}

export async function migrateLegacyWorkspace(document: Uint8Array): Promise<MigratedWorkspaceSnapshot> {
  const legacyDoc = new Y.Doc()
  const migratedDoc = new Y.Doc()

  try {
    Y.applyUpdateV2(legacyDoc, document)

    const legacyRoot = legacyDoc.getMap('state').toJSON().root as CanvasItem | undefined
    if (!legacyRoot) {
      throw new Error('Legacy workspace document is missing root state')
    }

    const prunedRoot = pruneLegacyRoot(legacyRoot)
    setCanonicalMigratedRoot(migratedDoc, prunedRoot)

    const contentStore = createWorkspaceContentStore(migratedDoc)
    const warnings: LegacyNoteMigrationWarning[] = []

    for (const note of listNoteNodes(prunedRoot)) {
      contentStore.createNoteDoc(note.id, 'blockNote')
      const targetFragment = contentStore.getBlockNoteFragment(note.id)
      if (!targetFragment) {
        throw new Error(`Failed to create migrated BlockNote fragment for ${note.id}`)
      }

      const sourceFragment = getLegacyBlockNoteFragment(legacyDoc, note.id)
      if (!sourceFragment) {
        seedPersistentEmptyFragment(targetFragment)
        warnings.push({ noteId: note.id, issue: 'missing_blocknote_fragment' })
        continue
      }

      copyBlockNoteFragment(sourceFragment, targetFragment)
    }

    const migratedRoot = migratedDoc.getMap('state').toJSON().root as CanvasItem | undefined
    if (!migratedRoot) {
      throw new Error('Migrated workspace document is missing root state')
    }

    return {
      snapshot: createWorkspaceSnapshotBundle(migratedDoc),
      validation: await validateMigratedWorkspace(legacyDoc, migratedDoc, prunedRoot, migratedRoot, warnings),
    }
  } finally {
    migratedDoc.destroy()
    legacyDoc.destroy()
  }
}

async function validateMigratedWorkspace(
  legacyDoc: Y.Doc,
  migratedDoc: Y.Doc,
  stateRoot: CanvasItem,
  migratedRoot: CanvasItem,
  warnings: LegacyNoteMigrationWarning[]
): Promise<MigrationValidationResult> {
  const failures: string[] = []
  const stateNoteIds = listNoteNodes(stateRoot).map((node) => node.id)
  const duplicateStateNoteIds = findDuplicateNoteIds(stateNoteIds)
  if (duplicateStateNoteIds.length > 0) {
    failures.push(`duplicate note ids in state: ${duplicateStateNoteIds.join(', ')}`)
  }

  const uniqueStateNoteIds = Array.from(new Set(stateNoteIds)).sort()
  const contentStore = createWorkspaceContentStore(migratedDoc)
  const snapshotNoteIds = contentStore.listNoteIds().sort()

  if (stateNoteIds.length !== snapshotNoteIds.length) {
    failures.push(`note count mismatch: expected ${stateNoteIds.length}, got ${snapshotNoteIds.length}`)
  }

  const missingSnapshotNoteIds = uniqueStateNoteIds.filter((noteId) => !snapshotNoteIds.includes(noteId))
  if (missingSnapshotNoteIds.length > 0) {
    failures.push(`missing snapshot note ids: ${missingSnapshotNoteIds.join(', ')}`)
  }

  const extraSnapshotNoteIds = snapshotNoteIds.filter((noteId) => !uniqueStateNoteIds.includes(noteId))
  if (extraSnapshotNoteIds.length > 0) {
    failures.push(`extra snapshot note ids: ${extraSnapshotNoteIds.join(', ')}`)
  }

  for (const note of listNoteNodes(stateRoot)) {
    const actualKind = contentStore.getNoteKind(note.id)
    if (actualKind !== 'blockNote') {
      failures.push(`kind mismatch for ${note.id}: expected blockNote, got ${actualKind ?? 'missing'}`)
      continue
    }

    const legacyFragment = getLegacyBlockNoteFragment(legacyDoc, note.id)
    if (!legacyFragment) {
      continue
    }

    const migratedFragment = contentStore.getBlockNoteFragment(note.id)
    if (!migratedFragment) {
      failures.push(`missing migrated BlockNote fragment for ${note.id}`)
      continue
    }

    if (legacyFragment.toString() !== migratedFragment.toString()) {
      failures.push(`content mismatch for blockNote ${note.id}`)
    }
  }

  attachEmptyLegacyFragmentsForWarnings(legacyDoc, warnings)

  const legacyFilesystem = await workspaceToFilesystem(
    { root: stateRoot } as WorkspaceDocument,
    createLegacyWorkspaceContentStore(legacyDoc)
  )
  const migratedFilesystem = await workspaceToFilesystem({ root: migratedRoot } as WorkspaceDocument, contentStore)

  if (!filesystemNodesEqual(legacyFilesystem, migratedFilesystem)) {
    failures.push('workspaceToFilesystem parity mismatch')
  }

  return {
    failures,
    valid: failures.length === 0,
    warnings,
  }
}

function attachEmptyLegacyFragmentsForWarnings(legacyDoc: Y.Doc, warnings: LegacyNoteMigrationWarning[]): void {
  if (warnings.length === 0) {
    return
  }

  const editors = legacyDoc.getMap<Y.XmlFragment>('editors')
  for (const warning of warnings) {
    if (warning.issue !== 'missing_blocknote_fragment' || editors.has(warning.noteId)) {
      continue
    }

    editors.set(warning.noteId, new Y.XmlFragment())
  }
}

function seedPersistentEmptyFragment(fragment: Y.XmlFragment): void {
  const placeholder = new Y.XmlElement('paragraph')
  fragment.insert(0, [placeholder])
  fragment.delete(0, fragment.length)
}

function findDuplicateNoteIds(noteIds: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const noteId of noteIds) {
    if (seen.has(noteId)) {
      duplicates.add(noteId)
      continue
    }

    seen.add(noteId)
  }

  return Array.from(duplicates).sort()
}

function createLegacyWorkspaceContentStore(legacyDoc: Y.Doc): WorkspaceContentStore {
  return {
    listNoteIds() {
      const noteIds = new Set<string>()

      if (legacyDoc.share.has('editors')) {
        for (const noteId of legacyDoc.getMap<Y.XmlFragment>('editors').keys()) {
          noteIds.add(noteId)
        }
      }

      return Array.from(noteIds).sort()
    },
    getNoteKind(noteId: string) {
      return getLegacyBlockNoteFragment(legacyDoc, noteId) ? 'blockNote' : null
    },
    getNoteFragment(noteId: string) {
      return getLegacyBlockNoteFragment(legacyDoc, noteId)
    },
    getBlockNoteFragment(noteId: string) {
      return getLegacyBlockNoteFragment(legacyDoc, noteId)
    },
    setBlockNoteFragment() {
      throw new Error('Legacy workspace content store is read-only')
    },
    createNoteDoc() {
      throw new Error('Legacy workspace content store is read-only')
    },
    deleteNoteDoc() {
      throw new Error('Legacy workspace content store is read-only')
    },
  }
}

function filesystemNodesEqual(left: FSNode, right: FSNode): boolean {
  return JSON.stringify(serializeFilesystemNode(left)) === JSON.stringify(serializeFilesystemNode(right))
}

function serializeFilesystemNode(node: FSNode): Record<string, unknown> {
  return {
    type: node.type,
    name: node.name,
    ...(node.data ? { data: node.data.toString('base64') } : {}),
    ...(node.children ? { children: node.children.map((child) => serializeFilesystemNode(child)) } : {}),
  }
}

function getLegacyBlockNoteFragment(legacyDoc: Y.Doc, noteId: string): Y.XmlFragment | undefined {
  if (!legacyDoc.share.has('editors')) {
    return undefined
  }

  return legacyDoc.getMap<Y.XmlFragment>('editors').get(noteId) ?? undefined
}

export function convertLegacyStoredDocumentToV2(documentBytes: Uint8Array): Uint8Array {
  const doc = new Y.Doc()

  try {
    if (documentBytes.byteLength > 0) {
      Y.applyUpdate(doc, documentBytes)
    }

    return Y.encodeStateAsUpdateV2(doc)
  } finally {
    doc.destroy()
  }
}
