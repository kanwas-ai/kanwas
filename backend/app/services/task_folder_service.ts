import type { ConversationItem, TextEditorItem } from '#libs/agent/types'

/**
 * Extracts the parent folder from a file path.
 * Removes /workspace/ prefix and returns the directory containing the file.
 */
function extractParentFolder(path: string): string | null {
  // Remove /workspace/ prefix if present
  const normalized = path.replace(/^\/workspace\//, '')
  const parts = normalized.split('/')

  if (parts.length <= 1) {
    // Root-level file, no parent folder
    return null
  }

  // Return parent directory
  return parts.slice(0, -1).join('/')
}

/**
 * Extracts unique folder paths from TextEditorItem entries in a timeline.
 * Only includes folders where files were actually modified (create, str_replace, insert).
 */
export function extractModifiedFolders(timeline: ConversationItem[]): string[] {
  const folders = new Set<string>()

  for (const item of timeline) {
    if (item.type === 'text_editor') {
      const textEditorItem = item as TextEditorItem
      // Only count completed modifications (not views)
      if (textEditorItem.status === 'completed' && textEditorItem.command !== 'view') {
        const folder = extractParentFolder(textEditorItem.path)
        if (folder) {
          folders.add(folder)
        }
      }
    }
  }

  return Array.from(folders).sort()
}

export function mergeModifiedFolders(
  existingFolders: string[] | null | undefined,
  incomingFolders: string[] | null | undefined
): string[] {
  const folders = new Set<string>()

  for (const folder of existingFolders ?? []) {
    if (folder) {
      folders.add(folder)
    }
  }

  for (const folder of incomingFolders ?? []) {
    if (folder) {
      folders.add(folder)
    }
  }

  return Array.from(folders).sort()
}
