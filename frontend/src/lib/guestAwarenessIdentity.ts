export interface GuestAwarenessIdentity {
  id: string
  name: string
  color: string
  isGuest: true
}

const STORAGE_KEY = 'kanwas:guest-awareness-identity:v1'
const COLOR_PALETTE = ['#0F9D79', '#D97706', '#0EA5A4', '#3B82F6', '#DC6B46', '#64748B'] as const

function hashValue(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function createGuestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `guest-${crypto.randomUUID()}`
  }

  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createGuestAwarenessIdentity(): GuestAwarenessIdentity {
  const id = createGuestId()
  const suffix =
    id
      .replace(/^guest-/, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase() || 'NOTE'

  return {
    id,
    name: `Guest ${suffix}`,
    color: COLOR_PALETTE[hashValue(id) % COLOR_PALETTE.length]!,
    isGuest: true,
  }
}

function isGuestAwarenessIdentity(value: unknown): value is GuestAwarenessIdentity {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GuestAwarenessIdentity>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.color === 'string' &&
    candidate.isGuest === true
  )
}

class GuestAwarenessIdentityManager {
  private identity: GuestAwarenessIdentity | null = null

  getGuest(): GuestAwarenessIdentity {
    if (this.identity) {
      return this.identity
    }

    const storedIdentity = this.readStoredIdentity()
    this.identity = storedIdentity ?? createGuestAwarenessIdentity()
    this.writeStoredIdentity(this.identity)

    return this.identity
  }

  private readStoredIdentity(): GuestAwarenessIdentity | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as unknown
      return isGuestAwarenessIdentity(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  private writeStoredIdentity(identity: GuestAwarenessIdentity): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
    } catch {
      // Ignore storage write failures so the shared page still works in constrained environments.
    }
  }
}

export const guestAwarenessIdentityManager = new GuestAwarenessIdentityManager()
