import { describe, expect, it } from 'vitest'
import {
  extractWorkspaceUrlIdFromReferer,
  findMountByIdOrUrlId,
  resolveFilesWorkspace,
  type ResolvableMount,
} from '../src/workspace-resolution.js'

const mounts: ResolvableMount[] = [
  {
    workspaceId: 'aaaaaaaa-0000-0000-0000-000000000001',
    workspaceUrlId: 'aaaaaaaa00000000000000000001',
    folder: '/vaults/a',
  },
  {
    workspaceId: 'bbbbbbbb-0000-0000-0000-000000000002',
    workspaceUrlId: 'bbbbbbbb00000000000000000002',
    folder: '/vaults/b',
  },
]

describe('findMountByIdOrUrlId', () => {
  it('matches by real workspaceId', () => {
    expect(findMountByIdOrUrlId(mounts, mounts[0].workspaceId)?.folder).toBe('/vaults/a')
  })

  it('matches by urlId', () => {
    expect(findMountByIdOrUrlId(mounts, mounts[1].workspaceUrlId)?.folder).toBe('/vaults/b')
  })

  it('returns undefined for an unknown id', () => {
    expect(findMountByIdOrUrlId(mounts, 'nope')).toBeUndefined()
  })
})

describe('extractWorkspaceUrlIdFromReferer', () => {
  it('pulls the urlId out of an /app/w/<urlId> path', () => {
    expect(extractWorkspaceUrlIdFromReferer('/app/w/abc123/canvas/xyz')).toBe('abc123')
    expect(extractWorkspaceUrlIdFromReferer('/app/w/abc123')).toBe('abc123')
  })

  it('returns null for a path with no workspace segment, or no path at all', () => {
    expect(extractWorkspaceUrlIdFromReferer('/app/local-login')).toBeNull()
    expect(extractWorkspaceUrlIdFromReferer(null)).toBeNull()
    expect(extractWorkspaceUrlIdFromReferer(undefined)).toBeNull()
  })
})

describe('resolveFilesWorkspace', () => {
  const alwaysExists = () => true
  const neverExists = () => false

  it('step (a): an explicit ws param wins outright', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: mounts[1].workspaceId,
      refererPath: `/app/w/${mounts[0].workspaceUrlId}`, // would resolve to mount 0 if consulted
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'notes/readme.md',
      existsInFolder: alwaysExists,
    })
    expect(resolved?.folder).toBe('/vaults/b')
  })

  it('step (a) accepts the urlId form too', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: mounts[0].workspaceUrlId,
      refererPath: null,
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'notes/readme.md',
      existsInFolder: alwaysExists,
    })
    expect(resolved?.folder).toBe('/vaults/a')
  })

  it('step (b): falls back to the Referer /app/w/<urlId> path when there is no ws param', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: null,
      refererPath: `/app/w/${mounts[1].workspaceUrlId}/canvas/some-canvas`,
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'notes/readme.md',
      existsInFolder: alwaysExists,
    })
    expect(resolved?.folder).toBe('/vaults/b')
  })

  it('step (c): falls back to the mount whose folder actually contains the file', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: null,
      refererPath: null,
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'media/logo.png',
      existsInFolder: (folder) => folder === '/vaults/b',
    })
    expect(resolved?.folder).toBe('/vaults/b')
  })

  it('step (c): prefers the active workspace when the file exists in more than one folder', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: null,
      refererPath: null,
      mounts,
      activeWorkspaceId: mounts[1].workspaceId,
      relPath: 'shared-name.md',
      existsInFolder: alwaysExists,
    })
    expect(resolved?.folder).toBe('/vaults/b')
  })

  it('step (c): falls back to the first match when ambiguous with no active workspace', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: null,
      refererPath: null,
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'shared-name.md',
      existsInFolder: alwaysExists,
    })
    expect(resolved?.folder).toBe('/vaults/a')
  })

  it('an unresolvable ws param and referer still fall through to step (c)', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: 'unknown-workspace',
      refererPath: '/app/w/unknown-url-id',
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'notes/readme.md',
      existsInFolder: (folder) => folder === '/vaults/a',
    })
    expect(resolved?.folder).toBe('/vaults/a')
  })

  it('returns undefined when nothing resolves', () => {
    const resolved = resolveFilesWorkspace({
      wsParam: null,
      refererPath: null,
      mounts,
      activeWorkspaceId: undefined,
      relPath: 'ghost.md',
      existsInFolder: neverExists,
    })
    expect(resolved).toBeUndefined()
  })
})
