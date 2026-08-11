// Shared user identity for both editor and app cursors
export interface UserIdentity {
  id: string
  name: string
  color: string
}

export function applyUserDisplayName(identity: UserIdentity, displayName: string | null | undefined): UserIdentity {
  const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : ''
  if (!normalizedDisplayName || normalizedDisplayName === identity.name) {
    return identity
  }

  return {
    ...identity,
    name: normalizedDisplayName,
  }
}

class UserIdentityManager {
  private static instance: UserIdentityManager
  private userIdentity: UserIdentity | null = null

  private constructor() {}

  static getInstance(): UserIdentityManager {
    if (!UserIdentityManager.instance) {
      UserIdentityManager.instance = new UserIdentityManager()
    }
    return UserIdentityManager.instance
  }

  private readSessionStorage(key: string): string | null {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  }

  private writeSessionStorage(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      // Ignore storage failures and keep identity in memory for this session.
    }
  }

  private generateUserId(): string {
    // Use sessionStorage + timestamp to ensure unique ID per tab/window
    const storageKey = 'app-session-user-id'
    let userId = this.readSessionStorage(storageKey)

    if (!userId) {
      const randomId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      userId = `user-${randomId}`
      this.writeSessionStorage(storageKey, userId)
    }

    return userId
  }

  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#F7DC6F',
      '#BB8FCE',
      '#85C88A',
      '#F8B739',
      '#52B788',
      '#F72585',
      '#4361EE',
    ]

    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i)
      hash = hash & hash
    }

    const index = Math.abs(hash) % colors.length
    return colors[index]!
  }

  getUser(): UserIdentity {
    if (!this.userIdentity) {
      const userId = this.generateUserId()
      const randomPart = userId.split('-').pop() || 'user'
      const userName = `User ${randomPart.substring(0, 5)}`
      const userColor = this.generateUserColor(userId)

      this.userIdentity = {
        id: userId,
        name: userName,
        color: userColor,
      }
    }

    return this.userIdentity
  }
}

export const userIdentityManager = UserIdentityManager.getInstance()
