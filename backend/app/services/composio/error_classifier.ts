interface ComposioErrorLike {
  message?: unknown
  code?: unknown
  slug?: unknown
  status?: unknown
  statusCode?: unknown
  cause?: unknown
  error?: unknown
  response?: unknown
  data?: unknown
}

function toErrorLike(value: unknown): ComposioErrorLike | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  return value as ComposioErrorLike
}

export interface ComposioErrorDetails {
  message: string
  code?: string
  slug?: string
  status?: number
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function toStatusOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) {
      return undefined
    }

    const parsed = Number.parseInt(normalized, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function collectErrorLikes(error: unknown): ComposioErrorLike[] {
  const pending: unknown[] = [error]
  const seen = new Set<object>()
  const results: ComposioErrorLike[] = []

  while (pending.length > 0) {
    const current = pending.shift()
    const currentLike = toErrorLike(current)
    if (!currentLike) {
      continue
    }

    const currentObject = currentLike as object
    if (seen.has(currentObject)) {
      continue
    }

    seen.add(currentObject)
    results.push(currentLike)

    pending.push(currentLike.cause, currentLike.error, currentLike.response, currentLike.data)

    const responseLike = toErrorLike(currentLike.response)
    if (responseLike) {
      pending.push(responseLike.data, responseLike.error)
    }
  }

  return results
}

export function extractComposioErrorDetails(error: unknown): ComposioErrorDetails {
  const errorLikes = collectErrorLikes(error)
  const messageParts: string[] = []

  for (const errorLike of errorLikes) {
    const message = toStringOrUndefined(errorLike.message)
    if (message && !messageParts.includes(message)) {
      messageParts.push(message)
    }
  }

  if (messageParts.length === 0 && error instanceof Error) {
    const message = toStringOrUndefined(error.message)
    if (message) {
      messageParts.push(message)
    }
  } else if (error instanceof Error) {
    const message = toStringOrUndefined(error.message)
    if (message && !messageParts.includes(message)) {
      messageParts.unshift(message)
    }
  } else if (typeof error === 'string') {
    const message = toStringOrUndefined(error)
    if (message && !messageParts.includes(message)) {
      messageParts.push(message)
    }
  }

  const code = errorLikes.map((item) => toStringOrUndefined(item.code)).find((candidate) => candidate !== undefined)

  const slug = errorLikes.map((item) => toStringOrUndefined(item.slug)).find((candidate) => candidate !== undefined)

  const status = errorLikes
    .flatMap((item) => [item.status, item.statusCode])
    .map((candidate) => toStatusOrUndefined(candidate))
    .find((candidate) => candidate !== undefined)

  const message = messageParts.join(' ').trim()
  return {
    message,
    ...(code ? { code } : {}),
    ...(slug ? { slug } : {}),
    ...(status !== undefined ? { status } : {}),
  }
}

export function isComposioAuthConfigNotFoundError(error: unknown): boolean {
  const details = extractComposioErrorDetails(error)
  const normalizedCodes = [details.code, details.slug]
    .map((candidate) => candidate?.toLowerCase())
    .filter((candidate): candidate is string => !!candidate)

  if (normalizedCodes.some((code) => code.includes('auth_config_not_found'))) {
    return true
  }

  if (
    normalizedCodes.some(
      (code) =>
        code.includes('auth_config') &&
        (code.includes('missing') ||
          code.includes('not_found') ||
          code.includes('required') ||
          code.includes('invalid'))
    ) &&
    (details.status === 400 || details.status === 404 || details.status === undefined)
  ) {
    return true
  }

  const message = details.message.toLowerCase()
  return (
    message.includes('auth config') &&
    (message.includes('not found') ||
      message.includes('no auth config') ||
      message.includes('missing') ||
      message.includes('does not exist') ||
      message.includes('invalid'))
  )
}

export function isComposioMissingManagedAuthError(error: unknown): boolean {
  if (isComposioAuthConfigNotFoundError(error)) {
    return true
  }

  const details = extractComposioErrorDetails(error)
  const normalizedCodes = [details.code, details.slug]
    .map((candidate) => candidate?.toLowerCase())
    .filter((candidate): candidate is string => !!candidate)

  if (
    normalizedCodes.some(
      (code) =>
        code.includes('custom_auth_required') ||
        code.includes('missing_managed_auth') ||
        code.includes('managed_auth_not_available') ||
        code.includes('no_managed_auth') ||
        code.includes('toolkit_requires_custom_auth')
    )
  ) {
    return true
  }

  const message = details.message.toLowerCase()
  const mentionsAuthConfig = message.includes('auth config')
  const mentionsManagedAuth = message.includes('managed auth') || message.includes('composio managed auth')
  const mentionsCustomAuth = message.includes('custom auth')

  if (
    mentionsAuthConfig &&
    (message.includes('create') ||
      message.includes('required') ||
      message.includes('missing') ||
      message.includes('not configured'))
  ) {
    return true
  }

  if (
    mentionsManagedAuth &&
    (message.includes('not available') ||
      message.includes('not supported') ||
      message.includes('missing') ||
      message.includes('disabled'))
  ) {
    return true
  }

  return (
    mentionsCustomAuth &&
    mentionsAuthConfig &&
    (message.includes('required') || message.includes('create') || message.includes('needs'))
  )
}

export function isComposioUnsupportedConnectedAccountStatusesError(error: unknown): boolean {
  const details = extractComposioErrorDetails(error)

  const normalizedCodes = [details.code, details.slug]
    .map((candidate) => candidate?.toLowerCase())
    .filter((candidate): candidate is string => !!candidate)

  if (
    normalizedCodes.some(
      (code) =>
        code.includes('status') &&
        (code.includes('invalid') || code.includes('unsupported') || code.includes('not_supported'))
    )
  ) {
    return true
  }

  if (details.status !== undefined && ![400, 404, 422].includes(details.status)) {
    return false
  }

  const message = details.message.toLowerCase()
  const mentionsStatusFilter =
    message.includes('status filter') ||
    message.includes('statuses') ||
    (message.includes('status') && message.includes('filter'))

  if (!mentionsStatusFilter) {
    return false
  }

  return (
    message.includes('invalid') ||
    message.includes('unsupported') ||
    message.includes('not supported') ||
    message.includes('not allowed')
  )
}
