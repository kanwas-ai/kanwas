/**
 * Filters out duplicate consecutive working_context items from the timeline
 * based on their content signature (workspaceId and canvasId)
 */
function isWorkingContextLike<T extends { type: string }>(
  item: T
): item is T & { type: 'working_context'; workspaceId: string; canvasId: string | null } {
  if (item.type !== 'working_context') {
    return false
  }

  const candidate = item as T & { workspaceId?: unknown; canvasId?: unknown }
  const hasWorkspaceId = typeof candidate.workspaceId === 'string'
  const hasCanvasId = typeof candidate.canvasId === 'string' || candidate.canvasId === null

  return hasWorkspaceId && hasCanvasId
}

export function filterDuplicateWorkingContext<T extends { type: string }>(timeline: readonly T[]): T[] {
  let lastContextSignature: string | null = null

  return timeline.filter((item) => {
    if (isWorkingContextLike(item)) {
      const signature = `${item.workspaceId}|${item.canvasId ?? 'null'}`

      if (signature === lastContextSignature) {
        return false
      }
      lastContextSignature = signature
    }
    return true
  })
}
