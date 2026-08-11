import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'
import env from '#start/env'
import YjsSocketTokenService from '#services/yjs_socket_token_service'

function verifyWithSecret(
  token: string,
  secret: string,
  expectedWorkspaceId: string,
  nowMs: number = Date.now()
): { wid: string; uid: string; mode: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null
  }

  const [payloadB64, sig] = parts
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  if (sig !== expectedSig) {
    return null
  }

  let payload: { wid?: unknown; uid?: unknown; mode?: unknown; exp?: unknown }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
  } catch {
    return null
  }

  if (
    typeof payload.wid !== 'string' ||
    typeof payload.uid !== 'string' ||
    (payload.mode !== 'editable' && payload.mode !== 'read-only') ||
    typeof payload.exp !== 'number'
  ) {
    return null
  }

  if (payload.wid !== expectedWorkspaceId) {
    return null
  }

  if (payload.exp <= Math.floor(nowMs / 1000)) {
    return null
  }

  return { wid: payload.wid, uid: payload.uid, mode: payload.mode }
}

test.group('YjsSocketTokenService', () => {
  test('mint produces well-formed token with ISO expiresAt', ({ assert }) => {
    const service = new YjsSocketTokenService()
    const result = service.mint({ workspaceId: 'w-1', userId: 'u-1', mode: 'editable' })

    const parts = result.token.split('.')
    assert.lengthOf(parts, 2)
    assert.isAbove(parts[0].length, 0)
    assert.isAbove(parts[1].length, 0)
    assert.match(result.expiresAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  test('token round-trips through verifier with same secret', ({ assert }) => {
    const service = new YjsSocketTokenService()
    const result = service.mint({ workspaceId: 'w-round', userId: 'u-1', mode: 'editable' })

    const claims = verifyWithSecret(result.token, env.get('API_SECRET'), 'w-round')
    assert.isNotNull(claims)
    assert.equal(claims!.wid, 'w-round')
    assert.equal(claims!.uid, 'u-1')
    assert.equal(claims!.mode, 'editable')
  })

  test('token is rejected by a verifier with a different secret', ({ assert }) => {
    const service = new YjsSocketTokenService()
    const result = service.mint({ workspaceId: 'w-1', userId: 'u-1', mode: 'editable' })

    const claims = verifyWithSecret(result.token, 'different-secret', 'w-1')
    assert.isNull(claims)
  })

  test('tampered payload breaks signature verification', ({ assert }) => {
    const service = new YjsSocketTokenService()
    const result = service.mint({ workspaceId: 'w-1', userId: 'u-1', mode: 'editable' })

    const [, sig] = result.token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ wid: 'w-other', uid: 'u-1', mode: 'editable', exp: Math.floor(Date.now() / 1000) + 3600 }),
      'utf-8'
    ).toString('base64url')
    const tamperedToken = `${tamperedPayload}.${sig}`

    const claims = verifyWithSecret(tamperedToken, env.get('API_SECRET'), 'w-other')
    assert.isNull(claims)
  })

  test('mint sets exp to roughly 3600 seconds in the future', ({ assert }) => {
    const before = Math.floor(Date.now() / 1000)
    const service = new YjsSocketTokenService()
    const result = service.mint({ workspaceId: 'w-1', userId: 'u-1', mode: 'editable' })
    const after = Math.floor(Date.now() / 1000)

    const [payloadB64] = result.token.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))

    assert.isAtLeast(payload.exp, before + 3600)
    assert.isAtMost(payload.exp, after + 3600)
  })
})
