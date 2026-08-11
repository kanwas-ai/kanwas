// Mission A4.2 — deterministic unit coverage for the `writeMetadataYaml`
// createDir contract and `MetadataManager.refreshCanvasMetadata`'s no-mkdir
// default. Complements rename-integration.test.ts (real fs + real chokidar
// timing, which reliably reproduces the overall git-mv outcome but does not
// deterministically hit this exact branch every run) with a fast, deterministic
// pin of the specific guard: writing a sidecar into a directory that doesn't
// exist must never resurrect it unless explicitly told to.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CanvasItem, CanvasMetadata } from 'shared'
import { writeMetadataYaml } from '../src/filesystem.js'
import { createLogger } from '../src/logger.js'
import { MetadataManager } from '../src/metadata-manager.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-metawrite-'))
  tmpDirs.push(dir)
  return dir
}

function sampleMetadata(id: string, name: string): CanvasMetadata {
  return {
    id,
    name,
    xynode: { position: { x: 0, y: 0 } },
    edges: [],
    nodes: [],
  } as unknown as CanvasMetadata
}

describe('writeMetadataYaml createDir contract', () => {
  it('createDir: false (default) skips the write and does not create the directory', async () => {
    const root = makeTmpDir()
    const ghostDir = path.join(root, 'thinking')
    expect(fs.existsSync(ghostDir)).toBe(false)

    const result = await writeMetadataYaml(ghostDir, sampleMetadata('canvas-1', 'thinking'))

    expect(result.skipped).toBe(true)
    expect(fs.existsSync(ghostDir)).toBe(false)
  })

  it('createDir: true creates the directory and writes the sidecar', async () => {
    const root = makeTmpDir()
    const dir = path.join(root, 'fresh')

    const result = await writeMetadataYaml(dir, sampleMetadata('canvas-1', 'fresh'), { createDir: true })

    expect(result.skipped).toBe(false)
    expect(fs.existsSync(path.join(dir, 'metadata.yaml'))).toBe(true)
  })

  it('writes normally (no createDir needed) when the directory already exists', async () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'existing'))

    const result = await writeMetadataYaml(path.join(root, 'existing'), sampleMetadata('canvas-1', 'existing'))

    expect(result.skipped).toBe(false)
    expect(fs.existsSync(path.join(root, 'existing', 'metadata.yaml'))).toBe(true)
  })
})

describe('MetadataManager.refreshCanvasMetadata createDir default', () => {
  const canvas: CanvasItem = {
    kind: 'canvas',
    id: 'canvas-1',
    name: 'thinking',
    items: [],
    edges: [],
    xynode: { id: 'canvas-1', position: { x: 0, y: 0 }, data: {} },
  } as unknown as CanvasItem

  it('refreshCanvasMetadata (default, no options) never creates the directory — a stale disk-driven refresh must not resurrect a renamed-away canvas dir', async () => {
    const root = makeTmpDir()
    const mm = new MetadataManager({
      logger,
      workspacePath: root,
      findCanvasById: (id) => (id === canvas.id ? canvas : undefined),
      getCanvasPathById: () => 'thinking', // the (now-gone) old path
      listCanvasIds: () => [canvas.id],
    })

    await mm.refreshCanvasMetadata(canvas.id)

    expect(fs.existsSync(path.join(root, 'thinking'))).toBe(false)
  })

  it('materializeMissing passes createDir: true — boot-time sidecar creation still works', async () => {
    const root = makeTmpDir()
    const mm = new MetadataManager({
      logger,
      workspacePath: root,
      findCanvasById: (id) => (id === canvas.id ? canvas : undefined),
      getCanvasPathById: () => 'thinking',
      listCanvasIds: () => [canvas.id],
    })

    const written = await mm.materializeMissing(async () => false)

    expect(written).toBe(1)
    expect(fs.existsSync(path.join(root, 'thinking', 'metadata.yaml'))).toBe(true)
  })

  it('refreshCanvasMetadata({ createDir: true }) explicitly opted-in still creates the directory', async () => {
    const root = makeTmpDir()
    const mm = new MetadataManager({
      logger,
      workspacePath: root,
      findCanvasById: (id) => (id === canvas.id ? canvas : undefined),
      getCanvasPathById: () => 'thinking',
      listCanvasIds: () => [canvas.id],
    })

    await mm.refreshCanvasMetadata(canvas.id, { createDir: true })

    expect(fs.existsSync(path.join(root, 'thinking', 'metadata.yaml'))).toBe(true)
  })
})
