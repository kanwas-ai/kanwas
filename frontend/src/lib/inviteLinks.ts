function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return '/'
  }

  let normalized = basePath.trim()

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  if (!normalized.endsWith('/')) {
    normalized = `${normalized}/`
  }

  return normalized
}

export function buildInvitePath(token: string, basePath: string): string {
  const normalizedBasePath = normalizeBasePath(basePath)
  return `${normalizedBasePath}invite/${token}`
}

export function buildInviteUrl(token: string, origin: string, basePath: string): string {
  return new URL(buildInvitePath(token, basePath), origin).toString()
}
