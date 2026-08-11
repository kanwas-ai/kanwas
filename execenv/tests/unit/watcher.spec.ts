import path from 'path'
import { describe, expect, it, vi } from 'vitest'

import { FileWatcher } from '../../src/watcher.js'

function createWatcher() {
  return new FileWatcher({
    onFileChange: vi.fn().mockResolvedValue(undefined),
  })
}

describe('FileWatcher rename matching', () => {
  it('matches same-folder file renames', () => {
    const watcher = createWatcher() as any
    const identity = {
      dev: 1,
      ino: 2,
      size: 123,
      mtimeMs: 456,
      isDirectory: false,
    }

    watcher.recentlyDeleted.set('1:2', {
      ...identity,
      path: path.join('/workspace', 'docs', 'before.md'),
      expiresAt: Date.now() + 1000,
    })

    const match = watcher.takeRecentDeleteMatch(path.join('/workspace', 'docs', 'after.md'), identity)

    expect(match?.path).toBe(path.join('/workspace', 'docs', 'before.md'))
  })

  it('does not match cross-folder file moves as renames', () => {
    const watcher = createWatcher() as any
    const identity = {
      dev: 1,
      ino: 2,
      size: 123,
      mtimeMs: 456,
      isDirectory: false,
    }

    watcher.recentlyDeleted.set('1:2', {
      ...identity,
      path: path.join('/workspace', 'docs', 'before.md'),
      expiresAt: Date.now() + 1000,
    })

    const match = watcher.takeRecentDeleteMatch(path.join('/workspace', 'archive', 'before.md'), identity)

    expect(match).toBeNull()
    expect(watcher.recentlyDeleted.has('1:2')).toBe(true)
  })

  it('still matches cross-folder directory moves as renames', () => {
    const watcher = createWatcher() as any
    const identity = {
      dev: 1,
      ino: 2,
      size: 0,
      mtimeMs: 456,
      isDirectory: true,
    }

    watcher.recentlyDeleted.set('1:2', {
      ...identity,
      path: path.join('/workspace', 'docs'),
      expiresAt: Date.now() + 1000,
    })

    const match = watcher.takeRecentDeleteMatch(path.join('/workspace', 'archive', 'docs'), identity)

    expect(match?.path).toBe(path.join('/workspace', 'docs'))
  })
})
