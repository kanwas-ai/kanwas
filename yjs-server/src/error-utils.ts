export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error.length > 0) {
    return new Error(error)
  }

  return new Error('Unknown error')
}

export function getErrorLogContext(error: unknown): { err: Error; error: string } {
  const normalized = normalizeError(error)

  return {
    err: normalized,
    error: normalized.message,
  }
}
