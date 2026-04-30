import { inject } from '@adonisjs/core'
import locks from '@adonisjs/lock/services/main'
import ConnectionsCatalogRefreshRequested from '#events/connections_catalog_refresh_requested'
import ComposioService from '#services/composio_service'
import ConnectionsCatalogCacheService from '#services/connections_catalog_cache_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'

@inject()
export default class RefreshConnectionsCatalog {
  private readonly logger = ContextualLogger.createFallback({ component: 'RefreshConnectionsCatalog' })
  private static readonly REFRESH_LOCK_KEY = 'composio:connections:catalog:refresh:v1'

  constructor(
    private composioService: ComposioService,
    private connectionsCatalogCacheService: ConnectionsCatalogCacheService
  ) {}

  async handle(event: ConnectionsCatalogRefreshRequested) {
    try {
      const [executed] = await locks.createLock(RefreshConnectionsCatalog.REFRESH_LOCK_KEY).runImmediately(async () => {
        const catalog = await this.composioService.listGlobalToolkitCatalog()
        await this.connectionsCatalogCacheService.writeCatalog(catalog)
        this.logger.info(
          {
            operation: 'connections_catalog_refreshed',
            reason: event.reason,
            count: catalog.length,
          },
          'Refreshed global Composio toolkit catalog cache'
        )
      })

      if (!executed) {
        this.logger.debug(
          {
            operation: 'connections_catalog_refresh_skipped',
            reason: event.reason,
          },
          'Skipped connections catalog refresh because another refresh is already running'
        )
      }
    } catch (error) {
      this.logger.error(
        {
          operation: 'connections_catalog_refresh_failed',
          reason: event.reason,
          err: toError(error),
        },
        'Failed to refresh global Composio toolkit catalog cache'
      )
    }
  }
}
