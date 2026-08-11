import { describe, expect, it, vi } from 'vitest'
import { sniffImage } from '../src/image-sniff.js'
import { fetchPublicUrl } from '../src/link-metadata.js'
import { SsrfError, assertPublicHttpUrl, isBlockedIp } from '../src/ssrf-guard.js'

function bytes(values: number[], length = 16): Uint8Array {
  const result = new Uint8Array(length)
  result.set(values.slice(0, length))
  return result
}

describe('link-preview SSRF protection', () => {
  it('allows public HTTP(S) URLs without credentials', () => {
    expect(assertPublicHttpUrl('https://example.com/page').hostname).toBe('example.com')
    expect(() => assertPublicHttpUrl('http://8.8.8.8/')).not.toThrow()
    expect(() => assertPublicHttpUrl('http://[2606:4700:4700::1111]/')).not.toThrow()
  })

  it('rejects non-HTTP schemes, malformed URLs, and embedded credentials', () => {
    for (const value of [
      'file:///etc/passwd',
      'gopher://example.com',
      'javascript:alert(1)',
      'not a url',
      'https://user:pass@example.com/',
    ]) {
      expect(() => assertPublicHttpUrl(value)).toThrow(SsrfError)
    }
  })

  it('rejects local, private, link-local, metadata, and mapped IP literals', () => {
    for (const value of [
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:10.0.0.1]/',
    ]) {
      expect(() => assertPublicHttpUrl(value), value).toThrow(SsrfError)
    }
  })

  it('classifies representative IP ranges and malformed input', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true)
    expect(isBlockedIp('169.254.169.254')).toBe(true)
    expect(isBlockedIp('172.31.255.255')).toBe(true)
    expect(isBlockedIp('172.32.0.0')).toBe(false)
    expect(isBlockedIp('1.1.1.1')).toBe(false)
    expect(isBlockedIp('not-an-ip')).toBe(true)
  })

  it('re-validates redirect locations before issuing the next request', async () => {
    const fetcher = vi.fn(
      async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:4300/api/workspaces' } })
    ) as unknown as typeof fetch
    await expect(fetchPublicUrl('https://example.com/start', 1_000, fetcher)).rejects.toThrow(SsrfError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('link-preview image sniffing', () => {
  it('accepts supported raster signatures', () => {
    expect(sniffImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      mime: 'image/png',
      ext: 'png',
    })
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: 'image/jpeg', ext: 'jpg' })
    expect(sniffImage(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toEqual({
      mime: 'image/gif',
      ext: 'gif',
    })
    expect(sniffImage(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toEqual({
      mime: 'image/webp',
      ext: 'webp',
    })
  })

  it('rejects SVG, HTML, spoofed, and truncated bodies', () => {
    const encoder = new TextEncoder()
    expect(sniffImage(encoder.encode('<svg><script>alert(1)</script></svg>'))).toBeNull()
    expect(sniffImage(encoder.encode('<!doctype html><script>alert(1)</script>'))).toBeNull()
    expect(sniffImage(bytes([0, 1, 2, 3, 4, 5]))).toBeNull()
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull()
  })
})
