import { test } from '@japa/runner'
import { OutputBuffer } from '#agent/output_buffer'

test.group('OutputBuffer', () => {
  test('appends basic text', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('hello\nworld\n')
    assert.equal(buffer.getDisplayOutput(), 'hello\nworld')
    assert.equal(buffer.getTotalLineCount(), 2)
  })

  test('handles carriage return (progress bar behavior)', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('Progress: 0%\r')
    buffer.append('Progress: 50%\r')
    buffer.append('Progress: 100%\n')
    assert.equal(buffer.getDisplayOutput(), 'Progress: 100%')
    assert.equal(buffer.getTotalLineCount(), 1)
  })

  test('handles multiple carriage returns in single append', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('A\rB\rC\n')
    assert.equal(buffer.getDisplayOutput(), 'C')
  })

  test('strips ANSI escape codes', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('\x1B[32mgreen\x1B[0m text\n')
    assert.equal(buffer.getDisplayOutput(), 'green text')
  })

  test('strips complex ANSI sequences', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    // Bold, colors, cursor movement
    buffer.append('\x1B[1m\x1B[38;5;196mred bold\x1B[0m\n')
    assert.equal(buffer.getDisplayOutput(), 'red bold')
  })

  test('limits to maxDisplayLines', ({ assert }) => {
    const buffer = new OutputBuffer(3)
    buffer.append('line1\nline2\nline3\nline4\nline5\n')
    assert.equal(buffer.getDisplayOutput(), 'line3\nline4\nline5')
    assert.equal(buffer.getTotalLineCount(), 5)
    assert.equal(buffer.getHiddenLineCount(), 2)
  })

  test('filters control characters', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('hello\x00\x07world\n')
    assert.equal(buffer.getDisplayOutput(), 'helloworld')
  })

  test('preserves tabs', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('col1\tcol2\tcol3\n')
    assert.equal(buffer.getDisplayOutput(), 'col1\tcol2\tcol3')
  })

  test('handles incomplete line (no trailing newline)', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('in progress...')
    assert.equal(buffer.getDisplayOutput(), 'in progress...')
    assert.equal(buffer.getTotalLineCount(), 1)
  })

  test('handles empty input', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('')
    assert.equal(buffer.getDisplayOutput(), '')
    assert.equal(buffer.getTotalLineCount(), 0)
  })

  test('handles only newlines', ({ assert }) => {
    const buffer = new OutputBuffer(30)
    buffer.append('\n\n\n')
    assert.equal(buffer.getDisplayOutput(), '\n\n')
    assert.equal(buffer.getTotalLineCount(), 3)
  })

  test('limits individual line length', ({ assert }) => {
    const buffer = new OutputBuffer(30, 50) // maxDisplayLines=30, maxLineLength=50
    const longLine = 'x'.repeat(100)
    buffer.append(longLine + '\n')
    assert.equal(buffer.getDisplayOutput(), 'x'.repeat(50) + '...')
  })

  test('limits line length on incomplete line', ({ assert }) => {
    const buffer = new OutputBuffer(30, 20)
    buffer.append('a'.repeat(30)) // No newline
    assert.equal(buffer.getDisplayOutput(), 'a'.repeat(20) + '...')
  })

  test('carriage return resets line length tracking', ({ assert }) => {
    const buffer = new OutputBuffer(30, 10)
    buffer.append('x'.repeat(15)) // Would be truncated
    buffer.append('\r') // Reset
    buffer.append('short\n')
    assert.equal(buffer.getDisplayOutput(), 'short')
  })

  test('handles mixed content with progress and final output', ({ assert }) => {
    const buffer = new OutputBuffer(30, 1000)
    // Simulate npm install progress
    buffer.append('Installing packages...\n')
    buffer.append('[1/5] \r')
    buffer.append('[2/5] \r')
    buffer.append('[3/5] \r')
    buffer.append('[4/5] \r')
    buffer.append('[5/5] \r')
    buffer.append('Done!\n')
    assert.equal(buffer.getDisplayOutput(), 'Installing packages...\nDone!')
    assert.equal(buffer.getTotalLineCount(), 2)
  })

  test('getHiddenLineCount returns 0 when all lines visible', ({ assert }) => {
    const buffer = new OutputBuffer(10)
    buffer.append('line1\nline2\n')
    assert.equal(buffer.getHiddenLineCount(), 0)
  })

  test('default maxLineLength is 1000', ({ assert }) => {
    const buffer = new OutputBuffer(30) // No second arg
    const longLine = 'x'.repeat(1500)
    buffer.append(longLine + '\n')
    // Should truncate at 1000 + '...'
    assert.equal(buffer.getDisplayOutput(), 'x'.repeat(1000) + '...')
  })
})
