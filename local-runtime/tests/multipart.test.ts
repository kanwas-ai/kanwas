import { describe, expect, it } from 'vitest'
import { parseBoundary, parseMultipart } from '../src/multipart.js'

/** Build a multipart body the way object-to-formdata + fetch would. */
function buildBody(
  boundary: string,
  parts: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>
): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    let headers = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`
    if (part.filename !== undefined) headers += `; filename="${part.filename}"`
    headers += '\r\n'
    if (part.contentType) headers += `Content-Type: ${part.contentType}\r\n`
    headers += '\r\n'
    chunks.push(Buffer.from(headers, 'utf-8'))
    chunks.push(typeof part.value === 'string' ? Buffer.from(part.value, 'utf-8') : part.value)
    chunks.push(Buffer.from('\r\n', 'utf-8'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'))
  return Buffer.concat(chunks)
}

describe('multipart', () => {
  it('parses the boundary from a Content-Type header', () => {
    expect(parseBoundary('multipart/form-data; boundary=----abc123')).toBe('----abc123')
    expect(parseBoundary('multipart/form-data; boundary="----abc 123"')).toBe('----abc 123')
    expect(parseBoundary('application/json')).toBeNull()
    expect(parseBoundary(undefined)).toBeNull()
  })

  it('parses text fields and a binary file part (the upload hook shape)', () => {
    const boundary = '----KanwasBoundary1234'
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x0d, 0x0a])
    const body = buildBody(boundary, [
      { name: 'file', value: bytes, filename: 'my photo.png', contentType: 'image/png' },
      { name: 'canvas_id', value: 'canvas-123' },
      { name: 'filename', value: 'my-photo.png' },
    ])
    const parsed = parseMultipart(body, boundary)
    expect(parsed).not.toBeNull()
    expect(parsed!.fields.canvas_id).toBe('canvas-123')
    expect(parsed!.fields.filename).toBe('my-photo.png')
    expect(parsed!.files).toHaveLength(1)
    const file = parsed!.files[0]
    expect(file.field).toBe('file')
    expect(file.filename).toBe('my photo.png')
    expect(file.contentType).toBe('image/png')
    // Bytes must be byte-identical (binary-safe, incl. embedded CRLF and 0xFF).
    expect(file.data.equals(bytes)).toBe(true)
  })

  it('preserves bytes that contain the CRLF-delimiter prefix inside file content', () => {
    const boundary = '----b'
    // content that itself contains "\r\n" but not the full delimiter
    const bytes = Buffer.from('line1\r\nline2\r\n--not-the-boundary\r\nline3', 'utf-8')
    const body = buildBody(boundary, [
      { name: 'file', value: bytes, filename: 'f.bin', contentType: 'application/octet-stream' },
    ])
    const parsed = parseMultipart(body, boundary)
    expect(parsed!.files[0].data.equals(bytes)).toBe(true)
  })

  it('returns null when the boundary is absent from the body', () => {
    expect(parseMultipart(Buffer.from('nothing here'), '----zzz')).toBeNull()
  })
})
