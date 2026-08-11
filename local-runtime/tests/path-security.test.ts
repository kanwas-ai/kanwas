import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isPathInside, resolveExistingPathInside } from '../src/path-security.js'

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('path containment', () => {
  it('handles Windows drives, mixed case, sibling prefixes, and UNC roots', () => {
    expect(isPathInside('C:\\Vault', 'c:\\vault\\notes\\a.md', path.win32)).toBe(true)
    expect(isPathInside('C:\\Vault', 'C:/Vault/notes/a.md', path.win32)).toBe(true)
    expect(isPathInside('C:\\Vault', 'C:\\Vault-other\\a.md', path.win32)).toBe(false)
    expect(isPathInside('C:\\Vault', 'D:\\Vault\\a.md', path.win32)).toBe(false)
    expect(isPathInside('\\\\server\\share\\vault', '\\\\server\\share\\vault\\a.md', path.win32)).toBe(true)
    expect(isPathInside('\\\\server\\share\\vault', '\\\\server\\share\\other\\a.md', path.win32)).toBe(false)
  })

  it('rejects lexical traversal and symlinks that escape the vault', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-path-root-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-path-outside-'))
    tmpDirs.push(root, outside)
    fs.writeFileSync(path.join(root, 'inside.md'), 'inside')
    fs.writeFileSync(path.join(outside, 'secret.md'), 'outside')

    expect(resolveExistingPathInside(root, 'inside.md')).toBe(fs.realpathSync(path.join(root, 'inside.md')))
    expect(resolveExistingPathInside(root, '../secret.md')).toBeNull()

    const link = path.join(root, 'escape')
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
      expect(resolveExistingPathInside(root, 'escape/secret.md')).toBeNull()
    } catch (error) {
      if (process.platform !== 'win32') throw error
      // Windows CI can run without symlink privileges; drive/UNC cases above
      // still exercise the platform-specific containment algorithm.
    }
  })
})
