import { describe, expect, it } from 'vitest'
import { WORKSPACE_INTERLINK_TYPE } from 'shared/workspace-interlink'

import { parseImportedContentToBlocks } from '@/lib/blocknote-import'

type InlineContentProbe = { type?: string; href?: string; props?: Record<string, unknown> }

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

describe('parseImportedContentToBlocks', () => {
  it('preserves internal BlockNote workspace interlink inline content', () => {
    const blocks = parseImportedContentToBlocks(
      [
        '<p>See ',
        '<span data-inline-content-type="workspaceInterlink" data-href="/workspace/brain.md" ',
        'data-canonical-path="brain.md" data-label="brain"></span></p>',
      ].join(''),
      'html'
    )

    const interlink = collectInlineContent(blocks).find((item) => item.type === WORKSPACE_INTERLINK_TYPE)

    expect(interlink?.props).toMatchObject({
      href: '/workspace/brain.md',
      canonicalPath: 'brain.md',
      label: 'brain',
    })
  })

  it('converts markdown workspace links to interlinks', () => {
    const blocks = parseImportedContentToBlocks('See [brain](/workspace/brain.md)', 'markdown')
    const inlineContent = collectInlineContent(blocks)

    expect(inlineContent.some((item) => item.type === WORKSPACE_INTERLINK_TYPE)).toBe(true)
    expect(inlineContent.some((item) => item.type === 'link' && item.href === '/workspace/brain.md')).toBe(false)
  })

  it('converts html workspace links to interlinks', () => {
    const blocks = parseImportedContentToBlocks('<p>See <a href="/workspace/brain.md">brain</a></p>', 'html')
    const inlineContent = collectInlineContent(blocks)

    expect(inlineContent.some((item) => item.type === WORKSPACE_INTERLINK_TYPE)).toBe(true)
    expect(inlineContent.some((item) => item.type === 'link' && item.href === '/workspace/brain.md')).toBe(false)
  })

  it('imports copied tables as BlockNote table blocks', () => {
    const blocks = parseImportedContentToBlocks(
      [
        '<table><tr><th><p>Day</p></th><th><p>Focus</p></th></tr>',
        '<tr><td><p>1</p></td><td><p>Message</p></td></tr></table>',
      ].join(''),
      'html'
    )

    expect(blocks[0]).toMatchObject({
      type: 'table',
      content: {
        type: 'tableContent',
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
})
