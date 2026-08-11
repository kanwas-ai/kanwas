// Seed script: build a workspace yDoc from the real test folder via a full
// FilesystemSyncer scan (autoCreateCanvases:true, exactly as cli push does),
// serialize to a {root, notes} snapshot bundle, and POST it to yjs-server's
// /documents/:id/replace so the stock frontend can render it.
//
// Run from spike/ (ESM, tsx). Shared is imported by relative dist path so its
// internal deps resolve from shared/node_modules (see spike/README.md).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as Y from 'yjs'
import { createYjsProxy } from 'valtio-y'
import {
  FilesystemSyncer,
  ContentConverter,
  createWorkspaceSnapshotBundle,
  type FileChange,
  type FileUploadResult,
} from '../../shared/dist/server.js'
import { PathMapper } from '../../shared/dist/workspace/path-mapper.js'
import { assertValidWorkspaceRoot } from '../../shared/dist/workspace/canvas-tree.js'
import { WORKSPACE_ID, YJS_PORT, TEST_FOLDER } from '../spike.config.mjs'

const YJS_HTTP = `http://localhost:${YJS_PORT}`
const ADMIN_SECRET = process.env.SPIKE_SECRET || 'dev'

// Recursively collect vault-relative file paths (POSIX separators).
async function walk(dir: string, base = ''): Promise<string[]> {
  const out: string[] = []
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue
    const rel = base ? `${base}/${e.name}` : e.name
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(abs, rel)))
    } else if (e.isFile()) {
      out.push(rel)
    }
  }
  return out
}

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp3', '.wav', '.m4a'])

async function main() {
  console.log(`[seed] scanning ${TEST_FOLDER}`)
  const relPaths = await walk(TEST_FOLDER)
  console.log(`[seed] found ${relPaths.length} files`)

  const yDoc = new Y.Doc()
  const { bootstrap, proxy } = createYjsProxy(yDoc, {
    getRoot: (doc: Y.Doc) => doc.getMap('state'),
  })

  // Pre-seed an empty root canvas (PathMapper.buildFromWorkspace + createNode
  // both require proxy.root to exist and be a valid canvas).
  bootstrap({
    root: {
      id: 'root',
      name: '',
      kind: 'canvas',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [],
    },
  })

  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(proxy)
  const contentConverter = new ContentConverter()

  // Capture the rel path of the file currently being read so fileUploader can
  // return a vault-relative storagePath the stub serves back.
  let currentRelPath: string | null = null
  const fileReader = async (relPath: string): Promise<Buffer> => {
    currentRelPath = relPath
    return fsp.readFile(path.join(TEST_FOLDER, relPath))
  }
  const fileUploader = async (
    buffer: Buffer,
    _canvasId: string,
    _filename: string,
    mimeType: string
  ): Promise<FileUploadResult> => {
    return { storagePath: currentRelPath ?? _filename, mimeType, size: buffer.length }
  }

  const syncer = new FilesystemSyncer({
    proxy,
    yDoc,
    pathMapper,
    contentConverter,
    fileUploader,
    fileReader,
    autoCreateCanvases: true,
  })

  let created = 0
  let skipped = 0
  let errors = 0
  for (const rel of relPaths) {
    const ext = path.extname(rel).toLowerCase()
    const isBinary = BINARY_EXT.has(ext)
    const change: FileChange = isBinary
      ? { type: 'create', path: rel, binaryContent: await fsp.readFile(path.join(TEST_FOLDER, rel)) }
      : { type: 'create', path: rel, content: fs.readFileSync(path.join(TEST_FOLDER, rel), 'utf-8') }
    const res = await syncer.syncChange(change)
    if ('success' in res && res.success) {
      if (res.action === 'no_op') {
        skipped++
        console.log(`  · ${rel} (no_op)`)
      } else {
        created++
        console.log(`  + ${rel} -> ${res.action}${'nodeId' in res && res.nodeId ? ` (${res.nodeId.slice(0, 8)})` : ''}`)
      }
    } else {
      errors++
      console.log(`  ! ${rel}: ${'error' in res ? res.error : 'unknown error'}`)
    }
  }
  console.log(`[seed] synced: ${created} created, ${skipped} skipped, ${errors} errors`)

  // Let valtio-y flush any batched proxy->yDoc writes.
  await new Promise((r) => setTimeout(r, 200))

  // CRITICAL: root map must pass assertValidWorkspaceRoot or the socket attach
  // in yjs-server/src/room.ts rejects the connection.
  const rootState = yDoc.getMap('state').get('root')
  assertValidWorkspaceRoot(rootState)
  const topItems = (rootState as any).items?.length ?? (rootState as any).get?.('items')?.length
  console.log(`[seed] root canvas valid; top-level items: ${topItems}`)

  const bundle = createWorkspaceSnapshotBundle(yDoc)
  const noteCount = Object.keys(bundle.notes).length
  console.log(`[seed] snapshot bundle: root ${bundle.root.length}b (base64), ${noteCount} note subdocs`)

  const res = await fetch(`${YJS_HTTP}/documents/${WORKSPACE_ID}/replace?notifyBackend=false&reason=spike-seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify(bundle),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`[seed] POST /documents/${WORKSPACE_ID}/replace FAILED ${res.status}: ${text}`)
    process.exit(1)
  }
  console.log(`[seed] posted to yjs-server: ${res.status} ${text}`)
  console.log(`[seed] DONE. workspace ${WORKSPACE_ID} seeded with ${noteCount} notes.`)
}

main().catch((err) => {
  console.error('[seed] fatal:', err)
  process.exit(1)
})
