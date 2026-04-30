const RETURN_TO_KEY = 'kanwas:returnTo'

export function getReturnTo(): string | null {
  try {
    return localStorage.getItem(RETURN_TO_KEY)
  } catch {
    return null
  }
}

export function setReturnTo(path: string): void {
  try {
    localStorage.setItem(RETURN_TO_KEY, path)
  } catch {
    // Ignore localStorage errors
  }
}

export function clearReturnTo(): string | null {
  try {
    const value = localStorage.getItem(RETURN_TO_KEY)
    localStorage.removeItem(RETURN_TO_KEY)
    return value
  } catch {
    return null
  }
}
