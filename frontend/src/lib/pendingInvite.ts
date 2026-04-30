const PENDING_INVITE_TOKEN_KEY = 'kanwas:pendingInviteToken'

export function getPendingInviteToken(): string | null {
  try {
    const token = localStorage.getItem(PENDING_INVITE_TOKEN_KEY)
    const trimmedToken = token?.trim()
    return trimmedToken ? trimmedToken : null
  } catch {
    return null
  }
}

export function setPendingInviteToken(token: string): void {
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    return
  }

  try {
    localStorage.setItem(PENDING_INVITE_TOKEN_KEY, trimmedToken)
  } catch {
    // Ignore localStorage errors
  }
}

export function clearPendingInviteToken(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
  } catch {
    // Ignore localStorage errors
  }
}

export function isInvalidInviteTokenMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes('invite token') && normalized.includes('invalid')) ||
    normalized.includes('already a member of this team') ||
    normalized.includes('already a member of this organization')
  )
}
