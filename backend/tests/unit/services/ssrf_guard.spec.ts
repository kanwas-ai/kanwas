import { test } from '@japa/runner'
import { SsrfError, assertPublicHttpUrl, isBlockedIp } from '#services/ssrf_guard'

test.group('ssrf_guard.assertPublicHttpUrl', () => {
  test('accepts plain https public URL', ({ assert }) => {
    const url = assertPublicHttpUrl('https://example.com/og')
    assert.equal(url.hostname, 'example.com')
  })

  test('rejects non-http schemes', ({ assert }) => {
    for (const bad of ['file:///etc/passwd', 'gopher://evil.tld', 'ftp://x', 'javascript:alert(1)']) {
      assert.throws(() => assertPublicHttpUrl(bad), /Disallowed URL scheme|Invalid URL/)
    }
  })

  test('rejects malformed URL', ({ assert }) => {
    assert.throws(() => assertPublicHttpUrl('not a url'), /Invalid URL/)
  })

  test('rejects URLs with embedded credentials', ({ assert }) => {
    assert.throws(() => assertPublicHttpUrl('https://user:pass@example.com/'), /embedded credentials/)
  })

  test('rejects literal loopback / private / link-local IPs', ({ assert }) => {
    const blocked = [
      'http://127.0.0.1/',
      'http://127.0.0.1:6379/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // AWS IMDS
      'http://100.64.0.1/', // CGNAT
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:10.0.0.1]/', // IPv4-mapped IPv6
    ]
    for (const u of blocked) {
      try {
        assertPublicHttpUrl(u)
        assert.fail(`expected ${u} to be blocked`)
      } catch (err) {
        assert.instanceOf(err, SsrfError)
      }
    }
  })

  test('accepts public IP literals', ({ assert }) => {
    assert.doesNotThrow(() => assertPublicHttpUrl('http://8.8.8.8/'))
    assert.doesNotThrow(() => assertPublicHttpUrl('http://[2606:4700:4700::1111]/'))
  })
})

test.group('ssrf_guard.isBlockedIp', () => {
  test('classifies IPv4 correctly', ({ assert }) => {
    assert.isTrue(isBlockedIp('127.0.0.1'))
    assert.isTrue(isBlockedIp('169.254.169.254'))
    assert.isTrue(isBlockedIp('172.31.255.255'))
    assert.isFalse(isBlockedIp('172.32.0.0'))
    assert.isFalse(isBlockedIp('8.8.8.8'))
    assert.isFalse(isBlockedIp('1.1.1.1'))
  })

  test('rejects malformed input', ({ assert }) => {
    assert.isTrue(isBlockedIp('not-an-ip'))
    assert.isTrue(isBlockedIp(''))
  })
})
