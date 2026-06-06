import { tuyau } from './client'

export interface GBrainSearchResult {
  path: string
  title: string
  snippet: string
  score?: number
  sourceType?: 'shared' | 'private' | 'fixture' | 'unknown'
  updatedAt?: string
}

export interface GBrainPage {
  path: string
  title: string
  markdown: string
  sourceType?: 'shared' | 'private' | 'fixture' | 'unknown'
  updatedAt?: string
}

function extractApiError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
    return error.error
  }

  return fallback
}

export async function searchGBrainPages(workspaceId: string, query: string, limit = 8): Promise<GBrainSearchResult[]> {
  const response = await tuyau.workspaces({ id: workspaceId }).gbrain.search.$get({
    query: { query, limit: String(limit) },
  })

  if (response.error) {
    throw new Error(extractApiError(response.error, 'Failed to search GBrain'))
  }

  return (response.data as { results: GBrainSearchResult[] }).results
}

export async function readGBrainPage(workspaceId: string, pagePath: string): Promise<GBrainPage> {
  const response = await tuyau.workspaces({ id: workspaceId }).gbrain.page.$get({
    query: { path: pagePath },
  })

  if (response.error) {
    throw new Error(extractApiError(response.error, 'Failed to read GBrain page'))
  }

  return response.data as GBrainPage
}
