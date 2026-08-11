import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalApiError, localApi, rawFileUrl } from '@/api/client'

afterEach(() => vi.unstubAllGlobals())

describe('local API client', () => {
  it('uses the local /api workspace contract', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([{ id: 'ws-1', urlId: 'ws1', name: 'Notes', path: '/tmp/notes' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(localApi.listWorkspaces()).resolves.toEqual([
      { id: 'ws-1', urlId: 'ws1', name: 'Notes', path: '/tmp/notes' },
    ])
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/workspaces')
  })

  it('surfaces status and local error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Unknown workspace' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
      )
    )

    const error = await localApi.getWorkspace('missing').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(LocalApiError)
    expect(error).toMatchObject({ status: 404, message: 'Unknown workspace' })
  })

  it('builds direct local file URLs without an extra lookup request', () => {
    const url = new URL(rawFileUrl('ws/1', 'assets/image one.png', { contentHash: 'abc123' }))
    expect(url.pathname).toBe('/api/files/raw')
    expect(url.searchParams.get('workspaceId')).toBe('ws/1')
    expect(url.searchParams.get('path')).toBe('assets/image one.png')
    expect(url.searchParams.get('v')).toBe('abc123')
  })
})
