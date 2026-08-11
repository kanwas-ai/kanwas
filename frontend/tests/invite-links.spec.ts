import { describe, expect, it } from 'vitest'
import { buildInvitePath, buildInviteUrl } from '@/lib/inviteLinks'

describe('invite link helpers', () => {
  it('builds invite paths for root base path', () => {
    expect(buildInvitePath('token-123', '/')).toBe('/invite/token-123')
  })

  it('builds invite paths for app subpaths', () => {
    expect(buildInvitePath('token-123', '/app/')).toBe('/app/invite/token-123')
    expect(buildInvitePath('token-123', 'app')).toBe('/app/invite/token-123')
  })

  it('builds absolute invite URL for copy/share flows', () => {
    expect(buildInviteUrl('token-123', 'https://kanwas.app', '/app/')).toBe('https://kanwas.app/app/invite/token-123')
  })
})
