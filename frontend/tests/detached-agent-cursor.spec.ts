import { BlockNoteEditor } from '@blocknote/core'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DetachedMarkdownBlockNote } from '@/components/note-editors/DetachedMarkdownBlockNote'
import { getNextDetachedMarkdownReveal } from '@/components/note-editors/detachedMarkdownReveal'
import { lightTheme } from '@/constants/themes'
import { getDetachedAgentCursorAnchor, getDetachedAgentCursorPosition } from '@/lib/detachedAgentCursorExtension'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { ThemeContext } from '@/providers/theme/ThemeContext'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

type TestEditor = BlockNoteEditor<typeof blockNoteSchema>

const createdEditors: TestEditor[] = []
let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null

function createEditor(): TestEditor {
  const editor = BlockNoteEditor.create({
    schema: blockNoteSchema,
  })
  createdEditors.push(editor)
  return editor
}

function getLastTopLevelBlockId(editor: TestEditor): string {
  const lastBlock = editor.document.at(-1)
  if (!lastBlock) {
    throw new Error('Expected at least one top-level block')
  }

  return lastBlock.id
}

function getDeepestLastBlockId(editor: TestEditor): string {
  let currentBlock = editor.document.at(-1)
  if (!currentBlock) {
    throw new Error('Expected at least one block')
  }

  while (currentBlock.children.length > 0) {
    currentBlock = currentBlock.children.at(-1)!
  }

  return currentBlock.id
}

function getTextEndPosition(editor: TestEditor, text: string): number {
  let textEndPosition: number | null = null

  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(text)) {
      return true
    }

    textEndPosition = pos + node.text.length
    return false
  })

  if (textEndPosition === null) {
    throw new Error(`Expected to find text: ${text}`)
  }

  return textEndPosition
}

async function createEditorFromMarkdown(markdown: string): Promise<TestEditor> {
  const editor = createEditor()
  const blocks = await editor.tryParseMarkdownToBlocks(markdown)
  editor.replaceBlocks(editor.topLevelBlocks, blocks)
  return editor
}

function expectCursorToMatchBlockNote(editor: TestEditor, targetBlockId = getLastTopLevelBlockId(editor)): void {
  const detachedCursorPosition = getDetachedAgentCursorPosition(editor.prosemirrorState.doc)
  expect(detachedCursorPosition).not.toBeNull()

  editor.setTextCursorPosition(targetBlockId, 'end')

  expect(detachedCursorPosition).toBe(editor.prosemirrorState.selection.from)
}

afterEach(() => {
  for (const editor of createdEditors.splice(0)) {
    editor._tiptapEditor.destroy()
  }

  if (mountedRoot) {
    act(() => {
      mountedRoot?.unmount()
    })
  }

  if (mountedContainer?.parentNode) {
    mountedContainer.parentNode.removeChild(mountedContainer)
  }

  mountedRoot = null
  mountedContainer = null
})

describe('getDetachedAgentCursorPosition', () => {
  it('reveals markdown toward natural word boundaries', () => {
    const next = getNextDetachedMarkdownReveal('Hello', 'Hello world again', 16)

    expect(next.length).toBeGreaterThan('Hello'.length)
    expect(next).toMatch(/^Hello(?:\s|\sw)/)
  })

  it('matches BlockNote end selection for partial markdown in a list item', async () => {
    const editor = await createEditorFromMarkdown(`Possible next slices of work\n\n- Friction\n- **Recove`)

    expectCursorToMatchBlockNote(editor)
  })

  it('matches BlockNote end selection for the final paragraph', async () => {
    const editor = await createEditorFromMarkdown(`# Heading\n\nA short paragraph`)

    expectCursorToMatchBlockNote(editor)
  })

  it('matches BlockNote end selection for nested children', async () => {
    const editor = createEditor()
    editor.replaceBlocks(editor.topLevelBlocks, [
      {
        type: 'paragraph',
        content: 'Parent block',
        children: [
          {
            type: 'paragraph',
            content: 'Nested child',
            children: [{ type: 'bulletListItem', content: 'Deepest child' }],
          },
        ],
      },
    ])

    expectCursorToMatchBlockNote(editor, getDeepestLastBlockId(editor))
  })

  it('matches BlockNote end selection for tables', async () => {
    const editor = createEditor()
    editor.replaceBlocks(editor.topLevelBlocks, [
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [
            {
              cells: [[{ type: 'text', text: 'Left', styles: {} }], [{ type: 'text', text: 'Right edge', styles: {} }]],
            },
          ],
        },
      },
    ])

    expectCursorToMatchBlockNote(editor)
  })

  it('anchors table cursor to the last non-empty cell instead of the final table cell', async () => {
    const editor = createEditor()
    editor.replaceBlocks(editor.topLevelBlocks, [
      {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: [
            {
              cells: [[{ type: 'text', text: 'Working cell', styles: {} }], []],
            },
            {
              cells: [[], []],
            },
          ],
        },
      },
    ])

    const detachedCursorPosition = getDetachedAgentCursorPosition(editor.prosemirrorState.doc)

    expect(detachedCursorPosition).toBe(getTextEndPosition(editor, 'Working cell'))
  })

  it('renders the detached cursor at the computed deepest-write anchor', async () => {
    const markdown = `Possible next slices of work\n\n- Friction\n- **Recove`
    const editor = await createEditorFromMarkdown(markdown)
    const expectedAnchor = getDetachedAgentCursorAnchor(editor.prosemirrorState.doc)
    expect(expectedAnchor).not.toBeNull()

    mountedContainer = document.createElement('div')
    document.body.appendChild(mountedContainer)
    mountedRoot = createRoot(mountedContainer)

    await act(async () => {
      mountedRoot?.render(
        createElement(
          ThemeContext.Provider,
          {
            value: {
              theme: lightTheme,
              themeMode: 'light',
              toggleTheme: () => {},
              setThemeMode: () => {},
            },
          },
          createElement(DetachedMarkdownBlockNote, {
            markdown,
          })
        )
      )
    })

    const cursor = mountedContainer.querySelector('.bn-detached-agent-cursor')
    expect(cursor).not.toBeNull()
    expect(cursor?.getAttribute('data-detached-agent-pos')).toBe(String(expectedAnchor?.position))
    expect(cursor?.getAttribute('data-detached-agent-block-type')).toBe(expectedAnchor?.blockType)

    expect(cursor?.getAttribute('data-detached-agent-block-id')).toEqual(expect.any(String))
    expect(mountedContainer.querySelector('.bn-editor .bn-detached-agent-cursor')).toBe(cursor)
  })
})
