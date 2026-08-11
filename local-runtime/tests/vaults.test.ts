import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '../src/logger.js'
import {
  byRecency,
  loadRegistry,
  registerVault,
  saveRegistry,
  touchVault,
  unregisterVault,
  type VaultRegistry,
} from '../src/vaults.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-vaults-'))
  tmpDirs.push(dir)
  return path.join(dir, 'vaults.json')
}

describe('vaults registry', () => {
  it('load returns an empty registry when the file is missing', () => {
    const file = tmpFile()
    expect(loadRegistry(file, logger)).toEqual({ vaults: [] })
  })

  it('load returns an empty registry (and never throws) on corrupt JSON, leaving the file untouched', () => {
    const file = tmpFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{ not valid json', 'utf-8')
    expect(loadRegistry(file, logger)).toEqual({ vaults: [] })
    // The corrupt file itself is left alone — only a subsequent save overwrites it.
    expect(fs.readFileSync(file, 'utf-8')).toBe('{ not valid json')
  })

  it('load returns an empty registry on an unexpected shape (e.g. vaults not an array)', () => {
    const file = tmpFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ vaults: 'nope' }), 'utf-8')
    expect(loadRegistry(file, logger)).toEqual({ vaults: [] })
  })

  it('load drops malformed individual entries but keeps the well-formed ones', () => {
    const file = tmpFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({
        vaults: [
          { path: '/a', workspaceId: 'w1', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          { path: '/b' }, // missing workspaceId/lastOpenedAt
          'not even an object',
        ],
      }),
      'utf-8'
    )
    const registry = loadRegistry(file, logger)
    expect(registry.vaults).toHaveLength(1)
    expect(registry.vaults[0].path).toBe('/a')
  })

  it('save is atomic (write tmp + rename) and round-trips through load', () => {
    const file = tmpFile()
    saveRegistry({ vaults: [{ path: '/a', workspaceId: 'w1', lastOpenedAt: '2026-01-01T00:00:00.000Z' }] }, file)
    expect(fs.existsSync(file)).toBe(true)
    // no leftover tmp files
    const dirEntries = fs.readdirSync(path.dirname(file))
    expect(dirEntries.filter((f) => f.includes('.tmp-'))).toHaveLength(0)

    const reloaded = loadRegistry(file, logger)
    expect(reloaded.vaults).toHaveLength(1)
    expect(reloaded.vaults[0].workspaceId).toBe('w1')
  })

  it('registerVault upserts by path (same path again updates in place, does not duplicate)', () => {
    let registry: VaultRegistry = { vaults: [] }
    registry = registerVault(registry, { path: '/a', workspaceId: 'w1', label: 'First' })
    expect(registry.vaults).toHaveLength(1)

    registry = registerVault(registry, { path: '/a', workspaceId: 'w1' })
    expect(registry.vaults).toHaveLength(1)
    // label preserved when not explicitly overridden
    expect(registry.vaults[0].label).toBe('First')

    registry = registerVault(registry, { path: '/a', workspaceId: 'w1', label: 'Renamed' })
    expect(registry.vaults).toHaveLength(1)
    expect(registry.vaults[0].label).toBe('Renamed')

    registry = registerVault(registry, { path: '/b', workspaceId: 'w2' })
    expect(registry.vaults).toHaveLength(2)
  })

  it('keeps only one path for a workspace identity', () => {
    let registry: VaultRegistry = { vaults: [] }
    registry = registerVault(registry, { path: '/original', workspaceId: 'same-id', label: 'Original' })
    registry = registerVault(registry, { path: '/copy', workspaceId: 'same-id' })
    expect(registry.vaults).toEqual([
      expect.objectContaining({ path: '/copy', workspaceId: 'same-id', label: 'Original' }),
    ])
  })

  it('deduplicates legacy entries by both path and workspace identity', () => {
    const file = tmpFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({
        vaults: [
          { path: '/old', workspaceId: 'same-id', lastOpenedAt: '2025-01-01T00:00:00.000Z' },
          { path: '/new', workspaceId: 'same-id', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          { path: '/new', workspaceId: 'other-id', lastOpenedAt: '2024-01-01T00:00:00.000Z' },
        ],
      })
    )
    expect(loadRegistry(file, logger).vaults).toEqual([
      expect.objectContaining({ path: '/new', workspaceId: 'same-id' }),
    ])
  })

  it('unregisterVault removes by workspaceId and clears activeWorkspaceId if it matches; never touches other entries', () => {
    let registry = registerVault({ vaults: [] }, { path: '/a', workspaceId: 'w1' })
    registry = registerVault(registry, { path: '/b', workspaceId: 'w2' })
    registry = touchVault(registry, 'w1')
    expect(registry.activeWorkspaceId).toBe('w1')

    registry = unregisterVault(registry, 'w1')
    expect(registry.vaults).toHaveLength(1)
    expect(registry.vaults[0].workspaceId).toBe('w2')
    expect(registry.activeWorkspaceId).toBeUndefined()

    // Unregistering a workspace that isn't active leaves activeWorkspaceId alone.
    registry = touchVault(registry, 'w2')
    registry = registerVault(registry, { path: '/c', workspaceId: 'w3' })
    registry = unregisterVault(registry, 'w3')
    expect(registry.activeWorkspaceId).toBe('w2')
  })

  it('touchVault bumps lastOpenedAt and sets activeWorkspaceId', () => {
    let registry = registerVault(
      { vaults: [] },
      { path: '/a', workspaceId: 'w1', lastOpenedAt: '2020-01-01T00:00:00.000Z' }
    )
    registry = touchVault(registry, 'w1', '2026-06-01T00:00:00.000Z')
    expect(registry.vaults[0].lastOpenedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(registry.activeWorkspaceId).toBe('w1')
  })

  it('byRecency sorts most-recently-opened first', () => {
    const vaults = [
      { path: '/a', workspaceId: 'w1', lastOpenedAt: '2020-01-01T00:00:00.000Z' },
      { path: '/b', workspaceId: 'w2', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
      { path: '/c', workspaceId: 'w3', lastOpenedAt: '2023-01-01T00:00:00.000Z' },
    ]
    expect(byRecency(vaults).map((v) => v.workspaceId)).toEqual(['w2', 'w3', 'w1'])
  })
})
