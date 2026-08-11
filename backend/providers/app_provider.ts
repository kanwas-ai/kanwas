import type { ApplicationService } from '@adonisjs/core/types'
import { HttpContext } from '@adonisjs/core/http'

import { ContextualLoggerContract } from '#contracts/contextual_logger'
import { ContextualLogger } from '#services/contextual_logger'
import PostHogService from '#services/posthog_service'

export default class AppProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {
    this.app.container.singleton(PostHogService, () => new PostHogService())

    // Register ContextualLoggerContract with fallback for non-HTTP contexts.
    // For HTTP requests, container_bindings_middleware provides a request-scoped binding
    // that overrides this. For background tasks/events, this fallback is used.
    this.app.container.bind(ContextualLoggerContract, async () => {
      try {
        // Try to get from current HTTP context (works if useAsyncLocalStorage is enabled)
        const ctx = HttpContext.getOrFail()
        return new ContextualLogger(ctx.logger, {
          correlationId: ctx.correlationId,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        })
      } catch {
        // Fallback for background tasks without HTTP context
        return ContextualLogger.createFallback()
      }
    })
  }

  /**
   * The container bindings have booted
   */
  async boot() {}

  /**
   * The application has been booted
   */
  async start() {}

  /**
   * The process has been started
   */
  async ready() {}

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {
    const posthogService = await this.app.container.make(PostHogService)
    await posthogService.shutdown()
  }
}
