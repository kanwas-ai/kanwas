import { inspect } from 'node:util'

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error(inspect(error, { depth: 5, breakLength: Infinity }))
}

export function getErrorMessage(error: unknown): string {
  return toError(error).message
}
