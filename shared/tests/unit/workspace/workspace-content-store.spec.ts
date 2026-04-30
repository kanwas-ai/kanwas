import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { copyBlockNoteFragment } from '../../../src/workspace/blocknote-fragment-copy.js'
import { ContentConverter } from '../../../src/workspace/content-converter.js'
import {
  ensureAttachedNoteDoc,
  ensureWorkspaceNotesMap,
  findNoteBlockNoteFragment,
  getNoteDoc,
  getNoteDocMeta,
  listWorkspaceNoteIds,
  setNoteDoc,
} from '../../../src/workspace/note-doc.js'
import { createWorkspaceContentStore } from '../../../src/workspace/workspace-content-store.js'

function collectHeadingLevels(fragment: Y.XmlFragment): number[] {
  const levels: number[] = []

  const visit = (node: unknown): void => {
    if (!(node instanceof Y.XmlElement)) {
      return
    }

    if (node.nodeName === 'heading') {
      const level = node.getAttribute('level')
      if (typeof level === 'number') {
        levels.push(level)
      }
    }

    for (const child of node.toArray()) {
      visit(child)
    }
  }

  for (const child of fragment.toArray()) {
    visit(child)
  }

  return levels
}

function collectChecklistCheckedValues(fragment: Y.XmlFragment): Array<boolean | undefined> {
  const checkedValues: Array<boolean | undefined> = []

  const visit = (node: unknown): void => {
    if (!(node instanceof Y.XmlElement)) {
      return
    }

    if (node.nodeName === 'checkListItem') {
      checkedValues.push(node.getAttribute('checked') as boolean | undefined)
    }

    for (const child of node.toArray()) {
      visit(child)
    }
  }

  for (const child of fragment.toArray()) {
    visit(child)
  }

  return checkedValues
}

describe('WorkspaceContentStore', () => {
  it('stores blocknote content in note subdocs when notes map exists', async () => {
    const yDoc = new Y.Doc()
    ensureWorkspaceNotesMap(yDoc)

    const store = createWorkspaceContentStore(yDoc)
    const converter = new ContentConverter()

    store.createNoteDoc('block-1', 'blockNote')
    store.setBlockNoteFragment('block-1', await converter.createFragmentFromMarkdown('## Title\n\nBody text'))

    const blockNoteDoc = getNoteDoc(yDoc, 'block-1')

    expect(blockNoteDoc).toBeDefined()
    expect(getNoteDocMeta(blockNoteDoc!)).toEqual({
      schemaVersion: 1,
      noteId: 'block-1',
      contentKind: 'blockNote',
    })
    expect(listWorkspaceNoteIds(yDoc)).toEqual(['block-1'])

    const fragment = store.getBlockNoteFragment('block-1')
    expect(fragment).toBeDefined()
    expect(await converter.fragmentToMarkdown(fragment!)).toContain('## Title')
  })

  it('creates note subdocs even when the root notes map is absent', async () => {
    const yDoc = new Y.Doc()
    const store = createWorkspaceContentStore(yDoc)
    const converter = new ContentConverter()

    store.createNoteDoc('block-1', 'blockNote')
    store.setBlockNoteFragment('block-1', await converter.createFragmentFromMarkdown('# Block note body'))

    expect(yDoc.share.get('notes')).toBeInstanceOf(Y.Map)
    expect(yDoc.share.get('editors')).toBeUndefined()
    expect(await converter.fragmentToMarkdown(store.getBlockNoteFragment('block-1')!)).toContain('Block note body')
  })

  it('preserves sticky note kind when writing a fragment', async () => {
    const yDoc = new Y.Doc()
    const store = createWorkspaceContentStore(yDoc)
    const converter = new ContentConverter()

    store.createNoteDoc('sticky-1', 'stickyNote')
    store.setBlockNoteFragment('sticky-1', await converter.createFragmentFromMarkdown('Sticky body'))

    const stickyDoc = getNoteDoc(yDoc, 'sticky-1')
    expect(stickyDoc).toBeDefined()
    expect(getNoteDocMeta(stickyDoc!)).toEqual({
      schemaVersion: 1,
      noteId: 'sticky-1',
      contentKind: 'stickyNote',
    })
    expect(await converter.fragmentToMarkdown(store.getBlockNoteFragment('sticky-1')!)).toContain('Sticky body')
  })

  it('returns an empty fragment for persisted empty note docs', () => {
    const yDoc = new Y.Doc()
    const store = createWorkspaceContentStore(yDoc)

    store.createNoteDoc('empty-note', 'blockNote')
    const noteDoc = getNoteDoc(yDoc, 'empty-note')

    if (!noteDoc) {
      throw new Error('Expected attached empty note doc')
    }

    const hydratedDoc = new Y.Doc()
    Y.applyUpdateV2(hydratedDoc, Y.encodeStateAsUpdateV2(yDoc))
    Y.applyUpdateV2(hydratedDoc.getMap<Y.Doc>('notes').get('empty-note') as Y.Doc, Y.encodeStateAsUpdateV2(noteDoc))

    const hydratedStore = createWorkspaceContentStore(hydratedDoc)
    const fragment = hydratedStore.getBlockNoteFragment('empty-note')

    expect(fragment).toBeDefined()
    expect(fragment?.length).toBe(0)
  })

  it('does not read legacy root maps in default subdoc mode', async () => {
    const yDoc = new Y.Doc()
    const converter = new ContentConverter()
    const legacyFragment = await converter.createFragmentFromMarkdown('# Legacy block note')

    yDoc.getMap<Y.XmlFragment>('editors').set('block-1', legacyFragment)

    const store = createWorkspaceContentStore(yDoc)

    expect(store.listNoteIds()).toEqual([])
    expect(store.getNoteKind('block-1')).toBeNull()
    expect(store.getBlockNoteFragment('block-1')).toBeUndefined()
  })

  it('does not create note content on read', () => {
    const yDoc = new Y.Doc()
    ensureWorkspaceNotesMap(yDoc)

    const store = createWorkspaceContentStore(yDoc)
    const fragment = store.getBlockNoteFragment('missing-note')

    expect(fragment).toBeUndefined()
    expect(getNoteDoc(yDoc, 'missing-note')).toBeUndefined()
    expect(listWorkspaceNoteIds(yDoc)).toEqual([])
    expect(yDoc.share.get('editors')).toBeUndefined()
  })

  it('rejects malformed attached note docs instead of rewriting them', () => {
    const yDoc = new Y.Doc()
    setNoteDoc(yDoc, 'bad-note', new Y.Doc({ guid: 'bad-note' }))

    const store = createWorkspaceContentStore(yDoc)

    expect(() => store.setBlockNoteFragment('bad-note', new Y.XmlFragment())).toThrow('missing valid metadata')
  })
})

describe('copyBlockNoteFragment', () => {
  it('preserves non-string BlockNote attributes', async () => {
    const converter = new ContentConverter()
    const sourceDoc = new Y.Doc()
    const targetDoc = new Y.Doc()

    const sourceNoteDoc = ensureAttachedNoteDoc(sourceDoc, 'source-note', 'blockNote')
    const targetNoteDoc = ensureAttachedNoteDoc(targetDoc, 'target-note', 'blockNote')
    const sourceFragment = findNoteBlockNoteFragment(sourceNoteDoc)
    const targetFragment = findNoteBlockNoteFragment(targetNoteDoc)

    if (!sourceFragment || !targetFragment) {
      throw new Error('Expected note docs to provide BlockNote fragments')
    }

    copyBlockNoteFragment(
      await converter.createFragmentFromMarkdown('# Level 1\n\n## Level 2\n\n- [x] done\n- [ ] todo'),
      sourceFragment
    )
    copyBlockNoteFragment(sourceFragment, targetFragment)

    expect(collectHeadingLevels(targetFragment)).toEqual([1, 2])
    expect(collectChecklistCheckedValues(targetFragment)).toEqual([true, false])

    const markdown = await converter.fragmentToMarkdown(targetFragment)
    expect(markdown).toContain('# Level 1')
    expect(markdown).toContain('## Level 2')
    expect(markdown).toContain('[x] done')
    expect(markdown).toContain('[ ] todo')
  })

  it('preserves mixed inline formatting spans inside XmlText nodes', () => {
    const sourceDoc = new Y.Doc()
    const targetDoc = new Y.Doc()

    const sourceNoteDoc = ensureAttachedNoteDoc(sourceDoc, 'source-note', 'blockNote')
    const targetNoteDoc = ensureAttachedNoteDoc(targetDoc, 'target-note', 'blockNote')
    const sourceFragment = findNoteBlockNoteFragment(sourceNoteDoc)
    const targetFragment = findNoteBlockNoteFragment(targetNoteDoc)

    if (!sourceFragment || !targetFragment) {
      throw new Error('Expected note docs to provide BlockNote fragments')
    }

    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    paragraph.insert(0, [text])
    sourceFragment.insert(0, [paragraph])

    text.insert(0, 'Komu: Google kontakt')
    text.format(0, 5, { bold: {} })

    copyBlockNoteFragment(sourceFragment, targetFragment)

    expect(targetFragment.toString()).toContain('<bold>Komu:</bold> Google kontakt')

    const targetText = targetFragment.get(0)?.get(0)
    expect(targetText instanceof Y.XmlText ? targetText.toDelta() : null).toEqual(text.toDelta())
  })
})
