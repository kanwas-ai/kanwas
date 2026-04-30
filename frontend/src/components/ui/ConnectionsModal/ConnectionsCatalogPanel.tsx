import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ToolkitStatus } from '@/api/connections'
import { POPULAR_CATEGORY, formatCategoryLabel } from './catalogPresentation'
import { buildCategoryFilterOptions } from './categoryFilterOptions'
import { ConnectionsCategorySidebar } from './ConnectionsCategorySidebar'
import { ConnectionsModalFooter } from './ConnectionsModalFooter'
import { ConnectionsModalHeader } from './ConnectionsModalHeader'
import { ConnectionsResultsPanel } from './ConnectionsResultsPanel'
import { ConnectionsToolbar } from './ConnectionsToolbar'
import { useCategorySidebarResize } from './useCategorySidebarResize'
import { type CategoryFilter, type ConnectionFilter, useConnectionsCatalog } from './useConnectionsCatalog'

interface ConnectionsCatalogPanelProps {
  isOpen: boolean
  isLoading: boolean
  connections: ToolkitStatus[] | undefined
  onClose: () => void
  onConnectToolkit: (toolkit: string) => Promise<void> | void
  onDisconnect: (connectedAccountId: string) => Promise<void> | void
  activeAttemptToolkit: string | null
  isConnectionAttemptInProgress: boolean
  initialSearch?: string | null
}

export function ConnectionsCatalogPanel({
  isOpen,
  isLoading,
  connections,
  onClose,
  onConnectToolkit,
  onDisconnect,
  activeAttemptToolkit,
  isConnectionAttemptInProgress,
  initialSearch,
}: ConnectionsCatalogPanelProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '')
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(
    initialSearch ? 'all' : POPULAR_CATEGORY.slug
  )

  const { categorySidebarWidth, isCategorySidebarResizing, handleCategorySidebarResizeStart } =
    useCategorySidebarResize({
      isOpen,
    })

  useEffect(() => {
    if (isOpen) {
      // Pre-fill search when opening with initialSearch (e.g., from contextual tip)
      if (initialSearch) {
        setSearchQuery(initialSearch)
        setSelectedCategory('all')
      }
      return
    }

    setSearchQuery('')
    setConnectionFilter('all')
    setSelectedCategory(POPULAR_CATEGORY.slug)
  }, [isOpen, initialSearch])

  const {
    activeCategory,
    categoryCounters,
    categoryVisualBySlug,
    filteredConnections,
    hasActiveSearch,
    installedCount,
    searchAndStatusFilteredConnections,
    statusFilters,
    totalCount,
  } = useConnectionsCatalog({
    connections,
    searchQuery,
    connectionFilter,
    selectedCategory,
  })

  useEffect(() => {
    if (hasActiveSearch || selectedCategory === 'all') {
      return
    }

    const isSelectedCategoryVisible = categoryCounters.some((category) => category.slug === selectedCategory)
    if (!isSelectedCategoryVisible) {
      setSelectedCategory('all')
    }
  }, [categoryCounters, hasActiveSearch, selectedCategory])

  const allCategoriesLabel = formatCategoryLabel('All categories', 'upper')
  const allCategoriesCount = searchAndStatusFilteredConnections.length
  const categoryOptions = useMemo(
    () => buildCategoryFilterOptions(categoryCounters, categoryVisualBySlug),
    [categoryCounters, categoryVisualBySlug]
  )

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleConnectionFilterChange = useCallback((filter: ConnectionFilter) => {
    setConnectionFilter(filter)
  }, [])

  const handleSelectCategory = useCallback((category: CategoryFilter) => {
    setSelectedCategory(category)
  }, [])

  return (
    <div className="bg-canvas rounded-lg border border-outline shadow-2xl flex flex-col w-[92vw] max-w-[1320px] h-[88vh] max-h-[920px] min-h-[620px] animate-[scaleIn_0.15s_ease-out]">
      <ConnectionsModalHeader installedCount={installedCount} totalCount={totalCount} onClose={onClose} />

      <div className="flex-1 min-h-0 flex">
        <ConnectionsCategorySidebar
          width={categorySidebarWidth}
          isResizing={isCategorySidebarResizing}
          activeCategory={activeCategory}
          allCategoriesLabel={allCategoriesLabel}
          allCategoriesCount={allCategoriesCount}
          categoryOptions={categoryOptions}
          onSelectCategory={handleSelectCategory}
          onResizeStart={handleCategorySidebarResizeStart}
        />

        <section className="flex-1 min-w-0 flex flex-col">
          <ConnectionsToolbar
            searchQuery={searchQuery}
            connectionFilter={connectionFilter}
            statusFilters={statusFilters}
            activeCategory={activeCategory}
            allCategoriesLabel={allCategoriesLabel}
            allCategoriesCount={allCategoriesCount}
            categoryOptions={categoryOptions}
            onSearchQueryChange={handleSearchQueryChange}
            onClearSearch={handleClearSearch}
            onConnectionFilterChange={handleConnectionFilterChange}
            onSelectCategory={handleSelectCategory}
          />

          <ConnectionsResultsPanel
            isOpen={isOpen}
            isLoading={isLoading}
            filteredConnections={filteredConnections}
            isCategorySidebarResizing={isCategorySidebarResizing}
            activeAttemptToolkit={activeAttemptToolkit}
            isConnectionAttemptInProgress={isConnectionAttemptInProgress}
            highlightToolkit={initialSearch ?? null}
            onConnectToolkit={onConnectToolkit}
            onDisconnect={onDisconnect}
          />
        </section>
      </div>

      <ConnectionsModalFooter />
    </div>
  )
}
