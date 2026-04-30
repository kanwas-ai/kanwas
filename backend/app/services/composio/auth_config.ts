import { isRecord } from './normalization.js'
import type { AuthConfigState } from './types.js'

export function normalizeAuthConfigState(rawAuthConfig: unknown): AuthConfigState | undefined {
  if (!isRecord(rawAuthConfig)) {
    return undefined
  }

  const id =
    typeof rawAuthConfig.id === 'string' && rawAuthConfig.id.trim().length > 0 ? rawAuthConfig.id.trim() : undefined
  const name =
    typeof rawAuthConfig.name === 'string' && rawAuthConfig.name.trim().length > 0
      ? rawAuthConfig.name.trim()
      : undefined

  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(typeof rawAuthConfig.isComposioManaged === 'boolean'
      ? { isComposioManaged: rawAuthConfig.isComposioManaged }
      : {}),
  }
}
