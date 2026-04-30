import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_INTERLINK_TYPE,
  convertWorkspaceInterlinksToLinksInBlocks,
  convertWorkspaceLinksToInterlinksInBlocks,
  createWorkspaceInterlinkProps,
  parseWorkspaceHref,
  workspaceInterlinkHrefFromProps,
} from '../../../src/workspace/workspace-interlink.js'

describe('workspace interlink utilities', () => {
  it('parses workspace hrefs with query and hash', () => {
    const parsed = parseWorkspaceHref('/workspace/docs/Plan.md?line=2#L10')
    expect(parsed).toEqual({
      href: '/workspace/docs/Plan.md?line=2#L10',
      canonicalPath: 'docs/Plan.md',
    })
  })

  it('ignores absolute external URLs', () => {
    expect(parseWorkspaceHref('https://example.com/workspace/docs/Plan.md')).toBeNull()
  })

  it('rejects encoded dot-segment traversal paths', () => {
    expect(parseWorkspaceHref('/workspace/%2e%2e/secrets.md')).toBeNull()
    expect(parseWorkspaceHref('/workspace/docs/%2E%2E/%2e%2E/secret.md')).toBeNull()
  })

  it('creates interlink props with fallback label', () => {
    const props = createWorkspaceInterlinkProps('/workspace/docs/Plan.md', '')
    expect(props).toEqual({
      href: '/workspace/docs/Plan.md',
      canonicalPath: 'docs/Plan.md',
      label: 'Plan',
      v: '1',
    })
  })

  it('strips yaml node extensions from fallback labels', () => {
    expect(createWorkspaceInterlinkProps('/workspace/context/callout.text.yaml', '')?.label).toBe('callout')
    expect(createWorkspaceInterlinkProps('/workspace/context/retro.sticky.yaml', '')?.label).toBe('retro')
  })

  it('reconstructs href from legacy canonicalPath that includes query/hash', () => {
    expect(
      workspaceInterlinkHrefFromProps({
        canonicalPath: 'docs/Plan.md?line=2#L10',
      })
    ).toBe('/workspace/docs/Plan.md?line=2#L10')
  })

  it('does not reconstruct href for invalid dot-segment canonicalPath', () => {
    expect(
      workspaceInterlinkHrefFromProps({
        canonicalPath: '../secrets.md',
      })
    ).toBeNull()
  })

  it('converts workspace links to interlinks and keeps external links', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'link',
            href: '/workspace/docs/Plan.md',
            content: [{ type: 'text', text: 'Plan', styles: {} }],
          },
          { type: 'text', text: ' + ', styles: {} },
          {
            type: 'link',
            href: 'https://example.com/docs',
            content: [{ type: 'text', text: 'External', styles: {} }],
          },
        ],
        children: [],
      },
    ]

    const converted = convertWorkspaceLinksToInterlinksInBlocks(blocks)
    const content = (converted[0] as { content: Array<{ type: string }> }).content

    expect(content[0].type).toBe(WORKSPACE_INTERLINK_TYPE)
    expect(content[2].type).toBe('link')
  })

  it('round-trips tokenized interlinks back to markdown-style links', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        props: {},
        content: [
          {
            type: WORKSPACE_INTERLINK_TYPE,
            props: {
              href: '/workspace/docs/Plan.md?line=2#L10',
              canonicalPath: 'docs/Plan.md',
              label: 'Plan',
              v: '1',
            },
          },
        ],
        children: [],
      },
    ]

    const converted = convertWorkspaceInterlinksToLinksInBlocks(blocks)
    const content = (converted[0] as { content: Array<{ type: string; href?: string }> }).content

    expect(content[0].type).toBe('link')
    expect(content[0].href).toBe('/workspace/docs/Plan.md?line=2#L10')
  })
})
