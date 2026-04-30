import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { ContentConverter } from '../../../src/workspace/content-converter.js'
import { createNoteDoc, findNoteBlockNoteFragment } from '../../../src/workspace/note-doc.js'

const TEST_SOURCE = 'content-converter.spec'

describe('ContentConverter', () => {
  let converter: ContentConverter

  beforeEach(() => {
    converter = new ContentConverter()
  })

  function createAttachedFragment(nodeId = 'test'): {
    meta: Y.Map<unknown>
    noteDoc: Y.Doc
    fragment: Y.XmlFragment
  } {
    const noteDoc = createNoteDoc(nodeId, 'blockNote')
    const fragment = findNoteBlockNoteFragment(noteDoc)
    if (!fragment) {
      throw new Error(`Expected BlockNote fragment for ${nodeId}`)
    }

    return { meta: noteDoc.getMap('meta'), noteDoc, fragment }
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

  describe('createFragmentFromMarkdown', () => {
    it('should create a Y.XmlFragment from markdown', async () => {
      const markdown = '# Hello World\n\nThis is a test paragraph.'
      const fragment = await converter.createFragmentFromMarkdown(markdown)

      expect(fragment).toBeInstanceOf(Y.XmlFragment)

      // Must attach to a Y.Doc before accessing .length (Yjs requirement)
      const yDoc = new Y.Doc()
      yDoc.getMap('editors').set('test', fragment)
      expect(fragment.length).toBeGreaterThan(0)
    })

    it('should create fragment from empty markdown', async () => {
      const fragment = await converter.createFragmentFromMarkdown('')

      expect(fragment).toBeInstanceOf(Y.XmlFragment)
    })

    it('should handle complex markdown with lists', async () => {
      const markdown = `# Title

- Item 1
- Item 2
- Item 3

Some text.`

      const fragment = await converter.createFragmentFromMarkdown(markdown)
      expect(fragment).toBeInstanceOf(Y.XmlFragment)

      // Must attach to a Y.Doc before accessing .length (Yjs requirement)
      const yDoc = new Y.Doc()
      yDoc.getMap('fragments').set('test', fragment)
      expect(fragment.length).toBeGreaterThan(0)
    })
  })

  describe('updateFragmentFromMarkdown', () => {
    it('updates the existing fragment in place and keeps registered-fragment identity', async () => {
      const nodeId = 'node-in-place'
      const { noteDoc, fragment } = createAttachedFragment(nodeId)

      await expect(
        converter.updateFragmentFromMarkdown(fragment, '# Updated\n\nNew content.', {
          nodeId,
          source: TEST_SOURCE,
        })
      ).resolves.not.toThrow()

      expect(fragment).toBeInstanceOf(Y.XmlFragment)
      expect(findNoteBlockNoteFragment(noteDoc)).toBe(fragment)
    })

    it('preserves checklist boolean attributes on in-place updates', async () => {
      const nodeId = 'checklist-node'
      const { noteDoc, fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '- [x] checked item\n- [ ] unchecked item', {
        nodeId,
        source: TEST_SOURCE,
      })

      expect(findNoteBlockNoteFragment(noteDoc)).toBe(fragment)
      expect(collectChecklistCheckedValues(fragment)).toEqual([true, false])

      const markdown = await converter.fragmentToMarkdown(fragment)
      expect(markdown).toContain('[x] checked item')
      expect(markdown).toContain('[ ] unchecked item')
    })

    it('throws structured strict error when fragment is detached', async () => {
      const fragment = new Y.XmlFragment()

      await expect(
        converter.updateFragmentFromMarkdown(fragment, '# Updated', {
          nodeId: 'detached-node',
          source: TEST_SOURCE,
        })
      ).rejects.toMatchObject({
        name: 'StrictFragmentUpdateError',
        nodeId: 'detached-node',
        failureType: 'detached_fragment',
        sourceContext: TEST_SOURCE,
      })
    })

    it('throws structured strict error on registered content mismatch without mutation', async () => {
      const { fragment: fragmentA } = createAttachedFragment('node-a')

      await converter.updateFragmentFromMarkdown(fragmentA, '# Original A', {
        nodeId: 'node-a',
        source: TEST_SOURCE,
      })

      const beforeMarkdown = await converter.fragmentToMarkdown(fragmentA)

      await expect(
        converter.updateFragmentFromMarkdown(fragmentA, '# Should Fail', {
          nodeId: 'node-b',
          source: TEST_SOURCE,
        })
      ).rejects.toMatchObject({
        name: 'StrictFragmentUpdateError',
        nodeId: 'node-b',
        failureType: 'registered_content_mismatch',
        sourceContext: TEST_SOURCE,
      })

      const afterMarkdown = await converter.fragmentToMarkdown(fragmentA)
      expect(afterMarkdown).toBe(beforeMarkdown)
    })

    it('throws structured strict error for parse failures without mutation', async () => {
      const nodeId = 'parse-node'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '# Stable Before Parse Failure', {
        nodeId,
        source: TEST_SOURCE,
      })
      const beforeMarkdown = await converter.fragmentToMarkdown(fragment)

      const editor = (converter as any).editor
      const originalTryParse = editor.tryParseMarkdownToBlocks
      editor.tryParseMarkdownToBlocks = async () => {
        throw new Error('forced parse failure')
      }

      try {
        await expect(
          converter.updateFragmentFromMarkdown(fragment, '# This parse should fail', {
            nodeId,
            source: TEST_SOURCE,
          })
        ).rejects.toMatchObject({
          name: 'StrictFragmentUpdateError',
          nodeId,
          failureType: 'parse_failed',
          sourceContext: TEST_SOURCE,
        })
      } finally {
        editor.tryParseMarkdownToBlocks = originalTryParse
      }

      const afterMarkdown = await converter.fragmentToMarkdown(fragment)
      expect(afterMarkdown).toBe(beforeMarkdown)
    })

    it('throws structured strict error for apply failures and keeps prior content', async () => {
      const nodeId = 'apply-node'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '# Stable Before Apply Failure', {
        nodeId,
        source: TEST_SOURCE,
      })
      const beforeMarkdown = await converter.fragmentToMarkdown(fragment)

      const editor = (converter as any).editor
      const originalBlocksToFragment = editor.blocksToYXmlFragment
      editor.blocksToYXmlFragment = ((blocks: unknown, targetFragment?: Y.XmlFragment) => {
        if (targetFragment) {
          throw new Error('forced apply failure')
        }
        return originalBlocksToFragment.call(editor, blocks)
      }) as typeof editor.blocksToYXmlFragment

      try {
        await expect(
          converter.updateFragmentFromMarkdown(fragment, '# This apply should fail', {
            nodeId,
            source: TEST_SOURCE,
          })
        ).rejects.toMatchObject({
          name: 'StrictFragmentUpdateError',
          nodeId,
          failureType: 'apply_failed',
          sourceContext: TEST_SOURCE,
        })
      } finally {
        editor.blocksToYXmlFragment = originalBlocksToFragment
      }

      const afterMarkdown = await converter.fragmentToMarkdown(fragment)
      expect(afterMarkdown).toBe(beforeMarkdown)
    })

    it('throws strict error when registered content changes between parse and apply', async () => {
      const nodeId = 'race-node'
      const { meta, fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '# Stable Before Race', {
        nodeId,
        source: TEST_SOURCE,
      })

      const editor = (converter as any).editor
      const originalTryParse = editor.tryParseMarkdownToBlocks

      editor.tryParseMarkdownToBlocks = async (markdown: string) => {
        const parsed = await originalTryParse.call(editor, markdown)
        meta.set('noteId', `${nodeId}-replacement`)
        return parsed
      }

      try {
        await expect(
          converter.updateFragmentFromMarkdown(fragment, '# Should fail due to membership race', {
            nodeId,
            source: TEST_SOURCE,
          })
        ).rejects.toMatchObject({
          name: 'StrictFragmentUpdateError',
          nodeId,
          failureType: 'registered_content_mismatch',
          sourceContext: TEST_SOURCE,
        })
      } finally {
        editor.tryParseMarkdownToBlocks = originalTryParse
      }

      const afterMarkdown = await converter.fragmentToMarkdown(fragment)
      expect(afterMarkdown).toContain('Stable Before Race')
    })

    it('throws strict identity-contract error when converter returns a different fragment', async () => {
      const nodeId = 'identity-node'
      const { fragment } = createAttachedFragment(nodeId)
      const editor = (converter as any).editor
      const originalBlocksToFragment = editor.blocksToYXmlFragment

      editor.blocksToYXmlFragment = ((blocks: unknown, targetFragment?: Y.XmlFragment) => {
        if (targetFragment) {
          return new Y.XmlFragment()
        }
        return originalBlocksToFragment.call(editor, blocks)
      }) as typeof editor.blocksToYXmlFragment

      try {
        await expect(
          converter.updateFragmentFromMarkdown(fragment, '# Identity should fail', {
            nodeId,
            source: TEST_SOURCE,
          })
        ).rejects.toMatchObject({
          name: 'StrictFragmentUpdateError',
          nodeId,
          failureType: 'identity_contract_violated',
          sourceContext: TEST_SOURCE,
        })
      } finally {
        editor.blocksToYXmlFragment = originalBlocksToFragment
      }
    })
  })

  describe('fragmentToMarkdown', () => {
    it('should convert Y.XmlFragment back to markdown', async () => {
      const nodeId = 'fragment-to-markdown'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '# Hello\n\nWorld', {
        nodeId,
        source: TEST_SOURCE,
      })

      const markdown = await converter.fragmentToMarkdown(fragment)

      expect(markdown).toContain('Hello')
      expect(markdown).toContain('World')
    })

    it('normalizes simple list spacing in exported markdown', async () => {
      const nodeId = 'simple-list-spacing-node'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '# Title\n\n- one\n- two\n- three', {
        nodeId,
        source: TEST_SOURCE,
      })

      await expect(converter.fragmentToMarkdown(fragment)).resolves.toBe('# Title\n\n* one\n* two\n* three\n')
    })

    it('normalizes nested list spacing in exported markdown', async () => {
      const nodeId = 'nested-list-spacing-node'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, '- parent\n  - child one\n  - child two\n- second', {
        nodeId,
        source: TEST_SOURCE,
      })

      await expect(converter.fragmentToMarkdown(fragment)).resolves.toBe(
        '* parent\n  * child one\n  * child two\n* second\n'
      )
    })

    it('normalizes table spacing in exported markdown', async () => {
      const nodeId = 'table-spacing-node'
      const { fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(
        fragment,
        '# Next Play intros - potential reach out\n\n**Top priority shortlist**\n\n| Person | Why they matter | Best first ask |\n|---|---|---|\n| Malavika Balachandran Tadeusz | PM at Vercel; explicitly interested in productivity tools, developer tooling, and AI-native workflows | Ask for product feedback and 2-3 PM intros |\n| Gavin Esajas | Europe-based product leader + ProductTank Amsterdam + already plays matchmaking role for PMs | Ask for PM intros and feedback on wedge / PM persona |',
        {
          nodeId,
          source: TEST_SOURCE,
        }
      )

      await expect(converter.fragmentToMarkdown(fragment)).resolves.toBe(
        '# Next Play intros - potential reach out\n\n**Top priority shortlist**\n\n| Person                        | Why they matter                                                                                       | Best first ask                                       |\n| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |\n| Malavika Balachandran Tadeusz | PM at Vercel; explicitly interested in productivity tools, developer tooling, and AI-native workflows | Ask for product feedback and 2-3 PM intros           |\n| Gavin Esajas                  | Europe-based product leader + ProductTank Amsterdam + already plays matchmaking role for PMs          | Ask for PM intros and feedback on wedge / PM persona |\n'
      )
    })

    it('should handle empty fragment', async () => {
      const yDoc = new Y.Doc()
      const fragment = yDoc.getXmlFragment('test')

      await expect(converter.fragmentToMarkdown(fragment)).resolves.toBe('')
    })
  })

  describe('heading level preservation', () => {
    it('should preserve heading levels through updateFragmentFromMarkdown', async () => {
      const markdown = `# Level 1 Heading

## Level 2 Heading

### Level 3 Heading

Some paragraph text.`

      const nodeId = 'test-node-id'
      const { noteDoc, fragment } = createAttachedFragment(nodeId)

      await converter.updateFragmentFromMarkdown(fragment, markdown, {
        nodeId,
        source: TEST_SOURCE,
      })

      expect(findNoteBlockNoteFragment(noteDoc)).toBe(fragment)

      const resultMarkdown = await converter.fragmentToMarkdown(fragment)

      expect(resultMarkdown).toContain('# Level 1')
      expect(resultMarkdown).toContain('## Level 2')
      expect(resultMarkdown).toContain('### Level 3')
    })

    it('should preserve heading levels through round-trip conversion', async () => {
      const originalMarkdown = `# Level 1 Heading

## Level 2 Heading

### Level 3 Heading

Some paragraph text.`

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)

      const yDoc = new Y.Doc()
      yDoc.getMap('fragments').set('test', fragment)

      const resultMarkdown = await converter.fragmentToMarkdown(fragment)

      expect(resultMarkdown).toContain('# Level 1')
      expect(resultMarkdown).toContain('## Level 2')
      expect(resultMarkdown).toContain('### Level 3')
    })

    it('should preserve h4, h5, h6 heading levels', async () => {
      const originalMarkdown = `#### Level 4 Heading

##### Level 5 Heading

###### Level 6 Heading`

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)
      const yDoc = new Y.Doc()
      yDoc.getMap('editors').set('test', fragment)
      const resultMarkdown = await converter.fragmentToMarkdown(fragment)

      expect(resultMarkdown).toContain('#### Level 4')
      expect(resultMarkdown).toContain('##### Level 5')
      expect(resultMarkdown).toContain('###### Level 6')
    })
  })

  describe('round-trip conversion', () => {
    it('should preserve content through markdown → fragment → markdown', async () => {
      const originalMarkdown =
        '# Test Heading\n\nThis is a paragraph with **bold** and *italic* text.\n\n- Item 1\n- Item 2\n- Item 3'

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)

      const yDoc = new Y.Doc()
      yDoc.getMap('editors').set('test', fragment)

      const resultMarkdown = await converter.fragmentToMarkdown(fragment)

      expect(resultMarkdown).toContain('Test Heading')
      expect(resultMarkdown).toContain('bold')
      expect(resultMarkdown).toContain('italic')
      expect(resultMarkdown).toContain('Item 1')
    })

    it('should work when fragment is added to a different yDoc', async () => {
      const originalMarkdown = '# Hello World\n\nThis is content.'

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)

      const targetYDoc = new Y.Doc()
      const fragmentsMap = targetYDoc.getMap('fragments')
      fragmentsMap.set('test-node-id', fragment)

      const storedFragment = fragmentsMap.get('test-node-id')
      expect(storedFragment).toBeInstanceOf(Y.XmlFragment)

      const resultMarkdown = await converter.fragmentToMarkdown(storedFragment as Y.XmlFragment)

      expect(resultMarkdown).toContain('Hello World')
      expect(resultMarkdown).toContain('This is content')
    })

    it('should sync fragment content between two yDocs via state vectors', async () => {
      const originalMarkdown = '# Synced Content\n\nThis should sync between docs.'

      const sourceDoc = new Y.Doc()
      const fragmentsMap = sourceDoc.getMap('fragments')

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)
      fragmentsMap.set('node-1', fragment)

      const targetDoc = new Y.Doc()
      const stateVector = Y.encodeStateAsUpdateV2(sourceDoc)
      Y.applyUpdateV2(targetDoc, stateVector)

      const targetFragmentsMap = targetDoc.getMap('fragments')
      const syncedFragment = targetFragmentsMap.get('node-1')

      expect(syncedFragment).toBeInstanceOf(Y.XmlFragment)

      const resultMarkdown = await converter.fragmentToMarkdown(syncedFragment as Y.XmlFragment)

      expect(resultMarkdown).toContain('Synced Content')
      expect(resultMarkdown).toContain('This should sync between docs')
    })

    it('preserves workspace interlinks through markdown round-trip', async () => {
      const originalMarkdown = 'See [Plan](/workspace/docs/Plan.md?line=2#L10) for details.'

      const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)

      const yDoc = new Y.Doc()
      yDoc.getMap('editors').set('test', fragment)

      const resultMarkdown = await converter.fragmentToMarkdown(fragment)

      expect(resultMarkdown).toContain('Plan')
      expect(resultMarkdown).toContain('/workspace/docs/Plan.md?line=2#L10')
    })

    it('strips trailing eof newlines when converting markdown to BlockNote', async () => {
      const cases = ['Hello', 'Hello\n', 'Hello\n\n', 'Hello\n\n\n']

      for (const originalMarkdown of cases) {
        const fragment = await converter.createFragmentFromMarkdown(originalMarkdown)

        const yDoc = new Y.Doc()
        yDoc.getMap('editors').set('test', fragment)

        const resultMarkdown = await converter.fragmentToMarkdown(fragment)
        expect(resultMarkdown).toBe('Hello\n')
      }
    })
  })
})
