import { describe, it, expect } from 'vitest'
import { createAnsiThemeRewriter } from '@/components/terminal/ansiRewrite'

const FROM = '\x1b[48;2;55;55;55m'
const TO = '\x1b[48;2;240;240;240m'

describe('createAnsiThemeRewriter', () => {
  it('replaces the full sequence in one chunk when mode is light', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    const out = rewriter.transform(`before${FROM}after`)
    expect(out).toBe(`before${TO}after`)
  })

  it('leaves the sequence untouched in one chunk when mode is dark', () => {
    const rewriter = createAnsiThemeRewriter(() => 'dark')
    const out = rewriter.transform(`before${FROM}after`)
    expect(out).toBe(`before${FROM}after`)
  })

  describe('sequences split across chunks', () => {
    const cases: Array<[string, number]> = [
      ['after ESC', 1],
      ['after \\x1b[48;2;5', 8],
      ['one byte before the final m', FROM.length - 1],
    ]

    it.each(cases)('is still replaced when split %s', (_label, splitAt) => {
      const rewriter = createAnsiThemeRewriter(() => 'light')
      const full = `hello ${FROM} world`
      const chunk1 = full.slice(0, `hello `.length + splitAt)
      const chunk2 = full.slice(chunk1.length)

      const out1 = rewriter.transform(chunk1)
      const out2 = rewriter.transform(chunk2)

      expect(out1 + out2).toBe(`hello ${TO} world`)
    })
  })

  it('passes plain text through unchanged', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    expect(rewriter.transform('just plain text, nothing special')).toBe('just plain text, nothing special')
  })

  it('does not hold back an unrelated SGR sequence that starts with ESC', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    const out = rewriter.transform('before\x1b[31mred text')
    expect(out).toBe('before\x1b[31mred text')
  })

  it('does not hold back "\\x1b[3" since no pattern starts with it', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    // Nothing follows in this test, so if it were (incorrectly) held back, transform would
    // return an empty string here.
    expect(rewriter.transform('text\x1b[3')).toBe('text\x1b[3')
  })

  it('holds back "\\x1b[4" since it is a genuine prefix of the mapped pattern, and resolves once completed', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    const out1 = rewriter.transform('text\x1b[4')
    expect(out1).toBe('text')

    // Complete it as something unrelated to the mapped pattern (which starts `\x1b[48;2;5`) —
    // must be flushed intact, not corrupted by the held-back prefix.
    const out2 = rewriter.transform('2mgreen')
    expect(out2).toBe('\x1b[42mgreen')
  })

  it('does not hold back plain text ending in "\\x1b[" indefinitely — resolves once the rest arrives', () => {
    const rewriter = createAnsiThemeRewriter(() => 'light')
    const out1 = rewriter.transform('hello \x1b[')
    // "\x1b[" is a genuine (short) prefix of the mapped pattern, so it's fine for it to be
    // held back rather than emitted immediately.
    expect(out1).toBe('hello ')

    const out2 = rewriter.transform('31mworld')
    expect(out2).toBe('\x1b[31mworld')
    expect(out1 + out2).toBe('hello \x1b[31mworld')
  })

  it('handles a mode flip between chunks without corrupting output', () => {
    const modes: Array<'light' | 'dark'> = ['dark', 'light']
    let call = 0
    const rewriter = createAnsiThemeRewriter(() => modes[call])

    // First chunk arrives while dark (no rewrite applied), split mid-pattern.
    call = 0
    const splitAt = 'hello '.length + 8 // after '\x1b[48;2;5'
    const full = `hello ${FROM} world`
    const out1 = rewriter.transform(full.slice(0, splitAt))
    expect(out1).toBe('hello ')

    // Second chunk arrives while light — the now-complete pattern is rewritten.
    call = 1
    const out2 = rewriter.transform(full.slice(splitAt))
    expect(out1 + out2).toBe(`hello ${TO} world`)
  })

  it('flipping back to dark after a light replacement leaves subsequent output untouched', () => {
    const modes: Array<'light' | 'dark'> = ['light', 'dark']
    let call = 0
    const rewriter = createAnsiThemeRewriter(() => modes[call])

    call = 0
    const out1 = rewriter.transform(`one${FROM}`)
    expect(out1).toBe(`one${TO}`)

    call = 1
    const out2 = rewriter.transform(`two${FROM}three`)
    expect(out2).toBe(`two${FROM}three`)
  })
})
