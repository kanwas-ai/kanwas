const PENDING_GOOGLE_OAUTH_STATE_KEY = 'kanwas:pendingGoogleOAuthState'

export function getPendingGoogleOAuthState(): string | null {
  try {
    const state = sessionStorage.getItem(PENDING_GOOGLE_OAUTH_STATE_KEY)
    const trimmedState = state?.trim()
    return trimmedState ? trimmedState : null
  } catch {
    return null
  }
}

export function setPendingGoogleOAuthState(state: string): void {
  const trimmedState = state.trim()
  if (!trimmedState) {
    return
  }

  try {
    sessionStorage.setItem(PENDING_GOOGLE_OAUTH_STATE_KEY, trimmedState)
  } catch {
    // Ignore sessionStorage errors
  }
}

export function clearPendingGoogleOAuthState(): void {
  try {
    sessionStorage.removeItem(PENDING_GOOGLE_OAUTH_STATE_KEY)
  } catch {
    // Ignore sessionStorage errors
  }
}
