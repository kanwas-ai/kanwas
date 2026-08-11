import { describe, expect, it } from 'vitest'

import { classifyCanvasDataTransfer } from '@/lib/canvasExternalContent'

type MockTransferOptions = {
  blockNoteHtml?: string
  textPlain?: string
  textHtml?: string
  textUriList?: string
  files?: File[]
  itemFiles?: File[]
}

function createDataTransfer(options: MockTransferOptions = {}): DataTransfer {
  const data = new Map<string, string>()

  if (options.textPlain !== undefined) {
    data.set('text/plain', options.textPlain)
  }

  if (options.blockNoteHtml !== undefined) {
    data.set('blocknote/html', options.blockNoteHtml)
  }

  if (options.textHtml !== undefined) {
    data.set('text/html', options.textHtml)
  }

  if (options.textUriList !== undefined) {
    data.set('text/uri-list', options.textUriList)
  }

  const files = options.files ?? []
  const items = [
    ...files.map((file) => ({ kind: 'file' as const, type: file.type, getAsFile: () => file })),
    ...(options.itemFiles ?? []).map((file) => ({ kind: 'file' as const, type: file.type, getAsFile: () => file })),
    ...Array.from(data.entries()).map(([type, value]) => ({
      kind: 'string' as const,
      type,
      getAsFile: () => null,
      getAsString: (callback: (content: string) => void) => callback(value),
    })),
  ]

  return {
    files,
    items,
    getData: (type: string) => data.get(type) ?? '',
  } as DataTransfer
}

describe('classifyCanvasDataTransfer', () => {
  it('classifies a plain url as a link import', () => {
    const imports = classifyCanvasDataTransfer(createDataTransfer({ textPlain: 'https://example.com' }))

    expect(imports).toEqual([{ kind: 'link', url: 'https://example.com' }])
  })

  it('classifies multiple plain-text urls as multiple link imports', () => {
    const imports = classifyCanvasDataTransfer(
      createDataTransfer({
        textPlain: 'https://example.com\nhttps://openai.com',
      })
    )

    expect(imports).toEqual([
      { kind: 'link', url: 'https://example.com' },
      { kind: 'link', url: 'https://openai.com' },
    ])
  })

  it('uses text/uri-list links and ignores comment lines', () => {
    const imports = classifyCanvasDataTransfer(
      createDataTransfer({
        textUriList: '# copied from browser\nhttps://example.com\nhttps://openai.com',
      })
    )

    expect(imports).toEqual([
      { kind: 'link', url: 'https://example.com' },
      { kind: 'link', url: 'https://openai.com' },
    ])
  })

  it('prefers BlockNote HTML over fallback html, plain text, and single-link extraction', () => {
    const blockNoteHtml =
      '<p><span data-inline-content-type="workspaceInterlink" data-href="/workspace/brain.md" data-canonical-path="brain.md" data-label="brain"></span></p>'
    const imports = classifyCanvasDataTransfer(
      createDataTransfer({
        blockNoteHtml,
        textHtml: '<a href="https://example.com">https://example.com</a>',
        textPlain: 'https://example.com',
        textUriList: 'https://example.com',
      })
    )

    expect(imports).toEqual([
      { kind: 'blockNote', format: 'html', content: blockNoteHtml, source: 'blocknoteClipboard' },
    ])
  })

  it('classifies a clipboard with only internal BlockNote HTML as a strict BlockNote import', () => {
    const blockNoteHtml = '<p data-pm-slice="1 1 []">Internal BlockNote content</p>'
    const imports = classifyCanvasDataTransfer(createDataTransfer({ blockNoteHtml }))

    expect(imports).toEqual([
      { kind: 'blockNote', format: 'html', content: blockNoteHtml, source: 'blocknoteClipboard' },
    ])
  })

  it('converts clean semantic html to markdown blocknote content', () => {
    const imports = classifyCanvasDataTransfer(
      createDataTransfer({
        textHtml: '<p>Hello <strong>world</strong></p><ul><li>One</li></ul>',
      })
    )

    expect(imports).toHaveLength(1)
    expect(imports[0]).toMatchObject({ kind: 'blockNote', format: 'markdown' })
    expect(imports[0]).toMatchObject({ content: expect.stringContaining('Hello **world**') })
    expect(imports[0]).toMatchObject({ content: expect.stringContaining('- One') })
  })

  it('keeps messy google docs html as html blocknote content', () => {
    const html = '<meta charset="utf-8"><b id="docs-internal-guid-123">Doc</b>'
    const imports = classifyCanvasDataTransfer(createDataTransfer({ textHtml: html }))

    expect(imports).toEqual([{ kind: 'blockNote', format: 'html', content: html }])
  })

  it('classifies markdown-looking text as markdown blocknote content', () => {
    const imports = classifyCanvasDataTransfer(createDataTransfer({ textPlain: '# Heading\n- item' }))

    expect(imports).toEqual([{ kind: 'blockNote', format: 'markdown', content: '# Heading\n- item' }])
  })

  it('classifies plain text as text blocknote content', () => {
    const imports = classifyCanvasDataTransfer(createDataTransfer({ textPlain: 'plain pasted text' }))

    expect(imports).toEqual([{ kind: 'blockNote', format: 'text', content: 'plain pasted text' }])
  })

  it('classifies image, audio, and supported file uploads', () => {
    const image = new File(['img'], 'photo.png', { type: 'image/png' })
    const audio = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' })
    const file = new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })

    expect(classifyCanvasDataTransfer(createDataTransfer({ files: [image] }))).toEqual([{ kind: 'image', file: image }])
    expect(classifyCanvasDataTransfer(createDataTransfer({ files: [audio] }))).toEqual([{ kind: 'audio', file: audio }])
    expect(classifyCanvasDataTransfer(createDataTransfer({ files: [file] }))).toEqual([{ kind: 'file', file }])
  })

  it('ignores unsupported files', () => {
    const file = new File(['bin'], 'archive.bin', { type: 'application/octet-stream' })

    expect(classifyCanvasDataTransfer(createDataTransfer({ files: [file] }))).toEqual([])
  })

  it('prefers file imports over textual clipboard content', () => {
    const image = new File(['img'], 'photo.png', { type: 'image/png' })
    const imports = classifyCanvasDataTransfer(
      createDataTransfer({
        files: [image],
        blockNoteHtml: '<p>BlockNote content</p>',
        textPlain: 'https://example.com',
      })
    )

    expect(imports).toEqual([{ kind: 'image', file: image }])
  })

  it('extracts files from dataTransfer items when files is empty', () => {
    const audio = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' })

    expect(classifyCanvasDataTransfer(createDataTransfer({ itemFiles: [audio] }))).toEqual([
      { kind: 'audio', file: audio },
    ])
  })
})
