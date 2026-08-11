import { createHmac, timingSafeEqual } from 'node:crypto'

export type SocketTokenAccessMode = 'editable' | 'readonly'

export interface SocketTokenClaims {
  wid: string
  uid: string
  mode: SocketTokenAccessMode
}

export type SocketTokenRejectionReason =
  | 'malformed_token'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'workspace_mismatch'
  | 'expired'

export interface SocketTokenVerifyFailure {
  reason: SocketTokenRejectionReason
}

export type SocketTokenVerifyResult =
  | { ok: true; claims: SocketTokenClaims }
  | ({ ok: false } & SocketTokenVerifyFailure)

interface DecodedPayload {
  wid?: unknown
  uid?: unknown
  mode?: unknown
  exp?: unknown
}

function safeBase64UrlDecode(value: string): Buffer | null {
  try {
    return Buffer.from(value, 'base64url')
  } catch {
    return null
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8')
  const bBuf = Buffer.from(b, 'utf-8')
  if (aBuf.length !== bBuf.length) {
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

export class SocketTokenVerifier {
  constructor(private readonly secret: string) {
    if (!secret || secret.length === 0) {
      throw new Error('SocketTokenVerifier requires a non-empty secret')
    }
  }

  verify(token: string, expectedWorkspaceId: string, nowMs: number = Date.now()): SocketTokenVerifyResult {
    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, reason: 'malformed_token' }
    }

    const parts = token.split('.')
    if (parts.length !== 2) {
      return { ok: false, reason: 'malformed_token' }
    }

    const [payloadB64, providedSig] = parts
    if (!payloadB64 || !providedSig) {
      return { ok: false, reason: 'malformed_token' }
    }

    const payloadBuf = safeBase64UrlDecode(payloadB64)
    if (!payloadBuf) {
      return { ok: false, reason: 'malformed_token' }
    }

    // Reject payloads that didn't round-trip — base64url silently accepts some invalid inputs.
    if (payloadBuf.toString('base64url') !== payloadB64) {
      return { ok: false, reason: 'malformed_token' }
    }

    const expectedSig = createHmac('sha256', this.secret).update(payloadB64).digest('base64url')
    if (!constantTimeEqual(providedSig, expectedSig)) {
      return { ok: false, reason: 'invalid_signature' }
    }

    let parsed: DecodedPayload
    try {
      parsed = JSON.parse(payloadBuf.toString('utf-8'))
    } catch {
      return { ok: false, reason: 'invalid_payload' }
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.wid !== 'string' ||
      typeof parsed.uid !== 'string' ||
      (parsed.mode !== 'editable' && parsed.mode !== 'readonly') ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp)
    ) {
      return { ok: false, reason: 'invalid_payload' }
    }

    if (parsed.wid !== expectedWorkspaceId) {
      return { ok: false, reason: 'workspace_mismatch' }
    }

    const nowSeconds = Math.floor(nowMs / 1000)
    if (parsed.exp <= nowSeconds) {
      return { ok: false, reason: 'expired' }
    }

    return {
      ok: true,
      claims: {
        wid: parsed.wid,
        uid: parsed.uid,
        mode: parsed.mode,
      },
    }
  }
}
