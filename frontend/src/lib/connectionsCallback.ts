export const CONNECTION_CALLBACK_SOURCE = 'kanwas-connections-callback'

export type ConnectionCallbackStatus = 'success' | 'error' | 'unknown'

export interface ConnectionCallbackMessage {
  source: typeof CONNECTION_CALLBACK_SOURCE
  status: ConnectionCallbackStatus
  attemptId: string
}

export interface ParsedConnectionCallbackState {
  attemptId: string | null
  status: ConnectionCallbackStatus
  errorMessage: string | null
}

const CONNECTION_CALLBACK_STATUSES = new Set<ConnectionCallbackStatus>(['success', 'error', 'unknown'])
const CONNECTION_ERROR_STATUSES = new Set(['error', 'failed', 'failure', 'cancelled', 'canceled'])
const CONNECTION_SUCCESS_STATUSES = new Set(['success', 'completed'])

function getFirstQueryParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)
    if (value && value.trim().length > 0) {
      return value
    }
  }

  return null
}

export function parseConnectionsCallback(search: string): ParsedConnectionCallbackState {
  const params = new URLSearchParams(search)
  const statusParam = getFirstQueryParam(params, ['status', 'connection_status', 'connectionStatus'])?.toLowerCase()
  const successParam = getFirstQueryParam(params, ['success', 'is_success', 'isSuccess'])?.toLowerCase()
  const connectedAccountId = getFirstQueryParam(params, ['connected_account_id', 'connectedAccountId'])
  const attemptId = getFirstQueryParam(params, ['attempt_id', 'attemptId'])
  const explicitErrorParam = getFirstQueryParam(params, [
    'error_description',
    'errorDescription',
    'error_message',
    'errorMessage',
    'error',
  ])
  const messageParam = getFirstQueryParam(params, ['message'])

  const hasErrorStatus = !!statusParam && CONNECTION_ERROR_STATUSES.has(statusParam)
  const hasSuccessStatus = !!statusParam && CONNECTION_SUCCESS_STATUSES.has(statusParam)
  const hasFalseSuccessFlag = successParam === 'false' || successParam === '0' || successParam === 'no'
  const hasTrueSuccessFlag = successParam === 'true' || successParam === '1' || successParam === 'yes'
  const hasConnectedAccountId = !!connectedAccountId
  const hasExplicitErrorMessage = !!explicitErrorParam && explicitErrorParam.toLowerCase() !== 'none'

  const status: ConnectionCallbackStatus =
    hasErrorStatus || hasFalseSuccessFlag
      ? 'error'
      : hasSuccessStatus || hasTrueSuccessFlag || hasConnectedAccountId
        ? 'success'
        : hasExplicitErrorMessage
          ? 'error'
          : 'unknown'

  return {
    attemptId,
    status,
    errorMessage:
      status === 'error' ? explicitErrorParam || messageParam || 'Connection failed. Please try again.' : null,
  }
}

export function isConnectionCallbackMessage(value: unknown): value is ConnectionCallbackMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Partial<ConnectionCallbackMessage>
  return (
    payload.source === CONNECTION_CALLBACK_SOURCE &&
    typeof payload.status === 'string' &&
    CONNECTION_CALLBACK_STATUSES.has(payload.status as ConnectionCallbackStatus) &&
    typeof payload.attemptId === 'string' &&
    payload.attemptId.trim().length > 0
  )
}
