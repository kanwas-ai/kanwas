import { describe, expect, it } from 'vitest'
import { buildAbsoluteAppUrl, buildAppPath } from '@/lib/appPaths'

describe('app path helpers', () => {
  it('keeps root-relative paths on localhost-style base paths', () => {
    expect(buildAppPath('/share/hash-1', '/')).toBe('/share/hash-1')
  })

  it('prefixes app-relative paths for subpath deployments', () => {
    expect(buildAppPath('/share/hash-1', '/app/')).toBe('/app/share/hash-1')
    expect(buildAppPath('/w/workspace1', 'app')).toBe('/app/w/workspace1')
  })

  it('does not double-prefix paths that already include the app base', () => {
    expect(buildAppPath('/app/share/hash-1', '/app/')).toBe('/app/share/hash-1')
  })

  it('builds absolute URLs for copy flows', () => {
    expect(buildAbsoluteAppUrl('/share/hash-1', 'https://kanwas.app', '/app/')).toBe(
      'https://kanwas.app/app/share/hash-1'
    )
  })
})
