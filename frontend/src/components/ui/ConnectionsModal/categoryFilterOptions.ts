import { formatCategoryLabel, getCategoryVisual } from './catalogPresentation'
import type { CategoryCounter } from './useConnectionsCatalog'

type CategoryVisual = ReturnType<typeof getCategoryVisual>

export interface CategoryFilterOption {
  slug: string
  label: string
  count: number
  iconClassName: string
  iconColorClassName: string
}

export function buildCategoryFilterOptions(
  categoryCounters: CategoryCounter[],
  categoryVisualBySlug: Map<string, CategoryVisual>
): CategoryFilterOption[] {
  return categoryCounters.map((category) => {
    const categoryVisual = categoryVisualBySlug.get(category.slug) ?? getCategoryVisual(category)

    return {
      slug: category.slug,
      label: formatCategoryLabel(category.name, 'upper'),
      count: category.count,
      iconClassName: categoryVisual.iconClassName,
      iconColorClassName: categoryVisual.iconColorClassName,
    }
  })
}
