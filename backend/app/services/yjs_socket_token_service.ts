import { createHmac } from 'node:crypto'
import env from '#start/env'

export type YjsSocketTokenMode = 'editable' | 'readonly'

export interface MintSocketTokenArgs {
  workspaceId: string
  userId: string
  mode: YjsSocketTokenMode
}

export interface MintSocketTokenResult {
  token: string
  expiresAt: string
}

interface TokenPayload {
  wid: string
  uid: string
  mode: YjsSocketTokenMode
  exp: number
}

const TTL_SECONDS = 3600

export default class YjsSocketTokenService {
  mint(args: MintSocketTokenArgs): MintSocketTokenResult {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const exp = nowSeconds + TTL_SECONDS
    const payload: TokenPayload = {
      wid: args.workspaceId,
      uid: args.userId,
      mode: args.mode,
      exp,
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
    const signature = createHmac('sha256', env.get('API_SECRET')).update(payloadB64).digest('base64url')
    const token = `${payloadB64}.${signature}`
    const expiresAt = new Date(exp * 1000).toISOString()

    return { token, expiresAt }
  }
}
