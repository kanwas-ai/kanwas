import type { MouseEvent as ReactMouseEvent } from 'react'
import { ConnectionsCategoryFilterButton } from './ConnectionsCategoryFilterButton'
import type { CategoryFilterOption } from './categoryFilterOptions'
import type { CategoryFilter } from './useConnectionsCatalog'

interface ConnectionsCategorySidebarProps {
  width: number
  isResizing: boolean
  activeCategory: CategoryFilter
  allCategoriesLabel: string
  allCategoriesCount: number
  categoryOptions: CategoryFilterOption[]
  onSelectCategory: (category: CategoryFilter) => void
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
}

export function ConnectionsCategorySidebar({
  width,
  isResizing,
  activeCategory,
  allCategoriesLabel,
  allCategoriesCount,
  categoryOptions,
  onSelectCategory,
  onResizeStart,
}: ConnectionsCategorySidebarProps) {
  const isAllCategorySelected = activeCategory === 'all'

  return (
    <aside
      className="relative hidden lg:flex border-r border-outline bg-editor/45 flex-col"
      style={{ width: `${width}px` }}
    >
      <div className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2">
        <ConnectionsCategoryFilterButton
          variant="sidebar"
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
            variant="sidebar"
            label={category.label}
            count={category.count}
            iconClassName={category.iconClassName}
            iconColorClassName={category.iconColorClassName}
            isSelected={activeCategory === category.slug}
            onClick={() => onSelectCategory(category.slug)}
            className="mt-1"
          />
        ))}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize categories sidebar"
        className="group absolute top-0 -right-2 z-20 h-full w-4 cursor-col-resize"
        onMouseDown={onResizeStart}
      >
        <div
          className={`absolute left-1/2 top-0 h-full -translate-x-1/2 transition-all ${
            isResizing ? 'w-1 bg-outline' : 'w-px bg-transparent group-hover:w-0.5 group-hover:bg-outline/80'
          }`}
        />
      </div>
    </aside>
  )
}
