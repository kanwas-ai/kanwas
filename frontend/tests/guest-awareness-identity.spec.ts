import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('guestAwarenessIdentityManager', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetModules()
  })

  it('returns a stable guest-scoped identity within the same tab session', async () => {
    const { guestAwarenessIdentityManager } = await import('@/lib/guestAwarenessIdentity')

    const first = guestAwarenessIdentityManager.getGuest()
    const second = guestAwarenessIdentityManager.getGuest()

    expect(second).toEqual(first)
    expect(first.id.startsWith('guest-')).toBe(true)
    expect(first.name.startsWith('Guest ')).toBe(true)
    expect(first.color).toMatch(/^#(?:[0-9a-fA-F]{6})$/)
    expect(first.isGuest).toBe(true)
  })

  it('rehydrates the same identity from sessionStorage after a module reset', async () => {
    const firstModule = await import('@/lib/guestAwarenessIdentity')
    const firstIdentity = firstModule.guestAwarenessIdentityManager.getGuest()

    vi.resetModules()

    const secondModule = await import('@/lib/guestAwarenessIdentity')
    const secondIdentity = secondModule.guestAwarenessIdentityManager.getGuest()

    expect(secondIdentity).toEqual(firstIdentity)
  })
})
