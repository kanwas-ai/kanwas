import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  isInvalidInviteTokenMessage,
  setPendingInviteToken,
} from '@/lib/pendingInvite'

describe('pendingInvite storage', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('localStorage', {
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

  it('persists and reads pending invite token', () => {
    setPendingInviteToken('invite-token-123')

    expect(getPendingInviteToken()).toBe('invite-token-123')
  })

  it('trims token values and clears them', () => {
    setPendingInviteToken('  invite-token-abc  ')
    expect(getPendingInviteToken()).toBe('invite-token-abc')

    clearPendingInviteToken()
    expect(getPendingInviteToken()).toBeNull()
  })
})

describe('isInvalidInviteTokenMessage', () => {
  it('detects backend invalid invite token messages', () => {
    expect(isInvalidInviteTokenMessage('Invite token is invalid, expired, revoked, or already used')).toBe(true)
  })

  it('detects already-member invite rejection messages', () => {
    expect(isInvalidInviteTokenMessage('You are already a member of this organization')).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isInvalidInviteTokenMessage('Invalid credentials')).toBe(false)
  })
})
