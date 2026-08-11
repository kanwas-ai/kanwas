import { describe, expect, it } from 'vitest'
import { joinFrontmatter, splitFrontmatter } from '../src/frontmatter.js'

describe('splitFrontmatter', () => {
  it('splits a standard YAML frontmatter block off the body', () => {
    const text = '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n\nText.\n'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\ntitle: Hello\ntags: [a, b]\n---\n')
    expect(body).toBe('\n# Body\n\nText.\n')
  })

  it('returns no frontmatter when the file does not start with a fence', () => {
    const text = '# Just a heading\n\nNo frontmatter here.\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: '', body: text })
  })

  it('does not treat a mid-document thematic break as frontmatter', () => {
    const text = '# Heading\n\n---\n\nmore\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: '', body: text })
  })

  it('handles a frontmatter block with no trailing newline at EOF', () => {
    const text = '---\na: 1\n---'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\na: 1\n---')
    expect(body).toBe('')
  })

  it('preserves CRLF frontmatter bytes verbatim', () => {
    const text = '---\r\ntitle: X\r\n---\r\nbody\r\n'
    const { frontmatter } = splitFrontmatter(text)
    expect(frontmatter).toBe('---\r\ntitle: X\r\n---\r\n')
  })
})

describe('joinFrontmatter', () => {
  it('is a byte-exact inverse of split for a normal document', () => {
    const text = '---\ntitle: Hello\n---\n\n# Body\n'
    const { frontmatter, body } = splitFrontmatter(text)
    expect(joinFrontmatter(frontmatter, body)).toBe(text)
  })

  it('re-inserts the conventional blank line when the body lost it', () => {
    const frontmatter = '---\ntitle: X\n---\n'
    expect(joinFrontmatter(frontmatter, '# Body edited\n')).toBe('---\ntitle: X\n---\n\n# Body edited\n')
  })

  it('returns the body unchanged when there is no frontmatter', () => {
    expect(joinFrontmatter('', '# Body\n')).toBe('# Body\n')
  })

  it('keeps frontmatter byte-identical across a body rewrite', () => {
    const original = '---\nname: decision-log\ndescription: Capture decisions.\n---\n\n# Old body\n'
    const { frontmatter } = splitFrontmatter(original)
    const rewritten = joinFrontmatter(frontmatter, '# Brand new body\n\nWith more lines.\n')
    // The frontmatter portion of the rewritten file must be byte-identical.
    expect(splitFrontmatter(rewritten).frontmatter).toBe(frontmatter)
  })
})
