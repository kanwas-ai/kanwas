// useSnippets.ts

import { useCallback, useContext } from 'react'
import { WorkspaceContext } from '@/providers/workspace/WorkspaceContext'
import { useAuthState } from '@/providers/auth'
import { showToast } from '@/utils/toast'
import { calculateItemPosition, NODE_LAYOUT } from 'shared/constants'
import { findCanvasById } from '@/lib/workspaceUtils'
import { BlockNoteEditor } from '@blocknote/core'
import type { Block } from '@blocknote/core'
import type { CanvasItem, NodeItem } from 'shared'
import * as Y from 'yjs'
import { appendNodeWithCreateAudit, createUserAuditActor, touchNodeAndOwnerCanvasAudit } from '@/lib/workspaceAudit'
import { createNoteDoc, findNoteBlockNoteFragment } from '@/lib/workspaceNoteDoc'
import { WORKSPACE_NOTE_COMMAND_ORIGIN } from '@/lib/workspaceUndo'

const SNIPPETS_NODE_NAME = 'Snippets'

// ─── Types ─────────────────────────────────────────────────────────────────

export type SnippetInput =
  | { type: 'text'; text: string }
  | { type: 'html'; html: string }
  | { type: 'blocks'; blocks: Block[] }

type InlineContent = Block['content']

interface TableContent {
  type: 'tableContent'
  rows: Array<{
    cells: Array<InlineContent | { type?: string; props?: Record<string, unknown>; content: InlineContent }>
  }>
}

// ─── Parser singleton ──────────────────────────────────────────────────────

let parserEditor: BlockNoteEditor | null = null
const getParserEditor = () => (parserEditor ??= BlockNoteEditor.create())

// ─── Utilities ─────────────────────────────────────────────────────────────

function formatShortDateTime(): string {
  const now = new Date()
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

function createTextBlock(text: string, italic = false): Block {
  return {
    id: crypto.randomUUID(),
    type: 'paragraph',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: text ? [{ type: 'text', text, styles: italic ? { italic: true } : {} }] : [],
    children: [],
  } as Block
}

// ─── Y.XmlElement conversion ───────────────────────────────────────────────

function inlineContentToYXml(content: InlineContent): Y.XmlText[] {
  if (!Array.isArray(content)) return []

  return content
    .filter((item) => item.type === 'text')
    .map((item) => {
      const { text, styles = {} } = item as { text: string; styles?: Record<string, unknown> }

      const node = new Y.XmlText()
      const attrs: Record<string, true> = {}
      if (styles.bold) attrs.bold = true
      if (styles.italic) attrs.italic = true
      if (styles.code) attrs.code = true
      if (styles.underline) attrs.underline = true
      if (styles.strike) attrs.strike = true
      node.insert(0, text, Object.keys(attrs).length ? attrs : undefined)
      return node
    })
}

function isTableContent(content: unknown): content is TableContent {
  return (
    content != null &&
    typeof content === 'object' &&
    'type' in content &&
    (content as { type: string }).type === 'tableContent'
  )
}

function tableContentToYXml(blockEl: Y.XmlElement, tableContent: TableContent): void {
  for (const row of tableContent.rows) {
    const rowEl = new Y.XmlElement('tableRow')

    for (const cell of row.cells) {
      const cellEl = new Y.XmlElement('tableCell')

      // Cell can be InlineContent[] directly or { props, content } object
      let inlineContent: InlineContent
      if (Array.isArray(cell)) {
        inlineContent = cell
      } else if (cell && typeof cell === 'object' && 'content' in cell) {
        inlineContent = cell.content

        // Copy cell props (backgroundColor, textColor, colspan, etc.)
        if (cell.props) {
          for (const [k, v] of Object.entries(cell.props)) {
            if (v != null && v !== 'default' && v !== 'left' && v !== 1) {
              cellEl.setAttribute(k, String(v))
            }
          }
        }
      } else {
        inlineContent = []
      }

      const paraEl = new Y.XmlElement('tableParagraph')
      const texts = inlineContentToYXml(inlineContent)
      if (texts.length) paraEl.insert(0, texts)
      cellEl.insert(0, [paraEl])
      rowEl.insert(rowEl.length, [cellEl])
    }

    blockEl.insert(blockEl.length, [rowEl])
  }
}

function blockToYXml(block: Block): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer')
  container.setAttribute('id', crypto.randomUUID())

  const blockEl = new Y.XmlElement(block.type)

  // Copy props as attributes
  for (const [k, v] of Object.entries(block.props ?? {})) {
    if (v != null) blockEl.setAttribute(k, String(v))
  }

  // Handle content based on type
  if (isTableContent(block.content)) {
    tableContentToYXml(blockEl, block.content)
  } else if (Array.isArray(block.content)) {
    const nodes = inlineContentToYXml(block.content)
    if (nodes.length) blockEl.insert(0, nodes)
  }

  container.insert(0, [blockEl])

  // Nested children (list items, etc.)
  if (block.children?.length) {
    const childGroup = new Y.XmlElement('blockGroup')
    block.children.forEach((child) => childGroup.insert(childGroup.length, [blockToYXml(child)]))
    container.insert(container.length, [childGroup])
  }

  return container
}

function createDividerYXml(): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer')
  container.setAttribute('id', crypto.randomUUID())
  container.insert(0, [new Y.XmlElement('divider')])
  return container
}

function isBlockGroupEmpty(blockGroup: Y.XmlElement): boolean {
  for (let i = 0; i < blockGroup.length; i++) {
    const container = blockGroup.get(i) as Y.XmlElement
    const block = container?.get(0) as Y.XmlElement | undefined
    const firstChild = block?.get(0)
    if (firstChild?.toString().length) return false
  }
  return true
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSnippets() {
  const context = useContext(WorkspaceContext)
  const store = context?.store
  const yDoc = context?.yDoc
  const activeCanvasId = context?.activeCanvasId
  const workspaceUndoController = context?.workspaceUndoController
  const { user } = useAuthState()
  const auditActor = createUserAuditActor(user?.id)

  const saveSnippet = useCallback(
    (input: SnippetInput, source?: string) => {
      if (!store?.root || !yDoc || !workspaceUndoController) return

      // Validate
      const isEmpty =
        (input.type === 'text' && !input.text.trim()) ||
        (input.type === 'html' && !input.html.trim()) ||
        (input.type === 'blocks' && !input.blocks.length)

      if (isEmpty) {
        showToast('No content selected', 'error')
        return
      }

      const root = store.root

      // Resolve target canvas — prefer active canvas, fall back to root
      const targetCanvas: CanvasItem =
        activeCanvasId && activeCanvasId !== 'root' ? (findCanvasById(root, activeCanvasId) ?? root) : root

      // Find or create Snippets node in the target canvas
      let snippetsNodeId = targetCanvas.items.find(
        (i) => i.kind === 'node' && i.xynode.type === 'blockNote' && i.name === SNIPPETS_NODE_NAME
      )?.id

      // Convert to blocks
      const blocks: Block[] =
        input.type === 'blocks'
          ? input.blocks
          : input.type === 'html'
            ? getParserEditor().tryParseHTMLToBlocks(input.html)
            : input.text.split('\n').map((line) => createTextBlock(line))

      // Insert
      const label = source ? `[${source} · ${formatShortDateTime()}]` : `[${formatShortDateTime()}]`

      workspaceUndoController.runCommand(() => {
        if (!snippetsNodeId) {
          snippetsNodeId = crypto.randomUUID()
          const position = calculateItemPosition(
            targetCanvas.items.filter((i) => i.kind === 'node'),
            { direction: 'horizontal', defaultSize: NODE_LAYOUT.WIDTH }
          )
          const nowIso = new Date().toISOString()
          const snippetsNode: NodeItem = {
            id: snippetsNodeId,
            name: SNIPPETS_NODE_NAME,
            kind: 'node' as const,
            xynode: {
              id: snippetsNodeId,
              type: 'blockNote' as const,
              position,
              data: { documentName: SNIPPETS_NODE_NAME, static: true },
            },
          }
          appendNodeWithCreateAudit(targetCanvas, snippetsNode, auditActor, nowIso)
        }

        const targetNodeId = snippetsNodeId
        if (!targetNodeId) {
          throw new Error('Snippet note id could not be resolved')
        }

        let noteDoc: Y.Doc | null = null
        yDoc.transact(() => {
          noteDoc = createNoteDoc(yDoc, targetNodeId, 'blockNote')
        }, WORKSPACE_NOTE_COMMAND_ORIGIN)

        if (!noteDoc) {
          throw new Error(`Snippet note ${targetNodeId} could not be created`)
        }

        const fragment = findNoteBlockNoteFragment(noteDoc)
        if (!fragment) {
          throw new Error(`Snippet note ${targetNodeId} is missing block note content`)
        }

        let blockGroup: Y.XmlElement
        if (fragment.length === 0) {
          blockGroup = new Y.XmlElement('blockGroup')
          fragment.insert(0, [blockGroup])
        } else {
          blockGroup = fragment.get(0) as Y.XmlElement
        }

        if (blockGroup.length > 0 && !isBlockGroupEmpty(blockGroup)) {
          blockGroup.insert(blockGroup.length, [createDividerYXml()])
        }

        blockGroup.insert(blockGroup.length, [blockToYXml(createTextBlock(label, true))])
        blocks.forEach((block) => blockGroup.insert(blockGroup.length, [blockToYXml(block)]))
      })

      if (!snippetsNodeId) {
        throw new Error('Snippet note id was not created')
      }

      touchNodeAndOwnerCanvasAudit(root, snippetsNodeId, auditActor, new Date().toISOString())

      showToast('Clipped to document', 'success')
      return snippetsNodeId
    },
    [store, yDoc, activeCanvasId, workspaceUndoController, auditActor]
  )

  return { saveSnippet, activeCanvasId }
}

// ─── DOM selection helper ──────────────────────────────────────────────────

export function getSelectionHtml(container: HTMLElement): string | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null

  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null

  const div = document.createElement('div')
  div.appendChild(range.cloneContents())
  return div.innerHTML
}
