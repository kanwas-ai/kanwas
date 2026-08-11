import { describe, expect, it } from 'vitest'
import { markdownToInterlinkedBlocks } from './blocknote-conversion.js'
import {
  collapseHardBreakRunsInBlocks,
  escapeInlineHtmlForImport,
  postProcessExportedMarkdown,
} from './markdown-fidelity.js'
import { createServerBlockNoteEditor } from './server-blocknote.js'

// ---------------------------------------------------------------------------
// escapeInlineHtmlForImport
// ---------------------------------------------------------------------------

describe('escapeInlineHtmlForImport', () => {
  it('escapes an angle-bracket token that reads as inline HTML', () => {
    expect(escapeInlineHtmlForImport('# /recall <query>')).toBe('# /recall \\<query>')
  })

  it('is idempotent: escaping already-escaped input adds no extra backslash', () => {
    const once = escapeInlineHtmlForImport('thinking/<topic>/<date>')
    const twice = escapeInlineHtmlForImport(once)
    expect(twice).toBe(once)
  })

  it('leaves a fenced code block untouched, even when it contains angle-bracket tokens', () => {
    const md = ['```text', '<topic>keep me literal</topic>', '```'].join('\n')
    expect(escapeInlineHtmlForImport(md)).toBe(md)
  })

  it('leaves an inline code span untouched', () => {
    const md = 'Use the `<topic>` placeholder in prose.'
    expect(escapeInlineHtmlForImport(md)).toBe(md)
  })

  it('does not escape a `<` that is not followed by a tag-like character', () => {
    const md = '5 < 10 and 10 > 5'
    expect(escapeInlineHtmlForImport(md)).toBe(md)
  })

  it('escapes text outside a code span on the same line as one', () => {
    const md = 'See `code <ok>` then <topic> outside.'
    expect(escapeInlineHtmlForImport(md)).toBe('See `code <ok>` then \\<topic> outside.')
  })

  it('leaves URI and email autolinks intact — they are link syntax, not droppable HTML', () => {
    const md = 'See <https://example.com/a?b=1> and <mailto:hi@example.com> and <hi@example.com>, but <topic> escapes.'
    expect(escapeInlineHtmlForImport(md)).toBe(
      'See <https://example.com/a?b=1> and <mailto:hi@example.com> and <hi@example.com>, but \\<topic> escapes.'
    )
  })
})

// ---------------------------------------------------------------------------
// collapseHardBreakRunsInBlocks
// ---------------------------------------------------------------------------

function textNode(text: string): { type: string; text: string; styles: Record<string, never> } {
  return { type: 'text', text, styles: {} }
}

describe('collapseHardBreakRunsInBlocks', () => {
  it('collapses a doubled hard break (two \\n) back down to one', () => {
    const blocks = [{ id: '1', type: 'paragraph', content: [textNode('line one\n\nline two')] }]
    const result = collapseHardBreakRunsInBlocks(blocks) as Array<{ content: Array<{ text: string }> }>
    expect(result[0].content[0].text).toBe('line one\nline two')
  })

  it('leaves a single hard break untouched', () => {
    const blocks = [{ id: '1', type: 'paragraph', content: [textNode('line one\nline two')] }]
    const result = collapseHardBreakRunsInBlocks(blocks) as Array<{ content: Array<{ text: string }> }>
    expect(result[0].content[0].text).toBe('line one\nline two')
  })

  it('skips codeBlock-type blocks entirely, preserving their newlines', () => {
    const codeText = 'line one\n\n\nline two'
    const blocks = [{ id: '1', type: 'codeBlock', content: [textNode(codeText)] }]
    const result = collapseHardBreakRunsInBlocks(blocks) as Array<{ content: Array<{ text: string }> }>
    expect(result[0].content[0].text).toBe(codeText)
  })

  it('recurses into nested children', () => {
    const blocks = [
      {
        id: '1',
        type: 'blockquote',
        content: [],
        children: [{ id: '2', type: 'paragraph', content: [textNode('nested\n\n\ntext')] }],
      },
    ]
    const result = collapseHardBreakRunsInBlocks(blocks) as Array<{
      children: Array<{ content: Array<{ text: string }> }>
    }>
    expect(result[0].children[0].content[0].text).toBe('nested\ntext')
  })

  it('returns the same array reference when nothing changes', () => {
    const blocks = [{ id: '1', type: 'paragraph', content: [textNode('unchanged')] }]
    expect(collapseHardBreakRunsInBlocks(blocks)).toBe(blocks)
  })
})

// ---------------------------------------------------------------------------
// postProcessExportedMarkdown
// ---------------------------------------------------------------------------

describe('postProcessExportedMarkdown', () => {
  it('normalizes * and + bullets to -, preserving indentation', () => {
    const md = ['* first', '+ second', '  * nested'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(['- first', '- second', '  - nested', ''].join('\n'))
  })

  it('does not touch ordered list markers', () => {
    const md = ['1. first', '2. second'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(['1. first', '2. second', ''].join('\n'))
  })

  it('normalizes ***, ___, and "* * *" thematic breaks to ---', () => {
    for (const rule of ['***', '___', '* * *']) {
      expect(postProcessExportedMarkdown(rule)).toBe('---\n')
    }
  })

  it('deletes stray hard-break-only lines', () => {
    const md = ['line one', '\\', 'line two'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(['line one', 'line two', ''].join('\n'))
  })

  it('keeps a `\\\\` escaped-backslash paragraph — only the single-`\\` break artifact is deleted', () => {
    const md = ['line one', '', '\\\\', '', 'line two'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(`${md}\n`)
  })

  it('collapses runs of 3+ blank lines to one but leaves shorter runs alone', () => {
    const md = ['a', '', '', '', 'b', '', '', 'c'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(['a', '', 'b', '', '', 'c', ''].join('\n'))
  })

  it('strips trailing blank lines and ensures exactly one trailing newline', () => {
    expect(postProcessExportedMarkdown('a\n\n\n\n')).toBe('a\n')
    expect(postProcessExportedMarkdown('a')).toBe('a\n')
  })

  it('leaves fenced code block bytes untouched, including bullet-like markers and blank runs', () => {
    const fenceBody = ['* not a bullet', '', '', '', '\\', 'trailing space kept   '].join('\n')
    const md = ['```text', fenceBody, '```'].join('\n')
    expect(postProcessExportedMarkdown(md)).toBe(`${md}\n`)
  })

  it('is idempotent', () => {
    const md = ['* item', '', '', '', '\\', '___', 'trailing'].join('\n')
    const once = postProcessExportedMarkdown(md)
    const twice = postProcessExportedMarkdown(once)
    expect(twice).toBe(once)
  })
})

// ---------------------------------------------------------------------------
// Round-trip property tests against the real BlockNote editor
// ---------------------------------------------------------------------------

const FIXTURES: Record<string, string> = {
  recallHeading: ['# /recall <query>', '', 'Explains how the recall command accepts <query> as input.', ''].join('\n'),
  topicDateProse: ['Notes for a session live under thinking/<topic>/<date> so recall can find them later.', ''].join(
    '\n'
  ),
  softWrappedParagraph: [
    'This is a soft-wrapped paragraph that continues',
    'on the next line without any blank line',
    'separating the two, exactly like natural prose wrapping.',
    '',
  ].join('\n'),
  trailingBackslashHardBreak: ['line one\\', 'line two', ''].join('\n'),
  dashBullets: ['- first item', '- second item', '- third item', ''].join('\n'),
  thematicBreak: ['Above the rule.', '', '---', '', 'Below the rule.', ''].join('\n'),
  table: ['| Name | Value |', '| --- | --- |', '| a | 1 |', '| b | 2 |', ''].join('\n'),
  nestedLists: ['- parent one', '  - child one', '  - child two', '- parent two', ''].join('\n'),
  fencedCodeWithTagsAndBacktickLines: [
    '```text',
    '<topic>keep me literal</topic>',
    '`-not a bullet, just code with a leading backtick',
    'line one\\',
    '```',
    '',
  ].join('\n'),
  kitchenSink: [
    '# /recall <query>',
    '',
    'Notes for a session live under thinking/<topic>/<date>. This paragraph is',
    'soft-wrapped across a couple of lines to make sure ordinary wrapping is',
    'left alone.',
    '',
    'line one\\',
    'line two',
    '',
    '- first item',
    '  - nested child',
    '- second item',
    '',
    '---',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| a | 1 |',
    '',
    '```text',
    '<topic>keep me literal</topic>',
    '`-not a bullet, just code',
    '```',
    '',
  ].join('\n'),
}

async function parse(editor: ReturnType<typeof createServerBlockNoteEditor>, markdown: string) {
  return markdownToInterlinkedBlocks(editor, markdown)
}

async function canonical(editor: ReturnType<typeof createServerBlockNoteEditor>, markdown: string): Promise<string> {
  const blocks = await parse(editor, markdown)
  const raw = await editor.blocksToMarkdownLossy(blocks)
  return postProcessExportedMarkdown(raw)
}

function countStrayHardBreakLines(markdown: string): number {
  return markdown.match(/^\\$/gm)?.length ?? 0
}

function extractFenceBody(markdown: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => /^ {0,3}(`{3,}|~{3,})/.test(line))
  if (start === -1) return []
  const fenceChar = lines[start].trim()[0]
  const end = lines.findIndex(
    (line, i) => i > start && line.trim().length > 0 && [...line.trim()].every((c) => c === fenceChar)
  )
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

describe('round-trip fidelity (property tests)', () => {
  it.each(Object.entries(FIXTURES))('%s: canonical() is a one-step fixed point', async (_name, fixture) => {
    const editor = createServerBlockNoteEditor()
    const once = await canonical(editor, fixture)
    const twice = await canonical(editor, once)
    expect(twice).toBe(once)
  })

  it.each(Object.entries(FIXTURES))(
    '%s: stray hard-break line count never grows across 5 passes',
    async (_name, fixture) => {
      const editor = createServerBlockNoteEditor()
      let current = fixture
      const counts: number[] = [countStrayHardBreakLines(current)]
      for (let pass = 0; pass < 5; pass++) {
        current = await canonical(editor, current)
        counts.push(countStrayHardBreakLines(current))
      }
      for (const count of counts) {
        expect(count).toBeLessThanOrEqual(counts[0])
      }
    }
  )

  it('<query> and <topic> survive a full round trip (escaped form acceptable)', async () => {
    const editor = createServerBlockNoteEditor()
    const recallResult = await canonical(editor, FIXTURES.recallHeading)
    expect(recallResult).toMatch(/\\?<query>/)

    const topicResult = await canonical(editor, FIXTURES.topicDateProse)
    expect(topicResult).toMatch(/\\?<topic>/)

    const kitchenSinkResult = await canonical(editor, FIXTURES.kitchenSink)
    expect(kitchenSinkResult).toMatch(/\\?<query>/)
    expect(kitchenSinkResult).toMatch(/\\?<topic>/)
  })

  it('fenced code block contents are byte-identical after a round trip', async () => {
    const editor = createServerBlockNoteEditor()
    const inputBody = extractFenceBody(FIXTURES.fencedCodeWithTagsAndBacktickLines)
    const result = await canonical(editor, FIXTURES.fencedCodeWithTagsAndBacktickLines)
    const outputBody = extractFenceBody(result)
    expect(outputBody).toEqual(inputBody)
  })

  it('the trailing-backslash hard break does not double across repeated ingest/export cycles', async () => {
    const editor = createServerBlockNoteEditor()
    let current = FIXTURES.trailingBackslashHardBreak
    for (let pass = 0; pass < 3; pass++) {
      current = await canonical(editor, current)
      expect(countStrayHardBreakLines(current)).toBe(0)
    }
  })
})
