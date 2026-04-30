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

function isAbsoluteUrl(path: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(path)
}

export function buildAppPath(path: string, basePath: string = import.meta.env.BASE_URL): string {
  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return normalizeBasePath(basePath)
  }

  if (isAbsoluteUrl(trimmedPath)) {
    return trimmedPath
  }

  const normalizedBasePath = normalizeBasePath(basePath)
  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`

  if (normalizedBasePath === '/') {
    return normalizedPath
  }

  const basePrefix = normalizedBasePath.slice(0, -1)
  if (normalizedPath === basePrefix || normalizedPath.startsWith(`${basePrefix}/`)) {
    return normalizedPath
  }

  return `${basePrefix}${normalizedPath}`
}

export function buildAbsoluteAppUrl(path: string, origin: string, basePath: string = import.meta.env.BASE_URL): string {
  return new URL(buildAppPath(path, basePath), origin).toString()
}
