import type { GlobalConfig } from './config.js'

/**
 * Central API fetch wrapper that handles auth errors consistently.
 */
export async function apiFetch(globalConfig: GlobalConfig, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${globalConfig.backendUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${globalConfig.authToken}`,
    },
  })

  if (res.status === 401) {
    throw new Error('Authentication expired. Run "kanwas login" to re-authenticate.')
  }
  if (res.status === 403) {
    throw new Error('Access denied. You may not have permission for this workspace.')
  }

  return res
}
