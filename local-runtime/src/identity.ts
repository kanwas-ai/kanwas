import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { LOCAL_USER } from 'shared/local-api'

/** Directory (inside the served folder) where the runtime persists its own state. */
export const KANWAS_DIR = '.kanwas'
const WORKSPACE_FILE = 'workspace.json'

interface WorkspaceFile {
  version: number
  workspaceId: string
  /** Stable id of the root canvas (constant, but persisted for clarity/future use). */
  rootId: string
  createdAt: string
}

export interface WorkspaceIdentity {
  workspaceId: string
  rootId: string
  /** URL form (hyphens stripped) the renderer routes to. */
  workspaceUrlId: string
}

/**
 * Read (or create) the stable workspace identity from `<folder>/.kanwas/workspace.json`.
 * This makes the workspace id — and therefore node/canvas identity URLs — survive
 * runtime restarts. Writing this file (and the `.kanwas/` dir) is one of the only
 * two kinds of writes the runtime is allowed to make to the served folder.
 */
export function loadOrCreateWorkspaceIdentity(folder: string): WorkspaceIdentity {
  const kanwasDir = path.join(folder, KANWAS_DIR)
  const file = path.join(kanwasDir, WORKSPACE_FILE)

  let parsed: WorkspaceFile | undefined
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as WorkspaceFile
  } catch {
    parsed = undefined
  }

  if (parsed && typeof parsed.workspaceId === 'string' && parsed.workspaceId.length > 0) {
    const rootId = typeof parsed.rootId === 'string' && parsed.rootId.length > 0 ? parsed.rootId : 'root'
    return {
      workspaceId: parsed.workspaceId,
      rootId,
      workspaceUrlId: parsed.workspaceId.replace(/-/g, ''),
    }
  }

  const workspaceId = randomUUID()
  const rootId = 'root'
  const next: WorkspaceFile = {
    version: 1,
    workspaceId,
    rootId,
    createdAt: new Date().toISOString(),
  }
  fs.mkdirSync(kanwasDir, { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')

  return { workspaceId, rootId, workspaceUrlId: workspaceId.replace(/-/g, '') }
}

/**
 * Per-run HMAC secret shared in-memory between the token minter (REST) and the
 * socket-token verifier (embedded yjs core). Regenerated every run — there is no
 * cross-process secret plumbing because it is one process.
 */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

export interface MintedToken {
  token: string
  expiresAt: string
}

/**
 * Mint a workspace-scoped socket token, mirroring
 * the former hosted token service:
 * `base64url(JSON payload) + "." + HMAC-SHA256(payloadB64, secret)`.
 */
export function mintSocketToken(
  secret: string,
  workspaceId: string,
  userId: string = LOCAL_USER.id,
  mode: 'editable' | 'readonly' = 'editable',
  ttlSeconds = 3600
): MintedToken {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const exp = nowSeconds + ttlSeconds
  const payload = { wid: workspaceId, uid: userId, mode, exp }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return { token: `${payloadB64}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() }
}
