// Mission A5 — end-to-end regression suite for the content-plane re-architecture
// (plan/content-plane-rearchitecture.md). Exercises the COMPOSED system — adoptFolder
// ingest, FolderFlusher reconcile cycles, and SyncOrchestrator.handleNoteSave (the real
// save path) — against every documented defect trigger from the 2026-08-10 defect
// report, using the same harness patterns as rename-integration.test.ts and
// sync-orchestrator-note-save.test.ts.
//
// NOT duplicated here (already covered elsewhere per Mission A4):
//  - "never rewrites an EXISTING note file on a fragment update" — folder-flusher.test.ts
//  - "moves a note file byte-exactly ... even when disk bytes diverged" — folder-flusher.test.ts
//  - the git-mv ghost-sidecar regression — rename-integration.test.ts + metadata-write.test.ts
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
import { PathMapper } from 'shared'
import type { CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { convertWorkspaceInterlinksToLinksInBlocks } from 'shared/workspace-interlink'
import { postProcessExportedMarkdown } from 'shared/markdown-fidelity'
import { ContentConverter, FilesystemSyncer, createServerBlockNoteEditor } from 'shared/server'
import { adoptFolder, type AdoptResult } from '../src/adopt.js'
import { rebuildDiskAlignedMappings } from '../src/disk-align.js'
import { readFileBinary } from '../src/filesystem.js'
import { FolderFlusher, type FlusherSource } from '../src/folder-flusher.js'
import { FrontmatterRegistry } from '../src/frontmatter-registry.js'
import { splitFrontmatter } from '../src/frontmatter.js'
import { createLogger } from '../src/logger.js'
import { MetadataManager } from '../src/metadata-manager.js'
import { SuppressionRegistry } from '../src/suppression.js'
import { SyncOrchestrator } from '../src/sync-orchestrator.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeFolder(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwasd-content-plane-'))
  tmpDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
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

/** Materialize sidecars from an adopted proxy exactly as the daemon does at boot (mirrors folder-flusher.test.ts). */
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

/** Recursively list every file under `dir` (relative POSIX paths), including dotfiles/`.kanwas`. */
function listAllFilesRecursive(dir: string, relDir = ''): string[] {
  const out: string[] = []
  const absDir = relDir.length === 0 ? dir : path.join(dir, relDir)
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir.length === 0 ? entry.name : `${relDir}/${entry.name}`
    if (entry.isDirectory()) out.push(...listAllFilesRecursive(dir, rel))
    else out.push(rel)
  }
  return out
}

/** Byte-exact snapshot of the whole tree (path -> base64 bytes), re-scanned each call so new/removed files are caught too. */
function snapshotTree(folder: string): Record<string, string> {
  const files = listAllFilesRecursive(folder).sort()
  return Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(folder, f)).toString('base64')]))
}

interface Harness {
  folder: string
  orchestrator: SyncOrchestrator
  flusher: FolderFlusher
  adopted: AdoptResult
  pathMapper: PathMapper
  syncer: FilesystemSyncer
  contentConverter: ContentConverter
}

/**
 * Boot adoptFolder + a disk-aligned PathMapper + a FilesystemSyncer (for simulated
 * re-ingest) + SyncOrchestrator.handleNoteSave (private disk-facing state injected,
 * same escape hatch as sync-orchestrator-note-save.test.ts) + a FolderFlusher wired
 * to the SAME live tree/content store (same pattern as folder-flusher.test.ts). No
 * live yjs socket, no watchers — this is a synchronous, self-contained harness.
 */
async function setup(files: Record<string, string>): Promise<Harness> {
  const folder = makeFolder(files)
  const frontmatter = new FrontmatterRegistry()
  const suppression = new SuppressionRegistry()
  const adopted = await adoptFolder({ folder, rootId: 'root', logger, frontmatter })
  await materializeSidecars(folder, adopted.proxy)

  const pathMapper = new PathMapper()
  rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder)
  const contentConverter = new ContentConverter()

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
  Object.assign(orchestrator as unknown as Record<string, unknown>, {
    pathMapper,
    connection: { proxy: adopted.proxy },
  })

  const syncer = new FilesystemSyncer({
    proxy: adopted.proxy,
    yDoc: adopted.yDoc,
    contentStore: adopted.contentStore,
    pathMapper,
    contentConverter,
    fileUploader: async () => {
      throw new Error('fileUploader not expected in this test')
    },
    fileReader: (rel) => readFileBinary(path.join(folder, rel)),
    autoCreateCanvases: true,
    directoryExists: (rel) => fs.existsSync(path.join(folder, rel)),
  })

  const source: FlusherSource = {
    root: () => adopted.proxy.root,
    noteFragment: (id) => adopted.contentStore.getBlockNoteFragment(id),
    realign: () => rebuildDiskAlignedMappings(pathMapper, adopted.proxy, folder),
    enqueue: (task) => task(),
    recordSyncedHash: () => {},
    removeSyncedHash: () => {},
  }
  const flusher = new FolderFlusher({
    folder,
    rootCanvasId: 'root',
    source,
    suppression,
    frontmatter,
    logger,
    debounceMs: 5,
  })
  flusher.arm()

  return { folder, orchestrator, flusher, adopted, pathMapper, syncer, contentConverter }
}

function sha(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function strayHardBreakCount(markdown: string): number {
  return (markdown.match(/^\\$/gm) ?? []).length
}

// Every defect trigger from the 2026-08-10 defect report / plan item 1, combined into
// one fixture: <topic>/<date>-style prose placeholders, a `# /recall <query>`-style
// heading, a soft-wrapped paragraph, a trailing-`\` hard break line, `-` bullets,
// `[Brackets]`, `snake_case_word`, `~02:37`, a `---` rule, a fenced code block
// containing `<tags>` and a lone `\` line, and a table.
const KITCHEN_SINK_FIXTURE = [
  '# /recall <query>',
  '',
  'Notes for a session live under thinking/<topic>/<date> so recall can find them later.',
  'Started around ~02:37 with a snake_case_word and some [Brackets] to check literal',
  'survival. This paragraph is soft-wrapped across a couple of lines to make sure',
  'ordinary wrapping is left alone.',
  '',
  'line one\\',
  'line two',
  '',
  '- first item',
  '- second item',
  '- third item',
  '',
  '---',
  '',
  '| Name | Value |',
  '| --- | --- |',
  '| a | 1 |',
  '| b | 2 |',
  '',
  '```text',
  '<tags>keep me literal</tags>',
  '\\',
  '```',
  '',
].join('\n')

const STICKY_FIXTURE_CONTENT = ['Remember to check <topic> before ~09:15.', '', 'line one\\', 'line two', ''].join('\n')

describe('Mission A5 — content-plane end-to-end regression suite', () => {
  it('idle soak: ingest + repeated fragment churn + multiple flush cycles write zero bytes to disk', async () => {
    const stickyYamlText = yaml.stringify({ content: STICKY_FIXTURE_CONTENT, color: 'yellow' })
    const h = await setup({
      'thinking.md': KITCHEN_SINK_FIXTURE,
      'control.md': '# Control\n\nUntouched by any churn.\n',
      'quick-note.sticky.yaml': stickyYamlText,
    })

    const before = snapshotTree(h.folder)

    const noteNode = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    const stickyNode = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'stickyNote')!
    const noteRel = h.pathMapper.getPathForNode(noteNode.id)!
    const stickyRel = h.pathMapper.getPathForNode(stickyNode.id)!
    const noteFrag = h.adopted.contentStore.getBlockNoteFragment(noteNode.id)!
    const stickyFrag = h.adopted.contentStore.getBlockNoteFragment(stickyNode.id)!

    for (let i = 0; i < 5; i++) {
      // "daemon ingest" churn: the watcher re-detecting an unchanged file (a
      // suppression miss, an editor `touch`, a re-scan) replays the exact same
      // syncChange the daemon ran at boot — same content, no user edit. Assert the
      // churn is REAL (not a silently-swallowed no-op) so a zero-write result below
      // is actually proving something.
      const noteChurn = await h.syncer.syncChange({ type: 'update', path: noteRel, content: KITCHEN_SINK_FIXTURE })
      expect(noteChurn.success && noteChurn.action).toBe('updated_content')
      const stickyChurn = await h.syncer.syncChange({ type: 'update', path: stickyRel, content: stickyYamlText })
      expect(stickyChurn.success && stickyChurn.action).toBe('updated_content')
      h.flusher.noteChanged(noteNode.id)
      h.flusher.noteChanged(stickyNode.id)

      // "frontend mount-normalization" churn: BlockNote re-parses/re-serializes a
      // fragment on every mount even with no user input — approximated by a no-op
      // markdown round trip straight on the fragment. (updateFragmentFromMarkdown
      // throws on failure rather than swallowing it, so a bare await is a real assertion.)
      const mountedNote = await h.contentConverter.fragmentToMarkdown(noteFrag)
      expect(mountedNote.length).toBeGreaterThan(0)
      await h.contentConverter.updateFragmentFromMarkdown(noteFrag, mountedNote, {
        nodeId: noteNode.id,
        source: 'test-mount-normalize',
      })
      const mountedSticky = await h.contentConverter.fragmentToMarkdown(stickyFrag)
      expect(mountedSticky.length).toBeGreaterThan(0)
      await h.contentConverter.updateFragmentFromMarkdown(stickyFrag, mountedSticky, {
        nodeId: stickyNode.id,
        source: 'test-mount-normalize',
      })
      h.flusher.noteChanged(noteNode.id)
      h.flusher.noteChanged(stickyNode.id)

      h.flusher.rootChanged()
      await h.flusher.flushNow()
    }

    // A few more idle reconcile cycles with nothing freshly dirtied.
    h.flusher.rootChanged()
    await h.flusher.flushNow()
    await h.flusher.flushNow()

    const after = snapshotTree(h.folder)
    expect(after).toEqual(before)
    expect(h.flusher.fileWriteCount).toBe(0)
  })

  it('round-trip growth: five user-edit save cycles through the real save path never grow trailing-`\\` count and converge', async () => {
    const original = [
      '# Thinking about <topic>',
      '',
      'line one\\',
      'line two',
      '',
      'More context on <topic> lives here.',
      '',
    ].join('\n')
    const h = await setup({ 'note.md': original })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!
    const rel = h.pathMapper.getPathForNode(node.id)!
    const frag = h.adopted.contentStore.getBlockNoteFragment(node.id)!
    const editor = createServerBlockNoteEditor()
    const initialCount = strayHardBreakCount(original)

    let baseHash: string | undefined
    const diskSnapshots: string[] = []

    for (let i = 0; i < 5; i++) {
      // (a) Serialize the fragment exactly the way the frontend autosave hook does
      //     (useNoteFileAutosave.ts putOnce): editor.document -> interlinks-to-links
      //     -> blocksToMarkdownLossy -> postProcessExportedMarkdown. `editor.document`
      //     for a detached-from-React fragment is `editor.yXmlFragmentToBlocks(frag)`.
      const blocks = editor.yXmlFragmentToBlocks(frag)
      const linkedBlocks = convertWorkspaceInterlinksToLinksInBlocks(blocks)
      const raw = await editor.blocksToMarkdownLossy(linkedBlocks as Parameters<typeof editor.blocksToMarkdownLossy>[0])
      const body = postProcessExportedMarkdown(raw)

      // (b) The real save path.
      const result = await h.orchestrator.handleNoteSave({ nodeId: node.id, body, baseHash })
      expect(result.status).toBe(200)
      if (result.status !== 200) throw new Error('unreachable')
      baseHash = result.hash

      const diskBytes = fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')
      diskSnapshots.push(diskBytes)
      expect(strayHardBreakCount(diskBytes)).toBeLessThanOrEqual(initialCount)
      expect(diskBytes).toMatch(/\\?<topic>/)

      // (c) Re-ingest the resulting disk bytes via the syncer — simulating what would
      //     happen if suppression ever missed the daemon's own atomic write.
      const { body: reIngestBody } = splitFrontmatter(diskBytes)
      await h.syncer.syncChange({ type: 'update', path: rel, content: reIngestBody })
    }

    // Converged: the last pass produced byte-identical output to the one before it.
    expect(diskSnapshots[4]).toBe(diskSnapshots[3])
    expect(sha(diskSnapshots[4])).toBe(baseHash)
  })

  it('external-edit-wins: a stale-baseHash save is rejected and disk keeps the external agent bytes untouched', async () => {
    const original = '# Notes on <topic>\n\nOriginal body.\n'
    const h = await setup({ 'note.md': original })
    const node = findNode(h.adopted.proxy.root, (n) => n.xynode.type === 'blockNote')!

    // Establish a hash via a real user-edit save (the daemon's normal write path).
    const firstSave = await h.orchestrator.handleNoteSave({
      nodeId: node.id,
      body: '# Notes on <topic>\n\nEdited by the UI.\n',
    })
    expect(firstSave.status).toBe(200)
    if (firstSave.status !== 200) throw new Error('unreachable')
    const staleHash = firstSave.hash

    // An external agent (git checkout, a CLI coding agent, a text editor) lands a
    // change directly on disk after the UI editor last saw the file — its baseHash
    // is now stale.
    const externalBytes = '# Notes on <topic>\n\nRewritten entirely by an external agent.\n'
    fs.writeFileSync(path.join(h.folder, 'note.md'), externalBytes)

    const conflict = await h.orchestrator.handleNoteSave({
      nodeId: node.id,
      body: '# Notes on <topic>\n\nStale UI buffer trying to overwrite.\n',
      baseHash: staleHash,
      force: false,
    })
    expect(conflict.status).toBe(409)
    if (conflict.status === 409) expect(conflict.diskHash).toBe(sha(externalBytes))

    // Disk keeps the external agent's bytes, byte-exact — the unforced conflict never writes.
    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe(externalBytes)

    // The flusher must not clobber it either — the content-ownership boundary (A4.1)
    // holds even when disk has diverged from the yDoc's fragment.
    h.flusher.rootChanged()
    h.flusher.noteChanged(node.id)
    await h.flusher.flushNow()
    expect(fs.readFileSync(path.join(h.folder, 'note.md'), 'utf-8')).toBe(externalBytes)
    expect(h.flusher.fileWriteCount).toBe(0)
  })
})
