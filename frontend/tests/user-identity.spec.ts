import { describe, expect, it } from 'vitest'

import { applyUserDisplayName, type UserIdentity } from '@/lib/userIdentity'

describe('applyUserDisplayName', () => {
  it('keeps the session identity when no display name is available', () => {
    const identity: UserIdentity = {
      id: 'user-session-1',
      name: 'User abc12',
      color: '#123456',
    }

    expect(applyUserDisplayName(identity, null)).toBe(identity)
    expect(applyUserDisplayName(identity, '   ')).toBe(identity)
  })

  it('overrides only the display name', () => {
    const identity: UserIdentity = {
      id: 'user-session-1',
      name: 'User abc12',
      color: '#123456',
    }

    expect(applyUserDisplayName(identity, '  Jane Doe  ')).toEqual({
      id: 'user-session-1',
      name: 'Jane Doe',
      color: '#123456',
    })
  })
})
