import { describe, expect, it } from 'vitest'
import {
  CONNECTION_CALLBACK_SOURCE,
  isConnectionCallbackMessage,
  parseConnectionsCallback,
} from '@/lib/connectionsCallback'

describe('connections callback parsing', () => {
  it('parses successful callbacks with attempt id', () => {
    const parsed = parseConnectionsCallback('?status=success&attemptId=attempt-123')

    expect(parsed).toEqual({
      attemptId: 'attempt-123',
      status: 'success',
      errorMessage: null,
    })
  })

  it('parses explicit error callbacks with message fallback', () => {
    const parsed = parseConnectionsCallback('?success=false&attempt_id=attempt-123&message=Provider%20error')

    expect(parsed).toEqual({
      attemptId: 'attempt-123',
      status: 'error',
      errorMessage: 'Provider error',
    })
  })

  it('does not treat oauth state as attempt id', () => {
    const parsed = parseConnectionsCallback('?status=success&state=oauth-state-only')

    expect(parsed).toEqual({
      attemptId: null,
      status: 'success',
      errorMessage: null,
    })
  })

  it('returns unknown status when no success or error signal exists', () => {
    const parsed = parseConnectionsCallback('?attemptId=attempt-123')

    expect(parsed).toEqual({
      attemptId: 'attempt-123',
      status: 'unknown',
      errorMessage: null,
    })
  })
})

describe('connection callback message guard', () => {
  it('accepts messages only with source, status, and attempt id', () => {
    expect(
      isConnectionCallbackMessage({
        source: CONNECTION_CALLBACK_SOURCE,
        status: 'success',
        attemptId: 'attempt-123',
      })
    ).toBe(true)
  })

  it('rejects messages without attempt id', () => {
    expect(
      isConnectionCallbackMessage({
        source: CONNECTION_CALLBACK_SOURCE,
        status: 'success',
      })
    ).toBe(false)
  })
})
