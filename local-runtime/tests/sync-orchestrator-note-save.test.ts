// Mission A1 — SyncOrchestrator.handleNoteSave (PUT /workspaces/:id/notes/:nodeId/content).
//
// These tests exercise handleNoteSave directly against a real temp folder,
// WITHOUT calling SyncOrchestrator.start() — start() opens a live yjs
// websocket connection, which a self-contained test must not require. Instead
// the disk-facing internals start() would normally wire up (pathMapper,
// connection.proxy) are set directly, mirroring the adopt→align sequence
// start() itself runs.
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
import { PathMapper } from 'shared'
import type { CanvasItem, NodeItem } from 'shared'
import { adoptFolder } from '../src/adopt.js'
import { rebuildDiskAlignedMappings } from '../src/disk-align.js'
import { FrontmatterRegistry } from '../src/frontmatter-registry.js'
import { createLogger } from '../src/logger.js'
import { SuppressionRegistry } from '../src/suppression.js'
import { SyncOrchestrator } from '../src/sync-orchestrator.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

// A real 1x1 transparent PNG so image adoption reads valid dimensions.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
)

function makeFolder(files: Record<string, string | Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-notesave-'))
  tmpDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

function sha(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function findNode(root: CanvasItem | undefined, predicate: (n: NodeItem) => boolean): NodeItem | undefined {
  if (!root) return undefined
  for (const item of root.items) {
    if (item.kind === 'node' && predicate(item)) return item
    if (item.kind === 'canvas') {
      const found = findNode(item, predicate)
      if (found) return found
    }
  }
  return undefined
}

interface Harness {
  folder: string
  orchestrator: SyncOrchestrator
  root: CanvasItem
  suppression: SuppressionRegistry
}

async function setup(files: Record<string, string | Buffer>): Promise<Harness> {
  const folder = makeFolder(files)
  const frontmatter = new FrontmatterRegistry()
  const suppression = new SuppressionRegistry()
  const adopted = await adoptFolder({ folder, rootId: 'root', logger, frontmatter })

  const pathMapper = new PathMapper()
  rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder)

  const orchestrator = new SyncOrchestrator({
    folder,
    workspaceId: 'ws-test',
    rootCanvasId: 'root',
    yjsHost: 'localhost:0', // unused: start() is never called
    secret: 'test-secret',
    logger,
    suppression,
    frontmatter,
    seededEmpty: false,
  })

  // Wire the disk-facing private state start() would normally populate after
  // the network connect, without opening a real connection.
  Object.assign(orchestrator as unknown as Record<string, unknown>, {
    pathMapper,
    connection: { proxy: adopted.proxy },
  })

  return { folder, orchestrator, root: adopted.proxy.root, suppression }
}

describe('SyncOrchestrator.handleNoteSave', () => {
  it('writes a note body to disk, preserving frontmatter split off during a prior ingest', async () => {
    const original = '---\ntitle: My Note\n---\n\n# Heading\n\nOriginal body.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.root, (n) => n.xynode.type === 'blockNote')!

    const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body: '# Heading\n\nEdited body.\n' })

    expect(result.status).toBe(200)
    if (result.status !== 200) throw new Error('unreachable')
    expect(result.relPath).toBe('note.md')
    const written = fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')
    expect(written.startsWith('---\ntitle: My Note\n---\n')).toBe(true)
    expect(written).toContain('Edited body.')
    expect(written).not.toContain('Original body.')
    expect(result.hash).toBe(sha(written))
  })

  it('composes .sticky.yaml content including color/fontFamily read from the live node', async () => {
    const original = yaml.stringify({ content: 'Original sticky text', color: 'pink', fontFamily: 'caveat' })
    const h = await setup({ 'my-sticky.sticky.yaml': original })
    const node = findNode(h.root, (n) => n.xynode.type === 'stickyNote')!
    expect((node.xynode.data as { color?: string }).color).toBe('pink')

    const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body: 'Edited sticky text' })

    expect(result.status).toBe(200)
    const written = yaml.parse(fs.readFileSync(path.join(h.folder, 'my-sticky.sticky.yaml'), 'utf-8')) as {
      content: string
      color?: string
      fontFamily?: string
    }
    expect(written.content).toBe('Edited sticky text')
    expect(written.color).toBe('pink')
    expect(written.fontFamily).toBe('caveat')
  })

  it('returns a 409 with the current disk hash on a stale baseHash, and force:true overrides it', async () => {
    const original = '# Title\n\nOriginal.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.root, (n) => n.xynode.type === 'blockNote')!
    const staleHash = sha(original)

    // An external writer (git checkout, agent) lands a change after the editor
    // last read the file — its baseHash is now stale.
    const externalContent = '# Title\n\nExternal edit.\n'
    fs.writeFileSync(path.join(h.folder, 'note.md'), externalContent)

    const conflict = await h.orchestrator.handleNoteSave({
      nodeId: node.id,
      body: '# Title\n\nUI edit.\n',
      baseHash: staleHash,
    })
    expect(conflict.status).toBe(409)
    if (conflict.status === 409) expect(conflict.diskHash).toBe(sha(externalContent))
    // Disk wins: unforced conflict never writes.
    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe(externalContent)

    const forced = await h.orchestrator.handleNoteSave({
      nodeId: node.id,
      body: '# Title\n\nUI edit.\n',
      baseHash: staleHash,
      force: true,
    })
    expect(forced.status).toBe(200)
    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe('# Title\n\nUI edit.\n')
  })

  it('is a no-op (no write, no suppression entry) when the composed bytes are already on disk', async () => {
    const original = '# Title\n\nSame body.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.root, (n) => n.xynode.type === 'blockNote')!
    const mtimeBefore = fs.statSync(path.join(h.folder, 'note.md')).mtimeMs

    const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body: original })

    expect(result.status).toBe(200)
    if (result.status === 200) expect(result.hash).toBe(sha(original))
    expect(fs.statSync(path.join(h.folder, 'note.md')).mtimeMs).toBe(mtimeBefore)
    // No write was registered — nothing for the watcher's echo to consume.
    expect(h.suppression.consumeWrite('note.md', original)).toBe(false)
  })

  it("registers the write's suppression entry before the rename, so the watcher's echo is consumed exactly once", async () => {
    const h = await setup({ 'note.md': '# Title\n\nOriginal.\n' })
    const node = findNode(h.root, (n) => n.xynode.type === 'blockNote')!

    const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body: '# Title\n\nEdited.\n' })
    expect(result.status).toBe(200)

    const written = fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')
    expect(h.suppression.consumeWrite('note.md', written)).toBe(true)
    // Consumed — a second echo of the same bytes is NOT swallowed again.
    expect(h.suppression.consumeWrite('note.md', written)).toBe(false)
  })

  it('returns a 404-shaped error for an unknown node id', async () => {
    const h = await setup({ 'note.md': '# Title\n\nBody.\n' })

    const result = await h.orchestrator.handleNoteSave({ nodeId: randomUUID(), body: 'anything' })

    expect(result.status).toBe(404)
  })

  it('returns a 422-shaped error for a node whose backing file is not .md or .sticky.yaml', async () => {
    const h = await setup({ 'logo.png': PNG_1x1 })
    const node = findNode(h.root, (n) => n.xynode.type === 'image')!

    const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body: 'nope' })

    expect(result.status).toBe(422)
  })
})
