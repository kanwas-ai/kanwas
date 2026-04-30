export function sanitizeStorageFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildWorkspaceFileStoragePath(
  workspaceId: string,
  canvasId: string,
  filename: string,
  fallbackFilename: string = 'file'
): string {
  const safeCanvasId = sanitizeStorageFilename(canvasId) || 'root'
  const safeFilename = sanitizeStorageFilename(filename) || fallbackFilename

  return `files/${workspaceId}/${safeCanvasId}/${safeFilename}`
}
