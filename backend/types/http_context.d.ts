/**
 * Extend HttpContext with logging context properties.
 * These are set by RequestContextMiddleware and used by ContextualLogger.
 */
declare module '@adonisjs/core/http' {
  interface HttpContext {
    /**
     * Correlation ID for request tracing. Generated or extracted from x-correlation-id header.
     */
    correlationId?: string

    /**
     * Workspace ID extracted from route params or request body.
     */
    workspaceId?: string

    /**
     * User ID from authenticated user. Set after auth middleware runs.
     */
    userId?: string

    /**
     * Organization ID resolved from workspace access middleware.
     */
    organizationId?: string

    /**
     * Organization role resolved from workspace access middleware.
     */
    organizationRole?: 'admin' | 'member'
  }
}

// Make this a module to enable proper declaration merging
export {}
