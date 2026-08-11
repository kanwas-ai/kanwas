/**
 * Logging context that can be propagated through requests, events, and background tasks.
 * All fields are optional - populated as available.
 */
export interface LogContext {
  correlationId?: string
  userId?: string
  workspaceId?: string
  /** Additional contextual properties (e.g., component name) */
  [key: string]: string | undefined
}

/**
 * Extract workspace ID from route params or request body.
 * Checks params first (more specific), then body.
 */
export function extractWorkspaceId(params: Record<string, unknown>, body: Record<string, unknown>): string | undefined {
  // Check route params first (more specific)
  if (params.id && typeof params.id === 'string' && isUUID(params.id)) {
    return params.id
  }
  if (params.workspaceId && typeof params.workspaceId === 'string') {
    return params.workspaceId
  }

  // Check request body
  if (body.workspaceId && typeof body.workspaceId === 'string') {
    return body.workspaceId
  }
  if (body.workspace_id && typeof body.workspace_id === 'string') {
    return body.workspace_id
  }

  return undefined
}

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}
