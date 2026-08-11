/**
 * Paste handling utilities for BlockNote editor.
 *
 * Handles different paste sources:
 * - BlockNote HTML → BlockNote native
 * - Semantic HTML (web content, chat UIs) → Turndown → markdown
 * - Messy HTML (Google Docs, Sheets, MS Office) → BlockNote native
 * - Markdown syntax in plain text → BlockNote internal HTML paste
 * - Plain text → default with hardBreak deduplication
 */

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { Fragment, Slice, Node as ProseMirrorNode } from 'prosemirror-model'
import { importedBlocksToFullHtml, parseImportedContentToBlocks, type ImportedBlocks } from '@/lib/blocknote-import'

export const BLOCKNOTE_HTML_MIME = 'blocknote/html'

type DataTransferLike = {
  getData: (type: string) => string
  types?: readonly string[] | DOMStringList
}

function hasDataTransferType(dataTransfer: DataTransferLike, type: string): boolean {
  return dataTransfer.types ? Array.from(dataTransfer.types).includes(type) : false
}

export function getBlockNoteClipboardHtml(dataTransfer: DataTransferLike | null | undefined): string {
  if (!dataTransfer) {
    return ''
  }

  if (dataTransfer.types && !hasDataTransferType(dataTransfer, BLOCKNOTE_HTML_MIME)) {
    return ''
  }

  const html = dataTransfer.getData(BLOCKNOTE_HTML_MIME)
  return html.trim() ? html : ''
}

// ============================================================================
// Turndown Configuration
// ============================================================================

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.use(gfm)

// Override default <br> handling (which adds trailing spaces).
// This ensures <br><br> produces a clean paragraph break (\n\n).
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '\n\n',
})

// Override list items to use single space after marker (e.g. "- item" not "-   item").
// Matches BlockNote's markdown format.
turndown.addRule('listItem', {
  filter: 'li',
  replacement: (content, node) => {
    const trimmed = content.replace(/^\n+/, '').replace(/\n+$/, '\n')
    const parent = node.parentNode as HTMLElement
    const isOrdered = parent?.nodeName === 'OL'
    const index = Array.from(parent?.children || []).indexOf(node as Element)
    const prefix = isOrdered ? `${index + 1}. ` : '- '
    // Indent continuation lines by prefix width
    const indent = ' '.repeat(prefix.length)
    const lines = trimmed.replace(/\n(?!\n)/g, `\n${indent}`)
    return prefix + lines
  },
})

// Slack uses styled spans with this attribute for paragraph separation
const SLACK_PARAGRAPH_BREAK = 'data-stringify-type="paragraph-break"'

// ============================================================================
// HTML Pre-processing
// ============================================================================

/**
 * Pre-process HTML before Turndown conversion.
 * Handles app-specific elements that Turndown can't interpret.
 */
function preprocessHtml(html: string): string {
  // Slack's paragraph-break spans are empty with display:block, which Turndown ignores.
  // Replace them with <br> so Turndown creates paragraph breaks.
  return html.replace(new RegExp(`<span[^>]*${SLACK_PARAGRAPH_BREAK}[^>]*></span>`, 'g'), '<br>')
}

// ============================================================================
// HTML Source Detection
// ============================================================================

/**
 * Check if HTML contains semantic elements that Turndown can convert well.
 * Also matches Slack's paragraph-break spans (handled by preprocessHtml).
 */
export function hasSemanticHtml(html: string): boolean {
  return /<(p|br|h[1-6]|ul|ol|li|blockquote|pre|table)\b/i.test(html) || html.includes(SLACK_PARAGRAPH_BREAK)
}

/**
 * Check if HTML is from a source with messy/non-standard HTML that
 * Turndown can't handle properly. These should use BlockNote's native handling.
 */
export function isMessyHtmlSource(html: string): boolean {
  return (
    html.includes('docs-internal-guid') || // Google Docs
    html.includes('google-sheets-html-origin') || // Google Sheets
    html.includes('data-sheets-') || // Google Sheets (alt marker)
    html.includes('urn:schemas-microsoft-com') || // Microsoft Word/Excel
    /\bmso-/.test(html) // Microsoft Office styles (mso-width, mso-font, etc.)
  )
}

/**
 * Check if plain text contains markdown syntax that should be parsed.
 */
export function hasMarkdownSyntax(text: string): boolean {
  // Matches: # headings, - * + lists, 1. numbered lists, ``` code blocks, > quotes, | tables, [links](url)
  return /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^```|^\s*>|^\|.+\||!?\[[^\]]+\]\([^)]+\)/m.test(text)
}

// ============================================================================
// HTML Conversion
// ============================================================================

/**
 * Convert HTML to markdown using Turndown.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(preprocessHtml(html))
}

// ============================================================================
// HardBreak Deduplication
// ============================================================================

/**
 * Remove consecutive hardBreaks from a ProseMirror fragment.
 * BlockNote creates double hardBreaks for each newline, causing extra spacing.
 */
export function dedupeHardBreaks(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = []
  let lastWasHardBreak = false

  fragment.forEach((node: ProseMirrorNode) => {
    if (node.type.name === 'hardBreak') {
      if (!lastWasHardBreak) {
        nodes.push(node)
        lastWasHardBreak = true
      }
      // Skip consecutive hardBreaks
    } else if (node.isText) {
      nodes.push(node)
      lastWasHardBreak = false
    } else {
      // Recursively process child content
      const newContent = node.content.size > 0 ? dedupeHardBreaks(node.content) : node.content
      nodes.push(node.copy(newContent))
      lastWasHardBreak = false
    }
  })

  return Fragment.fromArray(nodes)
}

/**
 * Process a paste slice to remove consecutive hardBreaks.
 * Returns true if the paste was handled, false otherwise.
 *
 * @param view - ProseMirror EditorView (typed as any to avoid version conflicts)
 * @param slice - The paste slice to process
 */
export function handlePasteWithHardBreakDedupe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  view: any,
  event: ClipboardEvent,
  slice: Slice | null
): boolean {
  const clipboardData = event.clipboardData
  const plainText = clipboardData?.getData('text/plain') ?? ''
  if (
    !clipboardData ||
    getBlockNoteClipboardHtml(clipboardData) ||
    hasDataTransferType(clipboardData, 'text/html') ||
    hasDataTransferType(clipboardData, 'text/markdown') ||
    hasDataTransferType(clipboardData, 'Files') ||
    hasMarkdownSyntax(plainText)
  ) {
    return false
  }

  if (slice && slice.content.size > 0) {
    const newContent = dedupeHardBreaks(slice.content)
    const newSlice = new Slice(newContent, slice.openStart, slice.openEnd)

    const tr = view.state.tr.replaceSelection(newSlice)
    view.dispatch(tr)
    return true
  }

  return false
}

// ============================================================================
// BlockNote Paste Handler
// ============================================================================

type PasteHandlerContext = {
  event: ClipboardEvent
  editor: {
    pasteMarkdown: (markdown: string) => void
    pasteHTML: (html: string, raw?: boolean) => void
  }
  defaultPasteHandler: (context?: {
    prioritizeMarkdownOverHTML?: boolean
    plainTextAsMarkdown?: boolean
  }) => boolean | undefined
}

function pasteImportedBlocks(editor: PasteHandlerContext['editor'], blocks: ImportedBlocks): boolean {
  const html = importedBlocksToFullHtml(blocks)
  if (!html) {
    return false
  }

  editor.pasteHTML(html, true)
  return true
}

/**
 * Custom paste handler for BlockNote editor.
 *
 * Handles three cases:
 * 1. Semantic HTML (not from messy sources) → convert via Turndown
 * 2. Plain text with markdown syntax → parse as markdown
 * 3. Everything else → use default handler
 */
export function createPasteHandler() {
  return ({ event, editor, defaultPasteHandler }: PasteHandlerContext): boolean | undefined => {
    if (getBlockNoteClipboardHtml(event.clipboardData)) {
      return defaultPasteHandler()
    }

    const text = event.clipboardData?.getData('text/plain') || ''
    const html = event.clipboardData?.getData('text/html') || ''

    // Case 1: Semantic HTML from clean sources → convert via Turndown
    if (html && hasSemanticHtml(html) && !isMessyHtmlSource(html)) {
      try {
        const markdown = htmlToMarkdown(html)
        return pasteImportedBlocks(editor, parseImportedContentToBlocks(markdown, 'markdown'))
      } catch {
        // Fall through to default
      }
    }

    // Case 2: Plain text with markdown syntax → parse as markdown
    if (text && hasMarkdownSyntax(text) && text.trim()) {
      try {
        return pasteImportedBlocks(editor, parseImportedContentToBlocks(text, 'markdown'))
      } catch {
        // Fall through to default
      }
    }

    // Case 3: Everything else → default handler (will be processed by handlePaste)
    return defaultPasteHandler()
  }
}
