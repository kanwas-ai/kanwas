import type { ApplicationService } from '@adonisjs/core/types'
import { HttpContext } from '@adonisjs/core/http'

import { CanvasAgent } from '#agent/index'
import { ContextualLoggerContract } from '#contracts/contextual_logger'
import { ContextualLogger } from '#services/contextual_logger'
import { SandboxRegistry } from '#services/sandbox_registry'
import PostHogService from '#services/posthog_service'
import { createProviderFromConfig } from '#agent/providers/index'

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

    this.app.container.bind(CanvasAgent, async (resolver) => {
      const { default: WorkspaceDocumentService } = await import('#services/workspace_document_service')
      const { default: WebSearchService } = await import('#services/web_search_service')

      const configService = await resolver.make('config')
      const config = configService.get<any>('agent')
      const workspaceDocumentService = await resolver.make(WorkspaceDocumentService)
      const webSearchService = WebSearchService.create()
      const sandboxRegistry = await resolver.make(SandboxRegistry)
      const posthogService = await resolver.make(PostHogService)
      const logger = await resolver.make(ContextualLoggerContract)

      // Request-scoped defaults are resolved after reading user/admin config from DB.
      const provider = createProviderFromConfig(config, {}, { logger })

      return new CanvasAgent({
        provider,
        model: provider.modelTiers.big,
        workspaceDocumentService,
        webSearchService,
        sandboxRegistry,
        posthogService,
      })
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
