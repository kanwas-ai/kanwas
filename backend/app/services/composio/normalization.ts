import type { ConnectionCategory } from './types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeToolkit(toolkit?: string): string | undefined {
  if (!toolkit) {
    return undefined
  }

  const normalizedToolkit = toolkit.trim().toLowerCase()
  return normalizedToolkit.length > 0 ? normalizedToolkit : undefined
}

export function normalizeConnectionFilterToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue.length > 0 ? normalizedValue : undefined
}

export function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalizedDescription = value.trim()
  return normalizedDescription.length > 0 ? normalizedDescription : undefined
}

export function normalizeCategory(rawCategory: unknown): ConnectionCategory | undefined {
  if (!isRecord(rawCategory)) {
    return undefined
  }

  const rawSlug = typeof rawCategory.slug === 'string' ? rawCategory.slug : rawCategory.id
  const slug = typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : ''
  const name = typeof rawCategory.name === 'string' ? rawCategory.name.trim() : ''

  if (!slug || !name) {
    return undefined
  }

  return { slug, name }
}

export function normalizeCategories(rawCategories: unknown): ConnectionCategory[] | undefined {
  if (!Array.isArray(rawCategories)) {
    return undefined
  }

  const categoriesBySlug = new Map<string, ConnectionCategory>()

  for (const rawCategory of rawCategories) {
    const category = normalizeCategory(rawCategory)
    if (category) {
      categoriesBySlug.set(category.slug, category)
    }
  }

  return categoriesBySlug.size > 0 ? Array.from(categoriesBySlug.values()) : undefined
}

export function normalizeConnectedAccountStatus(status: unknown): string | undefined {
  if (typeof status !== 'string') {
    return undefined
  }

  const normalizedStatus = status.trim().toUpperCase()
  return normalizedStatus.length > 0 ? normalizedStatus : undefined
}
