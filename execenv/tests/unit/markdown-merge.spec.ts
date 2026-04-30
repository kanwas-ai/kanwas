import { describe, it, expect } from 'vitest'

import { mergeMarkdown3Way } from '../../src/markdown-merge.js'

describe('mergeMarkdown3Way', () => {
  it('merges non-overlapping edits from filesystem and yDoc', () => {
    const base = '# Title\n\nParagraph A base.\n\nParagraph B base.'
    const incoming = '# Title\n\nParagraph A agent edit.\n\nParagraph B base.'
    const current = '# Title\n\nParagraph A base.\n\nParagraph B user edit.'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') {
      return
    }

    expect(result.content).toContain('Paragraph A agent edit.')
    expect(result.content).toContain('Paragraph B user edit.')
  })

  it('returns conflict for overlapping edits', () => {
    const base = '# Title\n\nShared paragraph base.'
    const incoming = '# Title\n\nShared paragraph agent edit.'
    const current = '# Title\n\nShared paragraph user edit.'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result).toEqual({ status: 'conflict' })
  })

  it('auto-resolves when incoming branch equals base', () => {
    const base = '# Title\n\nShared paragraph base.'
    const incoming = '# Title\n\nShared paragraph base.'
    const current = '# Title\n\nShared paragraph user edit.'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') {
      return
    }

    expect(result.content).toContain('Shared paragraph user edit.')
    expect(result.content).not.toContain('Shared paragraph base.')
  })

  it('auto-resolves when current branch equals base', () => {
    const base = '# Title\n\nShared paragraph base.'
    const incoming = '# Title\n\nShared paragraph agent edit.'
    const current = '# Title\n\nShared paragraph base.'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') {
      return
    }

    expect(result.content).toContain('Shared paragraph agent edit.')
    expect(result.content).not.toContain('Shared paragraph base.')
  })

  it('auto-resolves when both branches converge to the same content', () => {
    const base = '# Title\n\nShared paragraph base.'
    const incoming = '# Title\n\nShared paragraph converged.'
    const current = '# Title\n\nShared paragraph converged.'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') {
      return
    }

    expect(result.content).toContain('Shared paragraph converged.')
    expect(result.content).not.toContain('Shared paragraph base.')
  })

  it('normalizes CRLF endings during merge', () => {
    const base = '# Title\r\n\r\nParagraph A base.\r\n\r\nParagraph B base.\r\n'
    const incoming = '# Title\r\n\r\nParagraph A agent edit.\r\n\r\nParagraph B base.\r\n'
    const current = '# Title\n\nParagraph A base.\n\nParagraph B user edit.\n'

    const result = mergeMarkdown3Way(base, incoming, current)

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') {
      return
    }

    expect(result.content).toContain('Paragraph A agent edit.')
    expect(result.content).toContain('Paragraph B user edit.')
    expect(result.content).not.toContain('\r')
  })

  it('returns structured error when merge input is invalid', () => {
    const result = mergeMarkdown3Way('base', 'incoming', 42 as unknown as string)

    expect(result.status).toBe('error')
    if (result.status !== 'error') {
      return
    }

    expect(result.error.length).toBeGreaterThan(0)
  })
})
