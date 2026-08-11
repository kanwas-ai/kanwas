import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as yaml from 'yaml'
import { PathMapper, sanitizeFilename } from 'shared'
import type { CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { ContentConverter } from 'shared/server'
import { adoptFolder, type AdoptResult } from '../src/adopt.js'
import { rebuildDiskAlignedMappings } from '../src/disk-align.js'
import { FolderFlusher, type FlusherSource, type FolderFlusherOptions } from '../src/folder-flusher.js'
import { FrontmatterRegistry } from '../src/frontmatter-registry.js'
import { MetadataManager } from '../src/metadata-manager.js'
import { SuppressionRegistry } from '../src/suppression.js'
import { createLogger } from '../src/logger.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeFolder(files: Record<string, string | Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-flush-'))
  tmpDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

// A real 1x1 transparent PNG so image adoption reads valid dimensions.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
)

function sha(abs: string): string {
  return createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
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

function findCanvas(root: CanvasItem | undefined, predicate: (c: CanvasItem) => boolean): CanvasItem | undefined {
  if (!root) return undefined
  for (const item of root.items) {
    if (item.kind === 'canvas') {
      if (predicate(item)) return item
      const found = findCanvas(item, predicate)
      if (found) return found
    }
  }
  return undefined
}

function readMeta(folder: string, rel: string): Record<string, unknown> {
  const p = rel.length === 0 ? path.join(folder, 'metadata.yaml') : path.join(folder, rel, 'metadata.yaml')
  return yaml.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
}

/** Materialize sidecars from an adopted proxy exactly as the runtime does at boot. */
async function materializeSidecars(folder: string, proxy: WorkspaceDocument): Promise<void> {
  const pm = new PathMapper()
  rebuildDiskAlignedMappings(pm, proxy, folder)
  const walk = (id: string, c: CanvasItem | undefined): CanvasItem | undefined => {
    if (!c) return undefined
    if (c.id === id) return c
    for (const item of c.items)
      if (item.kind === 'canvas') {
        const f = walk(id, item)
        if (f) return f
      }
    return undefined
  }
  const listCanvasIds = (): string[] => {
    const ids: string[] = []
    const rec = (c: CanvasItem | undefined) => {
      if (!c) return
      ids.push(c.id)
      for (const item of c.items) if (item.kind === 'canvas') rec(item)
    }
    rec(proxy.root)
    return ids
  }
  const mm = new MetadataManager({
    logger,
    workspacePath: folder,
    findCanvasById: (id) => walk(id, proxy.root),
    getCanvasPathById: (id) => pm.getPathForCanvas(id),
    listCanvasIds,
  })
  await mm.materializeMissing(async (canvasPath) => {
    const dir = canvasPath.length === 0 ? folder : path.join(folder, canvasPath)
    return fs.existsSync(path.join(dir, 'metadata.yaml'))
  })
}

interface Harness {
  folder: string
  adopted: AdoptResult
  flusher: FolderFlusher
  frontmatter: FrontmatterRegistry
  suppression: SuppressionRegistry
  converter: ContentConverter
  /** The fake FlusherSource's synced-hash bookkeeping (mirrors SyncOrchestrator.fileHashes). */
  hashes: Map<string, string>
}

async function setup(
  files: Record<string, string>,
  flusherOverrides: Partial<FolderFlusherOptions> = {}
): Promise<Harness> {
  const folder = makeFolder(files)
  const frontmatter = new FrontmatterRegistry()
  const suppression = new SuppressionRegistry()
  const adopted = await adoptFolder({ folder, rootId: 'root', logger, frontmatter })
  await materializeSidecars(folder, adopted.proxy)

  const pathMapper = new PathMapper()
  rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder)
  const hashes = new Map<string, string>()
  const source: FlusherSource = {
    root: () => adopted.proxy.root,
    noteFragment: (id) => adopted.contentStore.getBlockNoteFragment(id),
    realign: () => rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder),
    enqueue: (task) => task(),
    recordSyncedHash: (rel, hash) => {
      hashes.set(rel, hash)
    },
    removeSyncedHash: (rel) => {
      hashes.delete(rel)
    },
  }
  const flusher = new FolderFlusher({
    folder,
    rootCanvasId: 'root',
    source,
    suppression,
    frontmatter,
    logger,
    debounceMs: 5,
    ...flusherOverrides,
  })
  flusher.arm()
  return {
    folder,
    adopted,
    flusher,
    frontmatter,
    suppression,
    converter: new ContentConverter(),
    hashes,
  }
}

describe('FolderFlusher', () => {
  it('never rewrites an EXISTING note file on a fragment update (fileWriteCount stays 0)', async () => {
    // Mission A4.1: content for an existing node is owned exclusively by
    // SyncOrchestrator.handleNoteSave (the user-edit autosave, A1). Fragment
    // churn from ingest/renderer mount normalization must never round-trip to
    // disk — that was the write-back-storm defect.
    const original = '---\ntitle: My Note\ntags:\n  - a\n  - b\n---\n\n# Heading\n\nOriginal body.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    expect(node).toBeTruthy()

    const frag = h.adopted.contentStore.getBlockNoteFragment(node.id)!
    await h.converter.updateFragmentFromMarkdown(frag, '# Heading\n\nFragment says something else now.\n', {
      nodeId: node.id,
      source: 'test',
    })

    h.flusher.noteChanged(node.id)
    await h.flusher.flushNow()

    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe(original)
    expect(h.flusher.fileWriteCount).toBe(0)
  })

  it('moves a note file byte-exactly on a UI rename even when its disk bytes diverged from the yDoc (external edit)', async () => {
    const h = await setup({ 'note.md': '# Title\n\nOriginal.\n' })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!

    // Simulate an external edit landing on disk after adoption (git checkout, an
    // agent, a text editor) — the yDoc's fragment is never told about this.
    const externalContent = '# Title\n\nExternal edit nobody told the yDoc about.\n'
    fs.writeFileSync(path.join(h.folder, 'note.md'), externalContent)

    node.name = 'renamed title'
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'note.md'))).toBe(false)
    const renamed = path.join(h.folder, 'renamed-title.md')
    expect(fs.existsSync(renamed)).toBe(true)
    // Byte-exact move of whatever was actually on disk — not a re-serialized
    // fragment, so the external edit survives the move untouched.
    expect(fs.readFileSync(renamed, 'utf-8')).toBe(externalContent)
  })

  it('creates a new .md file with content and a metadata entry for a UI-created note', async () => {
    const h = await setup({ 'existing.md': '# Existing\n' })
    const id = randomUUID()
    const newNode: NodeItem = {
      kind: 'node',
      id,
      name: 'brand new note',
      xynode: { id, type: 'blockNote', position: { x: 40, y: 80 }, data: {} } as NodeItem['xynode'],
    }
    h.adopted.proxy.root.items.push(newNode)
    h.adopted.contentStore.createNoteDoc(id, 'blockNote')
    const frag = h.adopted.contentStore.getBlockNoteFragment(id)!
    await h.converter.updateFragmentFromMarkdown(frag, '# Brand New\n\nFresh content.\n', {
      nodeId: id,
      source: 'test',
    })

    h.flusher.rootChanged()
    h.flusher.noteChanged(id)
    await h.flusher.flushNow()

    const created = path.join(h.folder, 'brand-new-note.md')
    expect(fs.existsSync(created)).toBe(true)
    expect(fs.readFileSync(created, 'utf-8')).toContain('Fresh content.')
    const meta = readMeta(h.folder, '')
    const ids = (meta.nodes as Array<{ id: string }>).map((n) => n.id)
    expect(ids).toContain(id)
  })

  it('creates metadata entries for UI-created sticky/text/link nodes', async () => {
    const h = await setup({ 'existing.md': '# Existing\n' })
    const textId = randomUUID()
    const linkId = randomUUID()
    h.adopted.proxy.root.items.push({
      kind: 'node',
      id: textId,
      name: 'a text',
      xynode: { id: textId, type: 'text', position: { x: 10, y: 10 }, data: { content: 'hello world' } },
    } as NodeItem)
    h.adopted.proxy.root.items.push({
      kind: 'node',
      id: linkId,
      name: 'a link',
      xynode: {
        id: linkId,
        type: 'link',
        position: { x: 20, y: 20 },
        data: { url: 'https://example.com', loadingStatus: 'loaded' },
      },
    } as NodeItem)

    h.flusher.rootChanged()
    await h.flusher.flushNow()

    const meta = readMeta(h.folder, '')
    const nodes = meta.nodes as Array<{ id: string; xynode: { type: string; data: Record<string, unknown> } }>
    const textEntry = nodes.find((n) => n.id === textId)
    const linkEntry = nodes.find((n) => n.id === linkId)
    expect(textEntry?.xynode.type).toBe('text')
    expect(textEntry?.xynode.data.content).toBe('hello world')
    expect(linkEntry?.xynode.data.url).toBe('https://example.com')
    // text/link are metadata-only: no backing file.
    expect(fs.existsSync(path.join(h.folder, 'a-text.text.yaml'))).toBe(false)
    expect(fs.existsSync(path.join(h.folder, 'a-link.url.yaml'))).toBe(false)
  })

  it('renames a node file byte-exactly, preserving id and edges', async () => {
    const original = '---\nkeep: me\n---\n\n# Title\n\nUnchanged content.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    const nodeId = node.id
    const beforeBytes = fs.readFileSync(path.join(h.folder, 'note.md'))
    // Add an edge referencing the node to assert edges survive the rename.
    h.adopted.proxy.root.edges.push({ id: 'e1', source: nodeId, target: nodeId })

    node.name = 'renamed title'
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'note.md'))).toBe(false)
    const renamed = path.join(h.folder, 'renamed-title.md')
    expect(fs.existsSync(renamed)).toBe(true)
    // Byte-exact move (frontmatter + body identical).
    expect(fs.readFileSync(renamed).equals(beforeBytes)).toBe(true)

    const meta = readMeta(h.folder, '')
    const nodes = meta.nodes as Array<{ id: string; name: string }>
    expect(nodes.find((n) => n.id === nodeId)?.name).toBe('renamed title')
    expect(meta.edges).toEqual([{ id: 'e1', source: nodeId, target: nodeId }])
  })

  it('renames a canvas directory when the canvas is renamed in the UI, preserving id and contents', async () => {
    const h = await setup({ 'projects/note.md': '# Note\n\nKeep me.\n' })
    const child = findCanvas(h.adopted.proxy.root, (c) => sanitizeFilename(c.name) === 'projects')!
    expect(child).toBeTruthy()
    const childId = child.id
    const noteBytesBefore = fs.readFileSync(path.join(h.folder, 'projects', 'note.md'))

    child.name = 'Reports'
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    // Old directory is gone; the new one holds the same (byte-identical) contents.
    expect(fs.existsSync(path.join(h.folder, 'projects'))).toBe(false)
    expect(fs.existsSync(path.join(h.folder, 'reports'))).toBe(true)
    expect(fs.readFileSync(path.join(h.folder, 'reports', 'note.md')).equals(noteBytesBefore)).toBe(true)
    // Canvas identity is preserved in the moved sidecar (rename, not delete+create).
    expect(readMeta(h.folder, 'reports').id).toBe(childId)

    // The runtime suppression-tags its own move so the watcher drops the echo
    // (old paths deleted, new content-write recognised) — no re-ingested duplicate.
    expect(h.suppression.consumeDelete('projects')).toBe(true)
    expect(h.suppression.consumeDelete('projects/note.md')).toBe(true)
    expect(h.suppression.consumeWrite('reports/note.md', noteBytesBefore)).toBe(true)
  })

  it('renaming a parent canvas moves its child-canvas subtree along with it', async () => {
    const h = await setup({ 'parent/child/note.md': '# Nested\n\nDeep.\n' })
    const parent = findCanvas(h.adopted.proxy.root, (c) => sanitizeFilename(c.name) === 'parent')!
    const childCanvas = findCanvas(parent, (c) => sanitizeFilename(c.name) === 'child')!
    const childId = childCanvas.id

    parent.name = 'Renamed Parent'
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'parent'))).toBe(false)
    // The whole subtree moved under the new parent name (single top-most rename).
    expect(fs.existsSync(path.join(h.folder, 'renamed-parent', 'child', 'note.md'))).toBe(true)
    expect(readMeta(h.folder, 'renamed-parent/child').id).toBe(childId)
  })

  it('leaves an adopted directory whose name already matches the canvas untouched', async () => {
    // A structural flush that does NOT rename a canvas must not disturb an adopted
    // directory whose original (unsanitized) name sanitizes to the canvas name.
    const h = await setup({ 'My Notes/note.md': '# Hi\n' })
    const child = findCanvas(h.adopted.proxy.root, () => true)!
    // Trigger a structural flush unrelated to this canvas's name.
    child.xynode.position = { x: 123, y: 456 }
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'My Notes', 'note.md'))).toBe(true)
  })

  it('updates only metadata position on a drag, leaving note bytes untouched', async () => {
    const h = await setup({ 'note.md': '# Title\n\nBody stays.\n' })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    const before = sha(path.join(h.folder, 'note.md'))

    node.xynode.position = { x: 999, y: 1234 }
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    // .md bytes are untouched (checksum) — no round-trip on a structural-only edit.
    expect(sha(path.join(h.folder, 'note.md'))).toBe(before)
    const meta = readMeta(h.folder, '')
    const entry = (meta.nodes as Array<{ id: string; xynode: { position: { x: number; y: number } } }>).find(
      (n) => n.id === node.id
    )
    expect(entry?.xynode.position).toEqual({ x: 999, y: 1234 })
  })

  it('moves a deleted node file to .kanwas/trash and drops it from metadata', async () => {
    const h = await setup({ 'keep.md': '# Keep\n', 'gone.md': '# Gone\n' })
    const gone = findNode(h.adopted.proxy.root, (n) => n.name === 'gone')!
    const idx = h.adopted.proxy.root.items.findIndex((i) => i.kind === 'node' && i.id === gone.id)
    h.adopted.proxy.root.items.splice(idx, 1)

    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'gone.md'))).toBe(false)
    expect(fs.existsSync(path.join(h.folder, 'keep.md'))).toBe(true)
    const trashRoot = path.join(h.folder, '.kanwas', 'trash')
    expect(fs.existsSync(trashRoot)).toBe(true)
    const stamps = fs.readdirSync(trashRoot)
    const trashed = stamps.some((s) => fs.existsSync(path.join(trashRoot, s, 'gone.md')))
    expect(trashed).toBe(true)
    const meta = readMeta(h.folder, '')
    expect((meta.nodes as Array<{ name: string }>).some((n) => n.name === 'gone')).toBe(false)
  })

  it('trashes a UI-created node with a display name (metadata name unsanitized)', async () => {
    // Regression: UI-created nodes store display names ("New Document") in
    // metadata while the file stem is sanitized — the disk index must sanitize
    // BOTH sides or the delete reconcile cannot find the file to trash.
    const h = await setup({ 'existing.md': '# Existing\n' })
    const id = randomUUID()
    h.adopted.proxy.root.items.push({
      kind: 'node',
      id,
      name: 'New Document',
      xynode: { id, type: 'blockNote', position: { x: 5, y: 5 }, data: {} },
    } as NodeItem)
    h.adopted.contentStore.createNoteDoc(id, 'blockNote')
    const frag = h.adopted.contentStore.getBlockNoteFragment(id)!
    await h.converter.updateFragmentFromMarkdown(frag, '# Doomed\n', { nodeId: id, source: 'test' })
    h.flusher.rootChanged()
    h.flusher.noteChanged(id)
    await h.flusher.flushNow()
    expect(fs.existsSync(path.join(h.folder, 'new-document.md'))).toBe(true)

    // Now delete it from the tree (as the UI confirm-delete does).
    const idx = h.adopted.proxy.root.items.findIndex((i) => i.kind === 'node' && i.id === id)
    h.adopted.proxy.root.items.splice(idx, 1)
    h.adopted.contentStore.deleteNoteDoc(id)
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'new-document.md'))).toBe(false)
    const trashRoot = path.join(h.folder, '.kanwas', 'trash')
    const trashed = fs.readdirSync(trashRoot).some((s) => fs.existsSync(path.join(trashRoot, s, 'new-document.md')))
    expect(trashed).toBe(true)
  })

  it('moves a binary file when its node is renamed, preserving bytes and updating storagePath', async () => {
    const h = await setup({ 'logo.png': PNG_1x1, 'keep.md': '# Keep\n' })
    const img = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'image')!
    expect(img).toBeTruthy()
    const beforeBytes = fs.readFileSync(path.join(h.folder, 'logo.png'))

    // Rename the binary node in the UI (name only; storagePath still points at logo.png).
    img.name = 'brand mark'
    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'logo.png'))).toBe(false)
    const moved = path.join(h.folder, 'brand-mark.png')
    expect(fs.existsSync(moved)).toBe(true)
    // Bytes are byte-identical (no re-encode).
    expect(fs.readFileSync(moved).equals(beforeBytes)).toBe(true)
    // storagePath updated so the renderer re-resolves to the new path.
    expect((img.xynode.data as { storagePath?: string }).storagePath).toBe('brand-mark.png')
    // metadata.yaml reflects the new storagePath.
    const meta = readMeta(h.folder, '')
    const entry = (meta.nodes as Array<{ id: string; xynode: { data: { storagePath?: string } } }>).find(
      (n) => n.id === img.id
    )
    expect(entry?.xynode.data.storagePath).toBe('brand-mark.png')
  })

  it('trashes a binary file when its node is deleted', async () => {
    const h = await setup({ 'photo.png': PNG_1x1, 'keep.md': '# Keep\n' })
    const img = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'image')!
    const idx = h.adopted.proxy.root.items.findIndex((i) => i.kind === 'node' && i.id === img.id)
    h.adopted.proxy.root.items.splice(idx, 1)

    h.flusher.rootChanged()
    await h.flusher.flushNow()

    expect(fs.existsSync(path.join(h.folder, 'photo.png'))).toBe(false)
    const trashRoot = path.join(h.folder, '.kanwas', 'trash')
    const trashed = fs.readdirSync(trashRoot).some((s) => fs.existsSync(path.join(trashRoot, s, 'photo.png')))
    expect(trashed).toBe(true)
    // The binary is gone from metadata too.
    const meta = readMeta(h.folder, '')
    expect((meta.nodes as Array<{ id: string }>).some((n) => n.id === img.id)).toBe(false)
  })

  it('is non-destructive: a flush with no changes rewrites nothing (checksums hold)', async () => {
    const h = await setup({
      'a.md': '# A\n\nAlpha.\n',
      'sub/b.md': '# B\n\nBeta.\n',
    })
    const files = ['a.md', 'sub/b.md', 'metadata.yaml', 'sub/metadata.yaml']
    const before = Object.fromEntries(files.map((f) => [f, sha(path.join(h.folder, f))]))

    h.flusher.rootChanged()
    await h.flusher.flushNow()

    for (const f of files) {
      expect(sha(path.join(h.folder, f))).toBe(before[f])
    }
    expect(h.flusher.fileWriteCount).toBe(0)
  })

  it('debounces a burst of note edits into a single flush (and never rewrites the existing file)', async () => {
    const h = await setup({ 'note.md': '# Title\n\nBody.\n' })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    const frag = h.adopted.contentStore.getBlockNoteFragment(node.id)!

    let flushes = 0
    const origReconcile = (h.flusher as unknown as { reconcile: (...a: unknown[]) => Promise<void> }).reconcile.bind(
      h.flusher
    )
    ;(h.flusher as unknown as { reconcile: (...a: unknown[]) => Promise<void> }).reconcile = async (...a) => {
      flushes++
      return origReconcile(...a)
    }

    for (let i = 0; i < 20; i++) {
      await h.converter.updateFragmentFromMarkdown(frag, `# Title\n\nBody ${i}.\n`, { nodeId: node.id, source: 'test' })
      h.flusher.noteChanged(node.id)
    }
    await h.flusher.flushNow()

    expect(flushes).toBe(1)
    // The burst coalesces into one flush, but per A4.1 an existing node's file is
    // never rewritten regardless — bytes stay exactly what they were.
    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe('# Title\n\nBody.\n')
    expect(h.flusher.fileWriteCount).toBe(0)
  })

  it('stop() runs a pending debounced flush to completion before resolving', async () => {
    // A4.1: content edits no longer produce a write, so exercise the "pending
    // work survives stop()" guarantee with a structural change (rename → move).
    const h = await setup({ 'note.md': '# Title\n\nOriginal.\n' })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    node.name = 'renamed before stop'
    h.flusher.rootChanged() // schedules a debounced flush (5ms) but is never awaited directly

    await h.flusher.stop()

    expect(fs.existsSync(path.join(h.folder, 'renamed-before-stop.md'))).toBe(true)
  })

  it('restores dirty state and reschedules a flush when reconcile throws', async () => {
    // A4.1: content edits no longer produce a write, so exercise the retry-after-
    // failure guarantee with a structural change (a position update to metadata.yaml).
    const h = await setup({ 'note.md': '# Title\n\nOriginal.\n' })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!

    const internals = h.flusher as unknown as { reconcile: (...a: unknown[]) => Promise<void> }
    const origReconcile = internals.reconcile.bind(h.flusher)
    let calls = 0
    internals.reconcile = async (...a: unknown[]) => {
      calls++
      if (calls === 1) throw new Error('boom')
      return origReconcile(...a)
    }

    node.xynode.position = { x: 42, y: 42 }
    h.flusher.rootChanged()
    await h.flusher.flushNow() // first attempt throws; dirty state must be restored + rescheduled

    expect(calls).toBe(1)
    const positionOf = (): { x: number; y: number } | undefined =>
      (readMeta(h.folder, '').nodes as Array<{ id: string; xynode: { position: { x: number; y: number } } }>).find(
        (n) => n.id === node.id
      )?.xynode.position
    expect(positionOf()).not.toEqual({ x: 42, y: 42 })

    await h.flusher.flushNow() // retry (the reschedule from the failure) succeeds
    expect(calls).toBe(2)
    expect(positionOf()).toEqual({ x: 42, y: 42 })
  })

  it('flushes within maxWaitMs even when repeated edits keep resetting the debounce timer', async () => {
    const h = await setup({ 'note.md': '# Title\n\nOriginal.\n' }, { debounceMs: 10_000, maxWaitMs: 100 })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!

    vi.useFakeTimers()
    try {
      let flushed = false
      const internals = h.flusher as unknown as { doFlush: () => Promise<void> }
      const origDoFlush = internals.doFlush.bind(h.flusher)
      internals.doFlush = async () => {
        flushed = true
        await origDoFlush()
      }

      h.flusher.noteChanged(node.id) // t=0: arms the maxWait clock; debounce timer is far in the future
      await vi.advanceTimersByTimeAsync(60)
      h.flusher.noteChanged(node.id) // t=60: resets the debounce timer, but NOT the maxWait clock
      expect(flushed).toBe(false)

      await vi.advanceTimersByTimeAsync(45) // t=105 > pendingSince(0) + maxWaitMs(100)
      expect(flushed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
