import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SocketTokenVerifier } from '../../src/socket-token-verifier.js'

const SECRET = 'test-secret-abc'
const OTHER_SECRET = 'different-secret'

interface MintOptions {
  secret?: string
  wid?: string
  uid?: string
  mode?: 'editable' | 'read-only'
  exp?: number
}

function mintToken(opts: MintOptions = {}): string {
  const payload = {
    wid: opts.wid ?? 'workspace-1',
    uid: opts.uid ?? 'user-1',
    mode: opts.mode ?? 'editable',
    exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600,
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const sig = createHmac('sha256', opts.secret ?? SECRET)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

describe('SocketTokenVerifier', () => {
  it('accepts a valid token for the expected workspace', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const token = mintToken({ wid: 'w-a' })

    const result = verifier.verify(token, 'w-a')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.claims.wid).toBe('w-a')
      expect(result.claims.uid).toBe('user-1')
      expect(result.claims.mode).toBe('editable')
    }
  })

  it('rejects a token whose wid does not match the handshake workspace', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const token = mintToken({ wid: 'w-a' })

    const result = verifier.verify(token, 'w-b')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('workspace_mismatch')
    }
  })

  it('rejects an expired token', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const now = Date.now()
    const token = mintToken({ wid: 'w-a', exp: Math.floor(now / 1000) - 1 })

    const result = verifier.verify(token, 'w-a', now)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('expired')
    }
  })

  it('rejects a token minted with a different secret', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const token = mintToken({ secret: OTHER_SECRET, wid: 'w-a' })

    const result = verifier.verify(token, 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('rejects a tampered payload (signature no longer matches)', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const original = mintToken({ wid: 'w-a', uid: 'user-1' })
    const [, sig] = original.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ wid: 'w-a', uid: 'attacker', mode: 'editable', exp: Math.floor(Date.now() / 1000) + 3600 }),
      'utf-8'
    ).toString('base64url')
    const tampered = `${tamperedPayload}.${sig}`

    const result = verifier.verify(tampered, 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('rejects a tampered signature', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const original = mintToken({ wid: 'w-a' })
    const [payloadB64] = original.split('.')
    const fakeSig = Buffer.from('a'.repeat(32)).toString('base64url')
    const tampered = `${payloadB64}.${fakeSig}`

    const result = verifier.verify(tampered, 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('rejects tokens missing the dot separator', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const result = verifier.verify('not-a-token', 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed_token')
    }
  })

  it('rejects tokens with empty parts', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const r1 = verifier.verify('.abc', 'w-a')
    expect(r1.ok).toBe(false)

    const r2 = verifier.verify('abc.', 'w-a')
    expect(r2.ok).toBe(false)
  })

  it('rejects tokens with non-base64url payload', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    // Use characters not in the base64url alphabet (plus sign, slash, padding)
    const result = verifier.verify('!!!.abc', 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed_token')
    }
  })

  it('rejects tokens whose payload JSON is missing required fields', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const badPayload = Buffer.from(JSON.stringify({ wid: 'w-a' }), 'utf-8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(badPayload).digest('base64url')
    const token = `${badPayload}.${sig}`

    const result = verifier.verify(token, 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_payload')
    }
  })

  it('rejects tokens with invalid mode value', () => {
    const verifier = new SocketTokenVerifier(SECRET)
    const badPayload = Buffer.from(
      JSON.stringify({ wid: 'w-a', uid: 'u', mode: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }),
      'utf-8'
    ).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(badPayload).digest('base64url')
    const token = `${badPayload}.${sig}`

    const result = verifier.verify(token, 'w-a')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_payload')
    }
  })

  it('constructor rejects empty secret', () => {
    expect(() => new SocketTokenVerifier('')).toThrow()
  })
})
