import { posix as pathPosix } from 'node:path'

export const WORKSPACE_ROOT = '/workspace'
export const THROTTLE_MS = 100

export const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

const TEXT_EXTENSIONS = ['.md', '.yaml', '.yml']

export type ImageResult = { isImage: true; data: string; mimeType: string; path: string }
export type TextEditorResult = string | ImageResult

export type ProgressCallback = (update: { streamingStatus?: string; linesRead?: number; totalLines?: number }) => void

export function isAllowedFileType(path: string): { allowed: boolean; isImage: boolean } {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'))
  if (TEXT_EXTENSIONS.includes(ext)) {
    return { allowed: true, isImage: false }
  }
  if (IMAGE_EXTENSIONS[ext]) {
    return { allowed: true, isImage: true }
  }
  return { allowed: false, isImage: false }
}

export function isImageResult(result: unknown): result is ImageResult {
  return (
    typeof result === 'object' && result !== null && 'isImage' in result && (result as ImageResult).isImage === true
  )
}

export function resolveWorkspacePath(path: string): string | null {
  const normalized = path.startsWith('/')
    ? pathPosix.normalize(path)
    : pathPosix.normalize(pathPosix.join(WORKSPACE_ROOT, path))

  return normalized === WORKSPACE_ROOT || normalized.startsWith(`${WORKSPACE_ROOT}/`) ? normalized : null
}

export function resolveWorkspaceFilePath(path: string): string | null {
  const resolved = resolveWorkspacePath(path)
  return resolved && resolved !== WORKSPACE_ROOT ? resolved : null
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`
}

export function formatTextEditorResult(result: TextEditorResult): string {
  if (isImageResult(result)) {
    return `Viewing image: ${result.path} (${result.mimeType}, ${Math.round((result.data.length * 0.75) / 1024)}KB)`
  }

  return result
}
