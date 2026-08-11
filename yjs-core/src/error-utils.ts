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

/** Flatten nested aggregate failures while preserving each distinct cause. */
export function appendError(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nestedError of error.errors) {
      appendError(errors, nestedError)
    }
    return
  }

  if (!errors.includes(error)) {
    errors.push(error)
  }
}

export function throwAggregateErrors(errors: unknown[], message: string): void {
  if (errors.length > 0) {
    throw new AggregateError(errors, message)
  }
}
