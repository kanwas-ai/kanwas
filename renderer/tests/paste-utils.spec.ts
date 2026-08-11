import { describe, it, expect, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import {
  BLOCKNOTE_HTML_MIME,
  createPasteHandler,
  hasSemanticHtml,
  isMessyHtmlSource,
  hasMarkdownSyntax,
  htmlToMarkdown,
  dedupeHardBreaks,
  getBlockNoteClipboardHtml,
} from '@/lib/paste-utils'

// Minimal ProseMirror schema for testing dedupeHardBreaks
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true, toDOM: () => ['br'] },
  },
})

function createClipboardData(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
  } as DataTransfer
}

function createPasteEvent(data: Record<string, string>): ClipboardEvent {
  return {
    clipboardData: createClipboardData(data),
  } as ClipboardEvent
}

function createPasteHandlerHarness() {
  return {
    editor: {
      pasteMarkdown: vi.fn(),
      pasteHTML: vi.fn(),
    },
    defaultPasteHandler: vi.fn(() => true),
  }
}

describe('hasSemanticHtml', () => {
  it('matches headings', () => {
    expect(hasSemanticHtml('<h1>Title</h1>')).toBe(true)
    expect(hasSemanticHtml('<h3>Subtitle</h3>')).toBe(true)
    expect(hasSemanticHtml('<H2>Upper</H2>')).toBe(true)
  })

  it('matches lists', () => {
    expect(hasSemanticHtml('<ul><li>item</li></ul>')).toBe(true)
    expect(hasSemanticHtml('<ol><li>item</li></ol>')).toBe(true)
    expect(hasSemanticHtml('<li>item</li>')).toBe(true)
  })

  it('matches blockquote, pre, table', () => {
    expect(hasSemanticHtml('<blockquote>quote</blockquote>')).toBe(true)
    expect(hasSemanticHtml('<pre>code</pre>')).toBe(true)
    expect(hasSemanticHtml('<table><tr><td>cell</td></tr></table>')).toBe(true)
  })

  it('matches paragraph tags', () => {
    expect(hasSemanticHtml('<p>text</p>')).toBe(true)
  })

  it('matches br tags', () => {
    expect(hasSemanticHtml('text<br>more text')).toBe(true)
    expect(hasSemanticHtml('text<br/>more')).toBe(true)
  })

  it('matches Slack paragraph-break spans', () => {
    const slackHtml =
      '<b data-stringify-type="bold">text</b><span data-stringify-type="paragraph-break"></span><span>more</span>'
    expect(hasSemanticHtml(slackHtml)).toBe(true)
  })

  it('does not match plain inline elements', () => {
    expect(hasSemanticHtml('<span>text</span>')).toBe(false)
    expect(hasSemanticHtml('<b>bold</b>')).toBe(false)
    expect(hasSemanticHtml('<em>italic</em>')).toBe(false)
    expect(hasSemanticHtml('<a href="#">link</a>')).toBe(false)
  })

  it('does not match empty string', () => {
    expect(hasSemanticHtml('')).toBe(false)
  })
})

describe('isMessyHtmlSource', () => {
  it('detects Google Docs', () => {
    expect(isMessyHtmlSource('<b id="docs-internal-guid-abc123">text</b>')).toBe(true)
  })

  it('detects Google Sheets', () => {
    expect(isMessyHtmlSource('<table google-sheets-html-origin>')).toBe(true)
    expect(isMessyHtmlSource('<td data-sheets-value="123">')).toBe(true)
  })

  it('detects Microsoft Office', () => {
    expect(isMessyHtmlSource('<html xmlns:o="urn:schemas-microsoft-com:office:office">')).toBe(true)
    expect(isMessyHtmlSource('<td style="mso-number-format:General">')).toBe(true)
    expect(isMessyHtmlSource('<p style="mso-font-size:12pt">')).toBe(true)
  })

  it('does not match clean HTML', () => {
    expect(isMessyHtmlSource('<h1>Title</h1><p>text</p>')).toBe(false)
    expect(isMessyHtmlSource('<ul><li>item</li></ul>')).toBe(false)
  })

  it('does not match Slack HTML', () => {
    expect(isMessyHtmlSource('<b data-stringify-type="bold">text</b>')).toBe(false)
  })
})

describe('hasMarkdownSyntax', () => {
  it('detects headings', () => {
    expect(hasMarkdownSyntax('# Heading')).toBe(true)
    expect(hasMarkdownSyntax('## Sub')).toBe(true)
    expect(hasMarkdownSyntax('###### Deep')).toBe(true)
  })

  it('detects unordered lists', () => {
    expect(hasMarkdownSyntax('- item')).toBe(true)
    expect(hasMarkdownSyntax('* item')).toBe(true)
    expect(hasMarkdownSyntax('+ item')).toBe(true)
    expect(hasMarkdownSyntax('  - nested')).toBe(true)
  })

  it('detects ordered lists', () => {
    expect(hasMarkdownSyntax('1. first')).toBe(true)
    expect(hasMarkdownSyntax('  2. indented')).toBe(true)
  })

  it('detects code blocks', () => {
    expect(hasMarkdownSyntax('```\ncode\n```')).toBe(true)
    expect(hasMarkdownSyntax('```js\ncode\n```')).toBe(true)
  })

  it('detects blockquotes', () => {
    expect(hasMarkdownSyntax('> quote')).toBe(true)
    expect(hasMarkdownSyntax('  > indented quote')).toBe(true)
  })

  it('detects tables', () => {
    expect(hasMarkdownSyntax('| col1 | col2 |')).toBe(true)
  })

  it('detects markdown links', () => {
    expect(hasMarkdownSyntax('See [brain](/workspace/brain.md)')).toBe(true)
  })

  it('does not match plain text', () => {
    expect(hasMarkdownSyntax('Just some plain text')).toBe(false)
    expect(hasMarkdownSyntax('Hello world\nAnother line')).toBe(false)
  })

  it('does not match partial patterns', () => {
    expect(hasMarkdownSyntax('#no space after hash')).toBe(false)
    expect(hasMarkdownSyntax('1.no space')).toBe(false)
    expect(hasMarkdownSyntax('-no space')).toBe(false)
  })
})

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title')
    expect(htmlToMarkdown('<h2>Sub</h2>')).toBe('## Sub')
  })

  it('converts lists', () => {
    const html = '<ul><li>one</li><li>two</li></ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('- one')
    expect(md).toContain('- two')
  })

  it('converts bold and italic', () => {
    expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**')
    expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**')
    expect(htmlToMarkdown('<em>italic</em>')).toBe('_italic_')
  })

  it('converts code blocks', () => {
    const md = htmlToMarkdown('<pre><code>const x = 1</code></pre>')
    expect(md).toContain('```')
    expect(md).toContain('const x = 1')
  })

  it('converts blockquotes', () => {
    expect(htmlToMarkdown('<blockquote>quote</blockquote>')).toContain('> quote')
  })

  it('converts br to paragraph breaks', () => {
    const md = htmlToMarkdown('<p>line one<br>line two</p>')
    expect(md).toContain('line one')
    expect(md).toContain('line two')
    // br should produce double newline
    expect(md).toContain('\n\n')
  })

  describe('Slack HTML', () => {
    it('converts paragraph-break spans to paragraph breaks', () => {
      const slackHtml = `
        <b data-stringify-type="bold">Title</b>
        <span data-stringify-type="paragraph-break"></span>
        <span>Paragraph text here</span>
      `
      const md = htmlToMarkdown(slackHtml)
      expect(md).toContain('**Title**')
      expect(md).toContain('Paragraph text here')
      // Should have paragraph separation
      expect(md).toContain('\n\n')
    })

    it('preserves multiple paragraphs from Slack', () => {
      const slackHtml = `
        <b data-stringify-type="bold">Section One -</b>
        <span>First paragraph content.</span>
        <span data-stringify-type="paragraph-break"></span>
        <b data-stringify-type="bold">Section Two -</b>
        <span>Second paragraph content.</span>
      `
      const md = htmlToMarkdown(slackHtml)
      expect(md).toContain('**Section One -**')
      expect(md).toContain('First paragraph content.')
      expect(md).toContain('**Section Two -**')
      expect(md).toContain('Second paragraph content.')
      // Sections should be separated
      const sections = md.split('\n\n')
      expect(sections.length).toBeGreaterThanOrEqual(2)
    })

    it('handles realistic Slack HTML structure', () => {
      const slackHtml = `<meta charset='utf-8'><b data-stringify-type="bold" style="font-weight: 700;">The product is complex -</b><span style="display: inline !important;"> we dont have enough engineering time.</span><span aria-label="&nbsp;" class="c-mrkdwn__br" data-stringify-type="paragraph-break" style="display: block;"></span><b data-stringify-type="bold" style="font-weight: 700;">Dichotomy -</b><span style="display: inline !important;"> The future PMs are builders.</span>`
      const md = htmlToMarkdown(slackHtml)
      expect(md).toContain('**The product is complex -**')
      expect(md).toContain('we dont have enough engineering time.')
      expect(md).toContain('**Dichotomy -**')
      expect(md).toContain('The future PMs are builders.')
      // Should have paragraph break between sections
      expect(md.indexOf('engineering time.')).toBeLessThan(md.indexOf('**Dichotomy -**'))
      expect(md).toMatch(/engineering time\.\s*\n\n\s*\*\*Dichotomy/)
    })
  })

  describe('messy HTML sources are not processed (handled by caller)', () => {
    it('Google Docs HTML is detected by caller', () => {
      const gdocsHtml = '<b id="docs-internal-guid-abc"><span style="font-weight:normal;">text</span></b>'
      expect(isMessyHtmlSource(gdocsHtml)).toBe(true)
    })

    it('Google Sheets HTML is detected by caller', () => {
      const gsheetsHtml = '<table google-sheets-html-origin><tr><td>data</td></tr></table>'
      expect(isMessyHtmlSource(gsheetsHtml)).toBe(true)
    })

    it('MS Office HTML is detected by caller', () => {
      const msHtml = '<td style="mso-number-format:General">123</td>'
      expect(isMessyHtmlSource(msHtml)).toBe(true)
    })
  })
})

describe('getBlockNoteClipboardHtml', () => {
  it('returns BlockNote HTML only when the internal MIME type is present', () => {
    const html = '<p>Internal BlockNote HTML</p>'

    expect(getBlockNoteClipboardHtml(createClipboardData({ [BLOCKNOTE_HTML_MIME]: html }))).toBe(html)
    expect(getBlockNoteClipboardHtml(createClipboardData({ 'text/html': html }))).toBe('')
  })
})

describe('createPasteHandler', () => {
  it('delegates BlockNote HTML to the default handler', () => {
    const handler = createPasteHandler()
    const { editor, defaultPasteHandler } = createPasteHandlerHarness()

    const handled = handler({
      event: createPasteEvent({ [BLOCKNOTE_HTML_MIME]: '<p>Internal</p>', 'text/plain': 'Internal' }),
      editor,
      defaultPasteHandler,
    })

    expect(handled).toBe(true)
    expect(defaultPasteHandler).toHaveBeenCalledTimes(1)
    expect(editor.pasteHTML).not.toHaveBeenCalled()
  })

  it('keeps the semantic HTML Turndown path and converts workspace links before paste', () => {
    const handler = createPasteHandler()
    const { editor, defaultPasteHandler } = createPasteHandlerHarness()

    const handled = handler({
      event: createPasteEvent({ 'text/html': '<p>See <a href="/workspace/brain.md">brain</a></p>' }),
      editor,
      defaultPasteHandler,
    })

    expect(handled).toBe(true)
    expect(defaultPasteHandler).not.toHaveBeenCalled()
    expect(editor.pasteHTML).toHaveBeenCalledWith(
      expect.stringContaining('data-inline-content-type="workspaceInterlink"'),
      true
    )
  })

  it('converts markdown workspace links before paste', () => {
    const handler = createPasteHandler()
    const { editor, defaultPasteHandler } = createPasteHandlerHarness()

    const handled = handler({
      event: createPasteEvent({ 'text/plain': 'See [brain](/workspace/brain.md)' }),
      editor,
      defaultPasteHandler,
    })

    expect(handled).toBe(true)
    expect(defaultPasteHandler).not.toHaveBeenCalled()
    expect(editor.pasteHTML).toHaveBeenCalledWith(
      expect.stringContaining('data-inline-content-type="workspaceInterlink"'),
      true
    )
  })
})

describe('dedupeHardBreaks', () => {
  const text = (str: string) => schema.text(str)
  const hardBreak = () => schema.nodes.hardBreak.create()
  const paragraph = (...content: Parameters<typeof schema.nodes.paragraph.create>[1][]) =>
    schema.nodes.paragraph.create(null, content.flat())
  const fragment = (...nodes: ReturnType<typeof paragraph>[]) => schema.nodes.doc.create(null, nodes).content

  it('keeps single hardBreaks', () => {
    const para = paragraph([text('line one'), hardBreak(), text('line two')])
    const result = dedupeHardBreaks(para.content)
    const names = nodeNames(result)
    expect(names).toEqual(['text', 'hardBreak', 'text'])
  })

  it('removes consecutive hardBreaks', () => {
    const para = paragraph([text('line one'), hardBreak(), hardBreak(), text('line two')])
    const result = dedupeHardBreaks(para.content)
    const names = nodeNames(result)
    expect(names).toEqual(['text', 'hardBreak', 'text'])
  })

  it('removes triple hardBreaks', () => {
    const para = paragraph([text('a'), hardBreak(), hardBreak(), hardBreak(), text('b')])
    const result = dedupeHardBreaks(para.content)
    const names = nodeNames(result)
    expect(names).toEqual(['text', 'hardBreak', 'text'])
  })

  it('handles multiple groups of consecutive hardBreaks', () => {
    const para = paragraph([text('a'), hardBreak(), hardBreak(), text('b'), hardBreak(), hardBreak(), text('c')])
    const result = dedupeHardBreaks(para.content)
    const names = nodeNames(result)
    expect(names).toEqual(['text', 'hardBreak', 'text', 'hardBreak', 'text'])
  })

  it('handles fragment with no hardBreaks', () => {
    const para = paragraph([text('just text')])
    const result = dedupeHardBreaks(para.content)
    const names = nodeNames(result)
    expect(names).toEqual(['text'])
  })

  it('processes nested content recursively', () => {
    const para = paragraph([text('a'), hardBreak(), hardBreak(), text('b')])
    const frag = fragment(para)
    const result = dedupeHardBreaks(frag)
    const innerNames = nodeNames(result.child(0).content)
    expect(innerNames).toEqual(['text', 'hardBreak', 'text'])
  })
})

/** Helper: extract node type names from a fragment */
function nodeNames(fragment: ReturnType<typeof dedupeHardBreaks>): string[] {
  const names: string[] = []
  fragment.forEach((node) => names.push(node.type.name))
  return names
}
