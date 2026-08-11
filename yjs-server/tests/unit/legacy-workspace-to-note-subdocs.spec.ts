import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createWorkspaceContentStore } from 'shared'
import { getNoteDocMeta } from 'shared/note-doc'
import { ContentConverter, hydrateWorkspaceSnapshotBundle, workspaceToFilesystem } from 'shared/server'
import { migrateLegacyWorkspace } from '../../src/migrations/legacy_workspace_to_note_subdocs.js'
import {
  createBlockNoteNode,
  createCanvas,
  createLegacyDocumentBytes,
  createPlainNoteNode,
} from '../helpers/workspace-fixtures.js'

async function readNoteMarkdown(yDoc: Y.Doc, noteId: string): Promise<string> {
  const fragment = createWorkspaceContentStore(yDoc).getBlockNoteFragment(noteId)
  if (!fragment) {
    throw new Error(`Missing fragment for ${noteId}`)
  }

  return new ContentConverter().fragmentToMarkdown(fragment)
}

function expectCanonicalMigratedRoot(yDoc: Y.Doc): void {
  const root = yDoc.getMap<unknown>('state').get('root')
  expect(root).toBeInstanceOf(Y.Map)

  const rootMap = root as Y.Map<unknown>
  expect(rootMap.get('items')).toBeInstanceOf(Y.Array)
  expect(rootMap.get('edges')).toBeInstanceOf(Y.Array)
  expect(rootMap.get('xynode')).toBeInstanceOf(Y.Map)

  const items = rootMap.get('items') as Y.Array<unknown>
  const nestedCanvas = items.get(1)
  expect(nestedCanvas).toBeInstanceOf(Y.Map)
  expect((nestedCanvas as Y.Map<unknown>).get('items')).toBeInstanceOf(Y.Array)

  const rootPosition = (rootMap.get('xynode') as Y.Map<unknown>).get('position') as unknown
  expect(rootPosition).toBeInstanceOf(Y.Map)
}

describe('migrateLegacyWorkspace', () => {
  it('migrates nested legacy workspaces end-to-end and prunes legacy-only nodes', async () => {
    const root = createCanvas('root', '', [
      createBlockNoteNode('note-block', 'Block Note'),
      createPlainNoteNode('note-plain', 'Plain Note'),
      createCanvas('project-canvas', 'Project', [createBlockNoteNode('nested-note', 'Nested Note')]),
      createCanvas('system', 'system', [createBlockNoteNode('system-note', 'System Note')]),
    ])

    const legacyDocument = await createLegacyDocumentBytes(root, {
      blockNotes: {
        'note-block': '# Hello from BlockNote',
        'nested-note': '## Nested content\n\n- one\n- two',
        'system-note': '# System content',
      },
      plainNotes: { 'note-plain': 'hello plain note' },
    })

    const migrated = await migrateLegacyWorkspace(legacyDocument)
    expect(migrated.validation).toEqual({ failures: [], valid: true, warnings: [] })

    const yDoc = hydrateWorkspaceSnapshotBundle(migrated.snapshot)

    try {
      expect(yDoc.share.get('editors')).toBeUndefined()
      expect(yDoc.share.get('plainNoteContents')).toBeUndefined()
      expectCanonicalMigratedRoot(yDoc)

      const rootState = yDoc.getMap<any>('state').toJSON().root
      expect(rootState.items.map((item: { id: string }) => item.id)).toEqual(['note-block', 'project-canvas'])
      expect(rootState.items[1].items.map((item: { id: string }) => item.id)).toEqual(['nested-note'])

      const notesMap = yDoc.getMap<Y.Doc>('notes')
      expect(Array.from(notesMap.keys()).sort()).toEqual(['nested-note', 'note-block'])

      const blockMeta = getNoteDocMeta(notesMap.get('note-block') as Y.Doc)
      const nestedMeta = getNoteDocMeta(notesMap.get('nested-note') as Y.Doc)
      expect(blockMeta).toEqual({ contentKind: 'blockNote', noteId: 'note-block', schemaVersion: 1 })
      expect(nestedMeta).toEqual({ contentKind: 'blockNote', noteId: 'nested-note', schemaVersion: 1 })

      await expect(readNoteMarkdown(yDoc, 'note-block')).resolves.toContain('# Hello from BlockNote')
      await expect(readNoteMarkdown(yDoc, 'nested-note')).resolves.toContain('## Nested content')

      const fsTree = await workspaceToFilesystem({ root: rootState }, createWorkspaceContentStore(yDoc))
      expect(fsTree.children?.filter((child) => child.name !== 'metadata.yaml').map((child) => child.name)).toEqual([
        'block-note.md',
        'project',
      ])
      const projectFolder = fsTree.children?.find((child) => child.type === 'folder' && child.name === 'project')
      expect(
        projectFolder?.children?.filter((child) => child.name !== 'metadata.yaml').map((child) => child.name)
      ).toEqual(['nested-note.md'])
      expect(
        projectFolder?.children?.find((child) => child.name === 'nested-note.md')?.data?.toString('utf8')
      ).toContain('## Nested content')
    } finally {
      yDoc.destroy()
    }
  })

  it('keeps missing-fragment notes as empty docs and records a warning', async () => {
    const root = createCanvas('root', '', [createBlockNoteNode('missing-note', 'Missing Note')])
    const legacyDocument = await createLegacyDocumentBytes(root)

    const migrated = await migrateLegacyWorkspace(legacyDocument)
    expect(migrated.validation.valid).toBe(true)
    expect(migrated.validation.failures).toEqual([])
    expect(migrated.validation.warnings).toEqual([{ issue: 'missing_blocknote_fragment', noteId: 'missing-note' }])

    const yDoc = hydrateWorkspaceSnapshotBundle(migrated.snapshot)

    try {
      const notesMap = yDoc.getMap<Y.Doc>('notes')
      expect(Array.from(notesMap.keys())).toEqual(['missing-note'])

      const noteDoc = notesMap.get('missing-note')
      expect(noteDoc?.guid).toBe('missing-note')
      expect(getNoteDocMeta(noteDoc as Y.Doc)).toEqual({
        contentKind: 'blockNote',
        noteId: 'missing-note',
        schemaVersion: 1,
      })

      const fragment = createWorkspaceContentStore(yDoc).getBlockNoteFragment('missing-note')
      expect(fragment).toBeDefined()
      expect(fragment?.length).toBe(0)

      const fsTree = await workspaceToFilesystem(yDoc.getMap<any>('state').toJSON(), createWorkspaceContentStore(yDoc))
      expect(fsTree.children?.find((child) => child.name !== 'metadata.yaml')?.name).toBe('missing-note.md')
      expect(fsTree.children?.find((child) => child.name === 'missing-note.md')?.data?.toString('utf8')).toContain(
        '(Empty content)'
      )
    } finally {
      yDoc.destroy()
    }
  })

  it('preserves mixed inline formatting spans from legacy BlockNote content', async () => {
    const root = createCanvas('root', '', [createBlockNoteNode('formatted-note', 'Formatted Note')])
    const legacyDocument = await createLegacyDocumentBytes(root, {
      blockNotes: {
        'formatted-note': '**Komu:** Google kontakt\n\n**Předmět:** RE: Shrnutí z naší schůzky',
      },
    })

    const migrated = await migrateLegacyWorkspace(legacyDocument)
    expect(migrated.validation).toEqual({ failures: [], valid: true, warnings: [] })

    const yDoc = hydrateWorkspaceSnapshotBundle(migrated.snapshot)

    try {
      const fragment = createWorkspaceContentStore(yDoc).getBlockNoteFragment('formatted-note')
      expect(fragment?.toString()).toContain('<bold>Komu:</bold> Google kontakt')
      expect(fragment?.toString()).toContain('<bold>Předmět:</bold> RE: Shrnutí z naší schůzky')
      await expect(readNoteMarkdown(yDoc, 'formatted-note')).resolves.toContain('**Komu:** Google kontakt')
    } finally {
      yDoc.destroy()
    }
  })

  it('fails validation when legacy state contains duplicate blocknote ids', async () => {
    const root = createCanvas('root', '', [
      createBlockNoteNode('dup-note', 'One'),
      createBlockNoteNode('dup-note', 'Two'),
    ])

    const legacyDocument = await createLegacyDocumentBytes(root, {
      blockNotes: { 'dup-note': '# duplicate content' },
    })

    const migrated = await migrateLegacyWorkspace(legacyDocument)

    expect(migrated.validation.valid).toBe(false)
    expect(migrated.validation.failures.join('\n')).toContain('duplicate note ids in state: dup-note')
    expect(migrated.validation.failures.join('\n')).toContain('note count mismatch')
  })
})
