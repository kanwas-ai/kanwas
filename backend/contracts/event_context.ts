import { randomUUID } from 'node:crypto'
import { HttpContext } from '@adonisjs/core/http'

/**
 * Context that can be propagated through events.
 * Captured at event dispatch time from HTTP context.
 */
export interface EventContext {
  correlationId: string
  userId: string
  workspaceId?: string
  organizationId?: string
}

/**
 * Create EventContext from current HTTP context.
 * Falls back to generated values if not in HTTP context.
 */
export function createEventContext(overrides?: Partial<EventContext>): EventContext {
  const ctx = HttpContext.get()
  return {
    correlationId: overrides?.correlationId ?? ctx?.correlationId ?? randomUUID(),
    userId: overrides?.userId ?? ctx?.userId ?? 'unknown',
    workspaceId: overrides?.workspaceId ?? ctx?.workspaceId,
    organizationId: overrides?.organizationId ?? ctx?.organizationId,
  }
}
