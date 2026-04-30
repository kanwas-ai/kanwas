import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BlockNoteEditor } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_INTERLINK_TYPE } from 'shared/workspace-interlink'

import { useDocumentCanvasPaste } from '@/hooks/useCanvasPaste'
import {
  parseBlockNoteClipboardHtmlToBlocks,
  parseImportedContentToBlocks,
  type ImportedBlocks,
} from '@/lib/blocknote-import'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { shouldClaimCanvasPaste } from '@/lib/canvasPasteTargeting'
import { PersistSelectionExtension } from '@/lib/persist-selection-extension'
import { BLOCKNOTE_HTML_MIME, getBlockNoteClipboardHtml } from '@/lib/paste-utils'
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

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {}
}

type TestEditor = BlockNoteEditor<typeof blockNoteSchema>
type InlineContentProbe = {
  type?: string
  text?: string
  styles?: Record<string, unknown>
  props?: Record<string, unknown>
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null
let pendingCleanups: Array<() => void> = []

function PasteHarness({
  onPaste,
  shouldBypassActiveTextInput,
}: {
  onPaste: (event: ClipboardEvent) => void
  shouldBypassActiveTextInput?: (event: ClipboardEvent) => boolean
}) {
  useDocumentCanvasPaste({
    onPaste,
    shouldHandlePaste: () => true,
    shouldBypassActiveTextInput,
  })
  return null
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function mountEditor(
  options: { extensions?: unknown[] } = {}
): Promise<{ editor: TestEditor; element: HTMLDivElement }> {
  const editor = BlockNoteEditor.create({
    schema: blockNoteSchema,
    trailingBlock: false,
    _tiptapOptions: options.extensions ? { extensions: options.extensions as never[] } : undefined,
  })
  const element = document.createElement('div')
  document.body.appendChild(element)
  await act(async () => {
    editor.mount(element)
    await flushAsyncWork()
  })

  pendingCleanups.push(() => {
    editor._tiptapEditor.destroy()
    element.remove()
  })

  return { editor, element }
}

async function mountPasteHarness(props: Parameters<typeof PasteHarness>[0]) {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  await act(async () => {
    mountedRoot?.render(createElement(PasteHarness, props))
  })
}

function createClipboardData(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
  } as DataTransfer
}

function createPasteEvent(data: Record<string, string>): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: createClipboardData(data),
  })
  return event
}

function findTextRange(editor: TestEditor, target: string): { from: number; to: number } {
  let resolvedRange: { from: number; to: number } | null = null

  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true
    }

    const startIndex = node.text.indexOf(target)
    if (startIndex === -1) {
      return true
    }

    const from = pos + startIndex
    resolvedRange = { from, to: from + target.length }
    return false
  })

  if (!resolvedRange) {
    throw new Error(`Could not find text range for "${target}"`)
  }

  return resolvedRange
}

function setTextSelection(editor: TestEditor, target: string) {
  const range = findTextRange(editor, target)
  const tiptap = editor._tiptapEditor
  tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, range.from, range.to)))
}

async function replaceEditorBlocks(
  editor: TestEditor,
  blocks: ImportedBlocks | Parameters<TestEditor['replaceBlocks']>[1]
) {
  await act(async () => {
    editor.replaceBlocks(editor.document, blocks)
    await flushAsyncWork()
  })
}

async function selectAllBlocks(editor: TestEditor) {
  await act(async () => {
    editor._tiptapEditor.commands.selectAll()
    await flushAsyncWork()
  })
}

async function selectText(editor: TestEditor, target: string) {
  await act(async () => {
    setTextSelection(editor, target)
    await flushAsyncWork()
  })
}

function serializeSelectedBlockNoteHtml(editor: TestEditor): string {
  const view = editor.prosemirrorView
  if (!view) {
    throw new Error('Editor is not mounted')
  }

  return view.serializeForClipboard(view.state.selection.content()).dom.innerHTML
}

function collectInlineContent(value: unknown): InlineContentProbe[] {
  const collected: InlineContentProbe[] = []

  const visitInlineArray = (content: unknown[]) => {
    for (const item of content) {
      if (item && typeof item === 'object') {
        collected.push(item as InlineContentProbe)
      }
    }
  }

  const visitBlocks = (blocks: unknown[]) => {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue
      }

      const record = block as { content?: unknown; children?: unknown }
      if (Array.isArray(record.content)) {
        visitInlineArray(record.content)
      } else if (
        record.content &&
        typeof record.content === 'object' &&
        Array.isArray((record.content as { rows?: unknown[] }).rows)
      ) {
        for (const row of (record.content as { rows: Array<{ cells?: unknown[] }> }).rows) {
          for (const cell of row.cells ?? []) {
            if (cell && typeof cell === 'object' && Array.isArray((cell as { content?: unknown }).content)) {
              visitInlineArray((cell as { content: unknown[] }).content)
            }
          }
        }
      }

      if (Array.isArray(record.children)) {
        visitBlocks(record.children)
      }
    }
  }

  if (Array.isArray(value)) {
    visitBlocks(value)
  }

  return collected
}

function expectParseOk(result: ReturnType<typeof parseBlockNoteClipboardHtmlToBlocks>): ImportedBlocks {
  if (!result.ok) {
    throw result.error
  }

  return result.blocks
}

afterEach(() => {
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

  for (const cleanup of pendingCleanups.splice(0).reverse()) {
    cleanup()
  }

  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('BlockNote canvas paste regressions', () => {
  it('does not let a persisted yellow selection block blank-canvas BlockNote paste ownership', async () => {
    const { editor, element } = await mountEditor({ extensions: [PersistSelectionExtension as never] })
    await replaceEditorBlocks(editor, [{ type: 'paragraph', content: 'before selected after' }])
    await selectText(editor, 'selected')

    await act(async () => {
      editor._tiptapEditor.view.dom.dispatchEvent(new Event('blur'))
      await flushAsyncWork()
    })

    expect(element.querySelector('.persist-selection-highlight')).not.toBeNull()

    const canvasTarget = document.createElement('div')
    document.body.appendChild(canvasTarget)
    const onPaste = vi.fn((event: ClipboardEvent) => event.preventDefault())

    await mountPasteHarness({
      onPaste,
      shouldBypassActiveTextInput: (event) =>
        shouldClaimCanvasPaste({
          canvasActive: true,
          activeElement: editor._tiptapEditor.view.dom,
          pointerTarget: canvasTarget,
          clipboardHasImportableContent: Boolean(getBlockNoteClipboardHtml(event.clipboardData)),
        }),
    })

    act(() => {
      document.dispatchEvent(createPasteEvent({ [BLOCKNOTE_HTML_MIME]: '<p>Internal BlockNote HTML</p>' }))
    })

    expect(onPaste).toHaveBeenCalledTimes(1)
  })

  it('parses real internal BlockNote clipboard HTML with structure intact', async () => {
    const blocks = parseImportedContentToBlocks(
      [
        '<h2>Launch <strong>Plan</strong></h2>',
        '<ul><li><em>First item</em></li></ul>',
        '<p>See brain</p>',
        '<table><tr><th><p>Day</p></th><th><p>Focus</p></th></tr>',
        '<tr><td><p>1</p></td><td><p>Message</p></td></tr></table>',
      ].join(''),
      'html'
    )
    const { editor } = await mountEditor()
    await replaceEditorBlocks(editor, blocks)
    await selectAllBlocks(editor)

    const clipboardHtml = serializeSelectedBlockNoteHtml(editor)
    const parsedBlocks = expectParseOk(parseBlockNoteClipboardHtmlToBlocks(clipboardHtml))
    const inlineContent = collectInlineContent(parsedBlocks)

    expect(parsedBlocks.some((block) => block.type === 'heading')).toBe(true)
    expect(parsedBlocks.some((block) => block.type === 'bulletListItem')).toBe(true)
    expect(parsedBlocks.some((block) => block.type === 'table')).toBe(true)
    expect(inlineContent.some((item) => item.styles?.bold === true)).toBe(true)
    expect(inlineContent.some((item) => item.styles?.italic === true)).toBe(true)
  })

  it('preserves workspace interlinks in internal BlockNote clipboard HTML', () => {
    const parsedBlocks = expectParseOk(
      parseBlockNoteClipboardHtmlToBlocks(
        [
          '<p>See ',
          '<span data-inline-content-type="workspaceInterlink" data-href="/workspace/brain.md" ',
          'data-canonical-path="brain.md" data-label="brain"></span></p>',
        ].join('')
      )
    )
    const inlineContent = collectInlineContent(parsedBlocks)

    expect(inlineContent.some((item) => item.type === WORKSPACE_INTERLINK_TYPE)).toBe(true)
  })

  it('parses partial internal BlockNote selections without requiring generic HTML fallback', async () => {
    const blocks = parseImportedContentToBlocks('<p>Alpha <strong>Bold</strong> Omega</p>', 'html')
    const { editor } = await mountEditor()
    await replaceEditorBlocks(editor, blocks)
    await selectText(editor, 'Bold')

    const clipboardHtml = serializeSelectedBlockNoteHtml(editor)
    const parsedBlocks = expectParseOk(parseBlockNoteClipboardHtmlToBlocks(clipboardHtml))
    const inlineContent = collectInlineContent(parsedBlocks)

    expect(inlineContent.some((item) => item.text === 'Bold' && item.styles?.bold === true)).toBe(true)
  })

  it('parses internal BlockNote table selections as table blocks', async () => {
    const blocks = parseImportedContentToBlocks(
      '<table><tr><th><p>Day</p></th><th><p>Focus</p></th></tr><tr><td><p>1</p></td><td><p>Message</p></td></tr></table>',
      'html'
    )
    const { editor } = await mountEditor()
    await replaceEditorBlocks(editor, blocks)
    await selectAllBlocks(editor)

    const clipboardHtml = serializeSelectedBlockNoteHtml(editor)
    const parsedBlocks = expectParseOk(parseBlockNoteClipboardHtmlToBlocks(clipboardHtml))

    expect(parsedBlocks[0]).toMatchObject({
      type: 'table',
      content: {
        rows: expect.arrayContaining([
          expect.objectContaining({
            cells: expect.arrayContaining([
              expect.objectContaining({
                content: expect.arrayContaining([expect.objectContaining({ text: 'Day' })]),
              }),
            ]),
          }),
        ]),
      },
    })
  })

  it('returns an observable failure for empty internal BlockNote clipboard HTML', () => {
    const result = parseBlockNoteClipboardHtmlToBlocks('   ')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('BlockNote clipboard HTML is empty')
    }
  })
})
