import {
  getBlockNoteClipboardHtml,
  hasMarkdownSyntax,
  hasSemanticHtml,
  htmlToMarkdown,
  isMessyHtmlSource,
} from '@/lib/paste-utils'
import { isSafeExternalUrl } from '@/lib/embeds'
import { SUPPORTED_FILE_EXTENSIONS, isAudioExtension, type SupportedFileExtension } from 'shared/constants'

export type CanvasBlockNoteImport = {
  kind: 'blockNote'
  format: 'text' | 'markdown' | 'html'
  content: string
  source?: 'blocknoteClipboard'
}

export type CanvasNodeImport =
  | { kind: 'image'; file: File }
  | { kind: 'audio'; file: File }
  | { kind: 'file'; file: File }
  | { kind: 'link'; url: string }
  | CanvasBlockNoteImport

function extractFiles(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files)
  if (files.length > 0) {
    return files
  }

  const extractedFiles: File[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') {
      continue
    }

    const file = item.getAsFile()
    if (file) {
      extractedFiles.push(file)
    }
  }

  return extractedFiles
}

function classifyFiles(files: File[]): CanvasNodeImport[] {
  const imports: CanvasNodeImport[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (file.type.startsWith('image/')) {
      imports.push({ kind: 'image', file })
      continue
    }

    if (file.type.startsWith('audio/') || (ext && isAudioExtension(ext))) {
      imports.push({ kind: 'audio', file })
      continue
    }

    if (ext && SUPPORTED_FILE_EXTENSIONS.includes(ext as SupportedFileExtension)) {
      imports.push({ kind: 'file', file })
    }
  }

  return imports
}

function extractUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => isSafeExternalUrl(value))
}

function extractSingleHtmlLink(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = Array.from(doc.body.querySelectorAll('a[href]'))
  if (links.length !== 1) {
    return null
  }

  const link = links[0]
  const href = link.getAttribute('href')?.trim()
  if (!href || !isSafeExternalUrl(href)) {
    return null
  }

  const bodyText = doc.body.textContent?.trim() ?? ''
  const linkText = link.textContent?.trim() ?? ''
  if (!bodyText || (bodyText !== linkText && bodyText !== href)) {
    return null
  }

  return href
}

function classifyTextualContent(dataTransfer: DataTransfer): CanvasNodeImport[] {
  const blockNoteHtml = getBlockNoteClipboardHtml(dataTransfer)
  if (blockNoteHtml) {
    return [{ kind: 'blockNote', format: 'html', content: blockNoteHtml, source: 'blocknoteClipboard' }]
  }

  const uriList = dataTransfer.getData('text/uri-list')
  const html = dataTransfer.getData('text/html')
  const text = dataTransfer.getData('text/plain').trim()

  const uriUrls = extractUrls(uriList).filter((value) => !value.startsWith('#'))
  if (uriUrls.length > 0) {
    return uriUrls.map((url) => ({ kind: 'link', url }))
  }

  const htmlLink = html.trim() ? extractSingleHtmlLink(html) : null
  if (htmlLink) {
    return [{ kind: 'link', url: htmlLink }]
  }

  if ((!html || !html.trim()) && text) {
    const normalizedText = text.replace(/\r\n?/g, '\n')
    const textUrls = extractUrls(text)
    if (textUrls.length > 0 && textUrls.join('\n') === normalizedText) {
      return textUrls.map((url) => ({ kind: 'link', url }))
    }
  }

  if (html.trim()) {
    if (hasSemanticHtml(html) && !isMessyHtmlSource(html)) {
      try {
        const markdown = htmlToMarkdown(html).trim()
        if (markdown) {
          return [{ kind: 'blockNote', format: 'markdown', content: markdown }]
        }
      } catch {
        // Fall through to HTML import.
      }
    }

    return [{ kind: 'blockNote', format: 'html', content: html }]
  }

  if (!text) {
    return []
  }

  return [
    {
      kind: 'blockNote',
      format: hasMarkdownSyntax(text) ? 'markdown' : 'text',
      content: text,
    },
  ]
}

export function classifyCanvasDataTransfer(dataTransfer: DataTransfer): CanvasNodeImport[] {
  const fileImports = classifyFiles(extractFiles(dataTransfer))
  if (fileImports.length > 0) {
    return fileImports
  }

  return classifyTextualContent(dataTransfer)
}

export function isEditingTextInput(): boolean {
  const activeElement = document.activeElement
  return !!(
    activeElement?.closest('.blocknote-editor') ||
    activeElement?.closest('[contenteditable="true"]') ||
    activeElement?.tagName === 'INPUT' ||
    activeElement?.tagName === 'TEXTAREA'
  )
}

export function offsetCanvasImportPosition(
  position: { x: number; y: number },
  index: number
): { x: number; y: number } {
  const offset = index * 32
  return {
    x: position.x + offset,
    y: position.y + offset,
  }
}
