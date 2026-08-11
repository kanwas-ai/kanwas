import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingGoogleOAuthState, getPendingGoogleOAuthState, setPendingGoogleOAuthState } from '@/lib/oauthState'

describe('google oauth state storage', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists and reads pending google oauth state', () => {
    setPendingGoogleOAuthState('state-123')

    expect(getPendingGoogleOAuthState()).toBe('state-123')
  })

  it('trims state values and clears them', () => {
    setPendingGoogleOAuthState('  state-abc  ')
    expect(getPendingGoogleOAuthState()).toBe('state-abc')

    clearPendingGoogleOAuthState()
    expect(getPendingGoogleOAuthState()).toBeNull()
  })
})
