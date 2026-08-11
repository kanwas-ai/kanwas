import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PathMapper } from 'shared'
import type { CanvasItem, WorkspaceDocument } from 'shared'
import { adoptFolder } from '../src/adopt.js'
import { MetadataManager } from '../src/metadata-manager.js'
import { createLogger } from '../src/logger.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeFolder(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwasd-adopt-'))
  tmpDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

function findNodeIdByName(root: CanvasItem | undefined, name: string): string | undefined {
  if (!root) return undefined
  for (const item of root.items) {
    if (item.kind === 'node') {
      if (item.name === name) return item.id
    } else {
      const found = findNodeIdByName(item, name)
      if (found) return found
    }
  }
  return undefined
}

function walkIds(root: CanvasItem | undefined): string[] {
  const ids: string[] = []
  const walk = (canvas: CanvasItem | undefined) => {
    if (!canvas) return
    ids.push(`canvas:${canvas.id}`)
    for (const item of canvas.items) {
      if (item.kind === 'node') ids.push(`node:${item.id}`)
      else walk(item)
    }
  }
  walk(root)
  return ids.sort()
}

/** Materialize sidecars from an adopted proxy exactly as the daemon does at boot. */
async function materializeSidecars(folder: string, proxy: WorkspaceDocument): Promise<void> {
  const pm = new PathMapper()
  pm.buildFromWorkspace(proxy)
  const findCanvasById = (id: string): CanvasItem | undefined => {
    const walk = (c: CanvasItem | undefined): CanvasItem | undefined => {
      if (!c) return undefined
      if (c.id === id) return c
      for (const item of c.items)
        if (item.kind === 'canvas') {
          const f = walk(item)
          if (f) return f
        }
      return undefined
    }
    return walk(proxy.root)
  }
  const listCanvasIds = (): string[] => {
    const ids: string[] = []
    const walk = (c: CanvasItem | undefined) => {
      if (!c) return
      ids.push(c.id)
      for (const item of c.items) if (item.kind === 'canvas') walk(item)
    }
    walk(proxy.root)
    return ids
  }
  const mm = new MetadataManager({
    logger,
    workspacePath: folder,
    findCanvasById,
    getCanvasPathById: (id) => pm.getPathForCanvas(id),
    listCanvasIds,
  })
  await mm.materializeMissing(async (canvasPath) => {
    const dir = canvasPath.length === 0 ? folder : path.join(folder, canvasPath)
    return fs.existsSync(path.join(dir, 'metadata.yaml'))
  })
}

const FIXTURE = {
  'README.md': '# Readme\n\nRoot note.\n',
  'notes.md': '# Notes\n\nAnother root note.\n',
  'writing/draft.md': '# Draft\n\nNested note.\n',
  'writing/deep/leaf.md': '# Leaf\n\nDeeply nested.\n',
}

describe('adoptFolder', () => {
  it('adopts a folder into a yDoc without writing to it', async () => {
    const folder = makeFolder(FIXTURE)
    const before = fs.readFileSync(path.join(folder, 'README.md'), 'utf-8')

    const adopted = await adoptFolder({ folder, rootId: 'root', logger })
    expect(adopted.nodeCount).toBe(4)
    expect(adopted.canvasCount).toBe(3) // root + writing + writing/deep
    expect(adopted.seededEmpty).toBe(false)
    // adoptFolder itself writes nothing to the folder.
    expect(fs.existsSync(path.join(folder, '.kanwas'))).toBe(false)
    expect(fs.readFileSync(path.join(folder, 'README.md'), 'utf-8')).toBe(before)
    adopted.yDoc.destroy()
  })

  it('preserves node + canvas ids across a restart (metadata-first)', async () => {
    const folder = makeFolder(FIXTURE)

    // Run 1: fresh ids, then materialize sidecars (as the daemon does at boot).
    const first = await adoptFolder({ folder, rootId: 'root', logger })
    const idsA = walkIds(first.proxy.root)
    await materializeSidecars(folder, first.proxy)
    first.yDoc.destroy()

    // Run 2: re-adopt from the sidecars.
    const second = await adoptFolder({ folder, rootId: 'root', logger })
    const idsB = walkIds(second.proxy.root)

    expect(idsB).toEqual(idsA)
    expect(idsA.length).toBe(4 + 3) // 4 nodes + 3 canvases
    second.yDoc.destroy()
  })

  it('does not modify pre-existing files across an adopt→materialize→adopt round-trip', async () => {
    const folder = makeFolder(FIXTURE)
    const hashes = () =>
      Object.keys(FIXTURE)
        .sort()
        .map((rel) =>
          createHash('sha256')
            .update(fs.readFileSync(path.join(folder, rel)))
            .digest('hex')
        )

    const baseline = hashes()
    const first = await adoptFolder({ folder, rootId: 'root', logger })
    await materializeSidecars(folder, first.proxy)
    first.yDoc.destroy()
    const second = await adoptFolder({ folder, rootId: 'root', logger })
    second.yDoc.destroy()

    expect(hashes()).toEqual(baseline)
  })

  it('seeds a welcome note for an empty folder', async () => {
    const folder = makeFolder({})
    const adopted = await adoptFolder({ folder, rootId: 'root', logger })
    expect(adopted.seededEmpty).toBe(true)
    expect(adopted.nodeCount).toBe(1)
    adopted.yDoc.destroy()
  })

  it('recovers node identity across an offline .md rename (unambiguous 1:1)', async () => {
    const folder = makeFolder(FIXTURE)
    const first = await adoptFolder({ folder, rootId: 'root', logger })
    const notesId = findNodeIdByName(first.proxy.root, 'notes')
    expect(notesId).toBeTruthy()
    await materializeSidecars(folder, first.proxy)
    first.yDoc.destroy()

    // Rename the file while the daemon is off (content unchanged). The sidecar
    // still lists "notes"; only journal.md exists on disk.
    fs.renameSync(path.join(folder, 'notes.md'), path.join(folder, 'journal.md'))

    const second = await adoptFolder({ folder, rootId: 'root', logger })
    expect(second.nodeCount).toBe(4) // no ghost, no duplicate
    // The renamed file kept the ORIGINAL node id, and follows the new filename.
    const journalId = findNodeIdByName(second.proxy.root, 'journal')
    expect(journalId).toBe(notesId)
    expect(findNodeIdByName(second.proxy.root, 'notes')).toBeUndefined()
    second.yDoc.destroy()
  })

  it('offline renames it cannot disambiguate yield no ghost/duplicate nodes', async () => {
    const folder = makeFolder(FIXTURE)
    const first = await adoptFolder({ folder, rootId: 'root', logger })
    await materializeSidecars(folder, first.proxy)
    first.yDoc.destroy()

    // Rename BOTH root notes → ambiguous (2 fileless nodes, 2 unmapped files).
    fs.renameSync(path.join(folder, 'README.md'), path.join(folder, 'alpha.md'))
    fs.renameSync(path.join(folder, 'notes.md'), path.join(folder, 'beta.md'))

    const second = await adoptFolder({ folder, rootId: 'root', logger })
    // Still exactly 4 nodes — the 2 stale reconstructions were pruned and 2 fresh
    // nodes represent alpha.md/beta.md. No ghosts, no duplicates.
    expect(second.nodeCount).toBe(4)
    const nodeIds = walkIds(second.proxy.root).filter((s) => s.startsWith('node:'))
    expect(new Set(nodeIds).size).toBe(4)
    second.yDoc.destroy()
  })

  it('prunes a reconstructed node whose backing file was deleted while offline', async () => {
    const folder = makeFolder(FIXTURE)
    const first = await adoptFolder({ folder, rootId: 'root', logger })
    await materializeSidecars(folder, first.proxy)
    first.yDoc.destroy()

    // Delete a note file while the "daemon" is off.
    fs.rmSync(path.join(folder, 'notes.md'))

    const second = await adoptFolder({ folder, rootId: 'root', logger })
    expect(second.nodeCount).toBe(3) // notes.md pruned
    const names = walkIds(second.proxy.root).filter((s) => s.startsWith('node:'))
    expect(names.length).toBe(3)
    second.yDoc.destroy()
  })
})
