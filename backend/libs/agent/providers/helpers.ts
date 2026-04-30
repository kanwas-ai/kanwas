import type { ModelTier } from '../types.js'

export function normalizeModelOverride(model?: string): string | undefined {
  const trimmed = model?.trim()
  return trimmed ? trimmed : undefined
}

export function resolveModelTiers(defaultModelTiers: Record<ModelTier, string>, modelOverride?: string) {
  if (!modelOverride) {
    return defaultModelTiers
  }

  return {
    small: modelOverride,
    medium: modelOverride,
    big: modelOverride,
  }
}
