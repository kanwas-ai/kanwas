import { useMemo } from 'react'
import type { ToolkitStatus } from '@/api/connections'
import {
  POPULAR_CATEGORY,
  getCategoryVisualMap,
  getPmCategoryPriority,
  getPopularToolkitOrder,
  isToolkitPopular,
  normalizeToolkitKey,
} from './catalogPresentation'

export type ConnectionFilter = 'all' | 'installed' | 'not_installed'
export type CategoryFilter = 'all' | string

export interface CategoryCounter {
  slug: string
  name: string
  count: number
}

export interface StatusFilterOption {
  value: ConnectionFilter
  label: string
  count: number
  dotClassName?: string
}

function normalizeSearchTerm(search: string): string {
  return search.trim().toLowerCase()
}

function getConnectionSearchPriority(connection: ToolkitStatus, normalizedSearchQuery: string): number {
  if (normalizedSearchQuery.length === 0) {
    return 0
  }

  const normalizedDisplayName = normalizeSearchTerm(connection.displayName)

  if (normalizedDisplayName === normalizedSearchQuery) {
    return 0
  }

  if (normalizedDisplayName.startsWith(normalizedSearchQuery)) {
    return 1
  }

  if (normalizedDisplayName.includes(normalizedSearchQuery)) {
    return 2
  }

  return 3
}

export function sortConnectionsBySearchRelevance(
  connections: ToolkitStatus[],
  normalizedSearchQuery: string
): ToolkitStatus[] {
  return [...connections].sort((a, b) => {
    const aSearchPriority = getConnectionSearchPriority(a, normalizedSearchQuery)
    const bSearchPriority = getConnectionSearchPriority(b, normalizedSearchQuery)

    if (aSearchPriority !== bSearchPriority) {
      return aSearchPriority - bSearchPriority
    }

    const aInstalledRank = isInstalledConnection(a) ? 0 : 1
    const bInstalledRank = isInstalledConnection(b) ? 0 : 1

    if (aInstalledRank !== bInstalledRank) {
      return aInstalledRank - bInstalledRank
    }

    return a.displayName.localeCompare(b.displayName)
  })
}

function getSearchableText(connection: ToolkitStatus): string {
  const categoriesText = (connection.categories ?? []).map((category) => category.name).join(' ')
  return [connection.displayName, connection.description, categoriesText]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

function getCategoryCounters(connections: ToolkitStatus[]): CategoryCounter[] {
  const counters = new Map<string, CategoryCounter>()

  for (const connection of connections) {
    const perConnectionSeen = new Set<string>()

    for (const category of connection.categories ?? []) {
      const slug = category.slug?.trim().toLowerCase()
      const name = category.name?.trim()

      if (!slug || !name || perConnectionSeen.has(slug)) {
        continue
      }

      perConnectionSeen.add(slug)
      const existing = counters.get(slug)

      if (existing) {
        existing.count += 1
      } else {
        counters.set(slug, { slug, name, count: 1 })
      }
    }
  }

  return Array.from(counters.values()).sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count
    }

    return a.name.localeCompare(b.name)
  })
}

function hasCategory(connection: ToolkitStatus, categorySlug: string): boolean {
  return (connection.categories ?? []).some((category) => category.slug === categorySlug)
}

export function isInstalledConnection(connection: ToolkitStatus): boolean {
  return connection.isConnected && !connection.isNoAuth
}

export function getConnectionColumnCount(width: number): number {
  if (width >= 1360) {
    return 3
  }

  if (width >= 920) {
    return 2
  }

  return 1
}

export function getConnectionGridClassName(columnCount: number): string {
  if (columnCount >= 3) {
    return 'grid-cols-3'
  }

  if (columnCount === 2) {
    return 'grid-cols-2'
  }

  return 'grid-cols-1'
}

interface UseConnectionsCatalogOptions {
  connections: ToolkitStatus[] | undefined
  searchQuery: string
  connectionFilter: ConnectionFilter
  selectedCategory: CategoryFilter
}

export function useConnectionsCatalog({
  connections,
  searchQuery,
  connectionFilter,
  selectedCategory,
}: UseConnectionsCatalogOptions) {
  const allConnections = useMemo(() => {
    if (!connections) {
      return []
    }

    return [...connections].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [connections])

  const allConnectionsWithSearchText = useMemo(
    () =>
      allConnections.map((connection) => ({
        connection,
        searchableText: getSearchableText(connection),
      })),
    [allConnections]
  )

  const normalizedSearchQuery = useMemo(() => normalizeSearchTerm(searchQuery), [searchQuery])
  const hasActiveSearch = normalizedSearchQuery.length > 0
  const activeCategory: CategoryFilter = hasActiveSearch ? 'all' : selectedCategory

  const searchAndStatusFilteredConnections = useMemo(() => {
    return allConnectionsWithSearchText
      .filter(({ connection, searchableText }) => {
        if (normalizedSearchQuery && !searchableText.includes(normalizedSearchQuery)) {
          return false
        }

        if (connectionFilter === 'installed') {
          return isInstalledConnection(connection)
        }

        if (connectionFilter === 'not_installed') {
          return !isInstalledConnection(connection)
        }

        return true
      })
      .map(({ connection }) => connection)
  }, [allConnectionsWithSearchText, normalizedSearchQuery, connectionFilter])

  const popularToolkitOrder = useMemo(
    () => getPopularToolkitOrder(searchAndStatusFilteredConnections),
    [searchAndStatusFilteredConnections]
  )
  const popularToolkitKeySet = useMemo(() => new Set(popularToolkitOrder), [popularToolkitOrder])
  const popularToolkitRankByKey = useMemo(() => {
    const rankByKey = new Map<string, number>()

    popularToolkitOrder.forEach((toolkitKey, index) => {
      rankByKey.set(toolkitKey, index)
    })

    return rankByKey
  }, [popularToolkitOrder])

  const categoryCounters = useMemo(() => {
    const counters = getCategoryCounters(searchAndStatusFilteredConnections)
      .filter((category) => category.slug !== POPULAR_CATEGORY.slug)
      .sort((a, b) => {
        const pmPriorityDiff = getPmCategoryPriority(a) - getPmCategoryPriority(b)
        if (pmPriorityDiff !== 0) {
          return pmPriorityDiff
        }

        if (a.count !== b.count) {
          return b.count - a.count
        }

        return a.name.localeCompare(b.name)
      })

    return [
      {
        slug: POPULAR_CATEGORY.slug,
        name: POPULAR_CATEGORY.name,
        count: popularToolkitOrder.length,
      },
      ...counters,
    ]
  }, [searchAndStatusFilteredConnections, popularToolkitOrder])

  const categoryVisualBySlug = useMemo(() => getCategoryVisualMap(categoryCounters), [categoryCounters])

  const filteredConnections = useMemo(() => {
    const categoryFilteredConnections =
      activeCategory === 'all'
        ? searchAndStatusFilteredConnections
        : activeCategory === POPULAR_CATEGORY.slug
          ? searchAndStatusFilteredConnections.filter((connection) =>
              isToolkitPopular(connection.toolkit, popularToolkitKeySet)
            )
          : searchAndStatusFilteredConnections.filter((connection) => hasCategory(connection, activeCategory))

    if (activeCategory === POPULAR_CATEGORY.slug) {
      return [...categoryFilteredConnections].sort((a, b) => {
        const aRank = popularToolkitRankByKey.get(normalizeToolkitKey(a.toolkit)) ?? Number.MAX_SAFE_INTEGER
        const bRank = popularToolkitRankByKey.get(normalizeToolkitKey(b.toolkit)) ?? Number.MAX_SAFE_INTEGER

        if (aRank !== bRank) {
          return aRank - bRank
        }

        return a.displayName.localeCompare(b.displayName)
      })
    }

    return sortConnectionsBySearchRelevance(categoryFilteredConnections, normalizedSearchQuery)
  }, [
    searchAndStatusFilteredConnections,
    activeCategory,
    popularToolkitKeySet,
    popularToolkitRankByKey,
    normalizedSearchQuery,
  ])

  const installedCount = useMemo(
    () => allConnections.filter((connection) => isInstalledConnection(connection)).length,
    [allConnections]
  )
  const totalCount = allConnections.length
  const notInstalledCount = totalCount - installedCount

  const statusFilters: StatusFilterOption[] = useMemo(
    () => [
      { value: 'all', label: 'All', count: totalCount },
      { value: 'installed', label: 'Installed', count: installedCount, dotClassName: 'bg-status-success' },
      { value: 'not_installed', label: 'Not installed', count: notInstalledCount, dotClassName: 'bg-orange-300' },
    ],
    [installedCount, notInstalledCount, totalCount]
  )

  return {
    activeCategory,
    allConnections,
    categoryCounters,
    categoryVisualBySlug,
    filteredConnections,
    hasActiveSearch,
    installedCount,
    notInstalledCount,
    searchAndStatusFilteredConnections,
    statusFilters,
    totalCount,
  }
}
