import type { ChangeEvent } from 'react'
import { ConnectionsCategoryFilterButton } from './ConnectionsCategoryFilterButton'
import type { CategoryFilterOption } from './categoryFilterOptions'
import type { CategoryFilter, ConnectionFilter, StatusFilterOption } from './useConnectionsCatalog'

interface ConnectionsToolbarProps {
  searchQuery: string
  connectionFilter: ConnectionFilter
  statusFilters: StatusFilterOption[]
  activeCategory: CategoryFilter
  allCategoriesLabel: string
  allCategoriesCount: number
  categoryOptions: CategoryFilterOption[]
  onSearchQueryChange: (value: string) => void
  onClearSearch: () => void
  onConnectionFilterChange: (filter: ConnectionFilter) => void
  onSelectCategory: (category: CategoryFilter) => void
}

export function ConnectionsToolbar({
  searchQuery,
  connectionFilter,
  statusFilters,
  activeCategory,
  allCategoriesLabel,
  allCategoriesCount,
  categoryOptions,
  onSearchQueryChange,
  onClearSearch,
  onConnectionFilterChange,
  onSelectCategory,
}: ConnectionsToolbarProps) {
  const isAllCategorySelected = activeCategory === 'all'

  const handleSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(event.target.value)
  }

  return (
    <div className="px-5 lg:px-6 py-4 border-b border-outline/70">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-foreground-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInputChange}
            placeholder="Search by name, description, or category"
            className="w-full bg-editor border border-outline rounded-md text-sm text-foreground pl-8 pr-10 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {searchQuery.length > 0 ? (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <i className="fa-solid fa-xmark text-[12px]" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {statusFilters.map((filter) => {
            const isActive = connectionFilter === filter.value

            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => onConnectionFilterChange(filter.value)}
                className={`
                  px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors cursor-pointer
                  ${
                    isActive
                      ? 'bg-foreground text-canvas font-medium'
                      : 'bg-editor border border-outline text-foreground-muted hover:text-foreground hover:bg-block-highlight'
                  }
                `}
              >
                <span className="inline-flex items-center gap-1.5">
                  {filter.dotClassName ? (
                    <span className={`h-1.5 w-1.5 rounded-full ${filter.dotClassName}`} aria-hidden="true" />
                  ) : null}
                  <span>{filter.label}</span>
                  <span className="opacity-70">{filter.count}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 lg:hidden overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          <ConnectionsCategoryFilterButton
            variant="chip"
            label={allCategoriesLabel}
            count={allCategoriesCount}
            iconClassName="fa-solid fa-layer-group"
            iconColorClassName="text-foreground-muted/80"
            isSelected={isAllCategorySelected}
            onClick={() => onSelectCategory('all')}
          />

          {categoryOptions.map((category) => (
            <ConnectionsCategoryFilterButton
              key={category.slug}
              variant="chip"
              label={category.label}
              count={category.count}
              iconClassName={category.iconClassName}
              iconColorClassName={category.iconColorClassName}
              isSelected={activeCategory === category.slug}
              onClick={() => onSelectCategory(category.slug)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
