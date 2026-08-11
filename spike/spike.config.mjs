// Shared constants for the local-first Step 0 spike.
// Imported by the stub server, seed script, and external-edit script.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

// The workspace id the frontend routes to. Must be a hyphenated UUID so the
// frontend's fromUrlUuid() round-trips it, and must match the id returned by
// GET /workspaces, the seed target, and the socket-token `wid` claim.
export const WORKSPACE_ID = '4a7c1e9b-2d6f-4b3a-9c1e-000000000001'
// URL form (no hyphens), used to navigate to /w/<url-uuid>
export const WORKSPACE_URL_ID = WORKSPACE_ID.replace(/-/g, '')

export const ORG_ID = '22222222-2222-4222-8222-222222222222'
export const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'spike@kanwas.local',
  name: 'Spike User',
}

// Shared HMAC secret. yjs-server verifies with BACKEND_API_SECRET; the stub and
// external-edit script sign with the same value. Both must be 'dev'.
export const SECRET = process.env.SPIKE_SECRET || 'dev'

// Ports (overridable via env if defaults are occupied).
export const STUB_PORT = Number(process.env.SPIKE_STUB_PORT || 3334)
export const YJS_PORT = Number(process.env.SPIKE_YJS_PORT || 1999)
export const FRONTEND_PORT = Number(process.env.SPIKE_FRONTEND_PORT || 5199)

export const YJS_HOST = `localhost:${YJS_PORT}`
export const STUB_BASE_URL = `http://localhost:${STUB_PORT}`

export const TEST_FOLDER = path.join(repoRoot, 'spike', 'test-folder')
export const YJS_DATA_DIR = path.join(repoRoot, 'spike', '.yjs-data')
export const ARTIFACTS_DIR = path.join(repoRoot, 'spike', 'artifacts')
export const REPO_ROOT = repoRoot

// Mint a socket token exactly the way backend/app/services/yjs_socket_token_service.ts does.
import { createHmac } from 'node:crypto'
export function mintSocketToken(workspaceId = WORKSPACE_ID, userId = USER.id, mode = 'editable', ttlSeconds = 3600) {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const exp = nowSeconds + ttlSeconds
  const payload = { wid: workspaceId, uid: userId, mode, exp }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const signature = createHmac('sha256', SECRET).update(payloadB64).digest('base64url')
  return { token: `${payloadB64}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() }
}
