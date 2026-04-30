import { inject } from '@adonisjs/core'
import cache from '@adonisjs/cache/services/main'
import ConnectionsCatalogRefreshRequested from '#events/connections_catalog_refresh_requested'
import { ContextualLogger } from '#services/contextual_logger'
import type { ConnectionStatus } from '#services/composio_service'
import { toCatalogConnectionStatus } from '#services/composio/connection_merge'
import { normalizeCategories, normalizeDescription } from '#services/composio/normalization'

interface CachedConnectionsCatalog {
  cachedAt: number
  entries: ConnectionStatus[]
}

export const CONNECTIONS_CATALOG_CACHE_KEY = 'composio:connections:catalog:v2'
export const CONNECTIONS_CATALOG_FRESHNESS_MS = 24 * 60 * 60 * 1000
export const CONNECTIONS_CATALOG_CACHE_TTL_MS = 7 * CONNECTIONS_CATALOG_FRESHNESS_MS

@inject()
export default class ConnectionsCatalogCacheService {
  private readonly logger = ContextualLogger.createFallback({ component: 'ConnectionsCatalogCacheService' })

  private toCatalogEntries(entries: ConnectionStatus[]): ConnectionStatus[] {
    return entries.map((entry) => {
      const projected = toCatalogConnectionStatus(entry)
      const description = normalizeDescription(projected.description)
      const categories = normalizeCategories(projected.categories)
      const normalizedEntry: ConnectionStatus = { ...projected }

      if (description) {
        normalizedEntry.description = description
      } else {
        delete normalizedEntry.description
      }

      if (categories && categories.length > 0) {
        normalizedEntry.categories = categories
      } else {
        delete normalizedEntry.categories
      }

      return normalizedEntry
    })
  }

  private isFresh(cachedAt: number): boolean {
    return Date.now() - cachedAt < CONNECTIONS_CATALOG_FRESHNESS_MS
  }

  private parseCachedCatalog(rawValue: unknown): Partial<CachedConnectionsCatalog> | null {
    if (typeof rawValue === 'string') {
      try {
        return JSON.parse(rawValue) as Partial<CachedConnectionsCatalog>
      } catch {
        return null
      }
    }

    if (typeof rawValue === 'object' && rawValue !== null) {
      return rawValue as Partial<CachedConnectionsCatalog>
    }

    return null
  }

  private async readCatalog(): Promise<CachedConnectionsCatalog | null> {
    const rawValue = await cache.get({ key: CONNECTIONS_CATALOG_CACHE_KEY })
    if (!rawValue) {
      return null
    }

    const parsed = this.parseCachedCatalog(rawValue)
    if (!parsed || typeof parsed.cachedAt !== 'number' || !Array.isArray(parsed.entries)) {
      return null
    }

    return {
      cachedAt: parsed.cachedAt,
      entries: this.toCatalogEntries(parsed.entries as ConnectionStatus[]),
    }
  }

  async writeCatalog(entries: ConnectionStatus[]): Promise<void> {
    const normalizedEntries = this.toCatalogEntries(entries)
    const payload: CachedConnectionsCatalog = {
      cachedAt: Date.now(),
      entries: normalizedEntries,
    }

    await cache.set({
      key: CONNECTIONS_CATALOG_CACHE_KEY,
      value: payload,
      ttl: CONNECTIONS_CATALOG_CACHE_TTL_MS,
    })
  }

  async getCatalog(loadCatalog: () => Promise<ConnectionStatus[]>): Promise<ConnectionStatus[]> {
    const cachedCatalog = await this.readCatalog()

    if (cachedCatalog) {
      if (!this.isFresh(cachedCatalog.cachedAt)) {
        void ConnectionsCatalogRefreshRequested.dispatch('stale').catch((error) => {
          this.logger.warn(
            { operation: 'connections_catalog_refresh_dispatch_failed', error },
            'Failed to dispatch global connections catalog refresh event'
          )
        })
      }

      return cachedCatalog.entries
    }

    const freshCatalog = await loadCatalog()
    await this.writeCatalog(freshCatalog)
    return this.toCatalogEntries(freshCatalog)
  }
}
