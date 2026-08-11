// Minimal REST stub replacing the Kanwas backend for local-first Step 0.
// Pure Node (no deps). Implements exactly the surface the stock frontend needs
// to enter a workspace, mint a yjs socket token, and resolve binary files.
//
// See plan/local-first-plan.md §1.2 for the enumerated contract.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {
  WORKSPACE_ID,
  ORG_ID,
  USER,
  STUB_PORT,
  STUB_BASE_URL,
  TEST_FOLDER,
  mintSocketToken,
} from '../spike.config.mjs'

const NOW = new Date().toISOString()

const workspace = {
  id: WORKSPACE_ID,
  name: 'Field Vault (spike)',
  organizationId: ORG_ID,
  onboardingStatus: 'completed',
  isEmbedTemplate: false,
  createdAt: NOW,
  updatedAt: NOW,
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,x-correlation-id,x-requested-with')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

// Resolve a workspace-relative storagePath safely under TEST_FOLDER.
function resolveInsideVault(relPath) {
  const clean = decodeURIComponent(relPath || '').replace(/^\/+/, '')
  const abs = path.resolve(TEST_FOLDER, clean)
  if (abs !== TEST_FOLDER && !abs.startsWith(TEST_FOLDER + path.sep)) return null
  return abs
}

function log(...args) {
  console.log('[stub]', ...args)
}

const server = http.createServer((req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, STUB_BASE_URL)
  const p = url.pathname
  const method = req.method || 'GET'

  // --- Auth ---
  // GET /auth/me — gates ProtectedRoute. Accept any bearer token.
  if (p === '/auth/me' && method === 'GET') {
    return sendJson(res, 200, USER)
  }

  // --- Workspaces ---
  // GET /workspaces — membership check in App.tsx must find WORKSPACE_ID here.
  if (p === '/workspaces' && method === 'GET') {
    return sendJson(res, 200, [workspace])
  }
  // GET /workspaces/:id
  const wsShow = p.match(/^\/workspaces\/([^/]+)$/)
  if (wsShow && method === 'GET') {
    return sendJson(res, 200, workspace)
  }

  // POST /workspaces/:id/yjs-socket-token — mint HMAC token (mirrors backend).
  const tokenMatch = p.match(/^\/workspaces\/([^/]+)\/yjs-socket-token$/)
  if (tokenMatch && method === 'POST') {
    const wid = tokenMatch[1]
    const minted = mintSocketToken(wid)
    log('minted socket token for', wid)
    return sendJson(res, 200, minted)
  }

  // --- Files ---
  // GET /files/signed-url?path=<storagePath> — return a URL the stub serves.
  if (p === '/files/signed-url' && method === 'GET') {
    const storagePath = url.searchParams.get('path') || ''
    const raw = `${STUB_BASE_URL}/files/raw?path=${encodeURIComponent(storagePath)}`
    return sendJson(res, 200, { url: raw })
  }
  // GET /files/raw?path=<storagePath> — stream the actual bytes from the vault.
  if (p === '/files/raw' && method === 'GET') {
    const abs = resolveInsideVault(url.searchParams.get('path') || '')
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404)
      return res.end('not found')
    }
    const ext = path.extname(abs).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    return fs.createReadStream(abs).pipe(res)
  }

  // POST /workspaces/:id/files — multipart upload. Not exercised in the spike
  // (no UI uploads during render); acknowledge harmlessly.
  const uploadMatch = p.match(/^\/workspaces\/([^/]+)\/files$/)
  if (uploadMatch && method === 'POST') {
    return sendJson(res, 200, { storagePath: '', mimeType: 'application/octet-stream', size: 0 })
  }

  // --- Non-blocking extras the frontend may fire ---
  if (p === '/user-config') {
    if (method === 'GET') return sendJson(res, 200, {})
    if (method === 'PATCH' || method === 'PUT') return sendJson(res, 200, {})
  }
  if (p === '/organizations' && method === 'GET') {
    return sendJson(res, 200, [{ id: ORG_ID, name: 'Spike Org', createdAt: NOW, updatedAt: NOW }])
  }

  // socket.io app-channel (client.ts opens one): let it fail fast & retry.
  if (p.startsWith('/socket.io')) {
    res.writeHead(404)
    return res.end('no app socket in spike')
  }

  // Permissive catch-all so stray calls never surface as hard errors that could
  // break the render. The stock frontend still ships the agent/chat UI in Step 0
  // (removed in Step 1), and several of those endpoints (e.g. GET /skills) are
  // `.filter()`/`.map()`-ed on mount — so unknown collections must be arrays,
  // or the component throws and unmounts the whole workspace tree.
  //   - config/stats/settings-shaped paths -> object
  //   - everything else (collections) -> array
  log('unhandled', method, p)
  if (method === 'GET' || method === 'HEAD') {
    if (/(config|stats|settings|status|state|me)$/i.test(p)) return sendJson(res, 200, {})
    return sendJson(res, 200, [])
  }
  return sendJson(res, 200, {})
})

server.listen(STUB_PORT, () => {
  log(`listening on ${STUB_BASE_URL}`)
  log(`workspace id: ${WORKSPACE_ID}`)
  log(`serving files from: ${TEST_FOLDER}`)
})
