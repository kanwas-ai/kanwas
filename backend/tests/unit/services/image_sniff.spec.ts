import { test } from '@japa/runner'
import { sniffImage } from '#services/image_sniff'

function hex(bytes: number[], padTo = 16): Uint8Array {
  const out = new Uint8Array(padTo)
  out.set(bytes.slice(0, padTo))
  return out
}

test.group('image_sniff.sniffImage', () => {
  test('accepts PNG signature', ({ assert }) => {
    const png = hex([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
    assert.deepEqual(sniffImage(png), { mime: 'image/png', ext: 'png' })
  })

  test('accepts JPEG signature', ({ assert }) => {
    const jpg = hex([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    assert.deepEqual(sniffImage(jpg), { mime: 'image/jpeg', ext: 'jpg' })
  })

  test('accepts GIF87a and GIF89a', ({ assert }) => {
    const g87 = hex([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0])
    const g89 = hex([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
    assert.deepEqual(sniffImage(g87), { mime: 'image/gif', ext: 'gif' })
    assert.deepEqual(sniffImage(g89), { mime: 'image/gif', ext: 'gif' })
  })

  test('accepts WebP signature', ({ assert }) => {
    // "RIFF" 4 length bytes "WEBP"
    const webp = hex([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    assert.deepEqual(sniffImage(webp), { mime: 'image/webp', ext: 'webp' })
  })

  test('rejects SVG / XML (XSS vector)', ({ assert }) => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    assert.isNull(sniffImage(svg))
  })

  test('rejects HTML polyglot', ({ assert }) => {
    const html = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>')
    assert.isNull(sniffImage(html))
  })

  test('rejects content-type-only spoof (header claims png, bytes are junk)', ({ assert }) => {
    const junk = hex([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b])
    assert.isNull(sniffImage(junk))
  })

  test('rejects short buffers', ({ assert }) => {
    assert.isNull(sniffImage(new Uint8Array([0x89, 0x50, 0x4e])))
    assert.isNull(sniffImage(new Uint8Array([])))
  })
})
