import type { WebSearchResult } from '#agent/types'
import env from '#start/env'
import Parallel from 'parallel-web'

const MAX_RESULTS = 10
const MAX_CHARS_PER_RESULT = 1500
const MAX_EXCERPT_CHARS = 5000
const MAX_FULL_CONTENT_CHARS = 50000

export interface ExtractedWebPage {
  title: string
  url: string
  publishDate?: string
  content: string
}

export interface WebExtractError {
  url: string
  error: string
}

/**
 * Simple web search service using Parallel.ai SDK
 */
export default class WebSearchService {
  private client: Parallel

  constructor(apiKey: string) {
    this.client = new Parallel({ apiKey })
  }

  async search(objective: string, searchQueries?: string[], sessionId?: string): Promise<WebSearchResult[]> {
    const normalizedSearchQueries = searchQueries?.map((query) => query.trim()).filter(Boolean)

    // SDK types are outdated - using type assertion for new API params (mode, objective)
    const response = await this.client.beta.search({
      mode: 'agentic',
      objective,
      ...(normalizedSearchQueries?.length ? { search_queries: normalizedSearchQueries } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      max_results: MAX_RESULTS,
      max_chars_per_result: MAX_CHARS_PER_RESULT,
    } as any)

    const results = response.results || []

    return results.slice(0, MAX_RESULTS).map((item: any) => ({
      title: item.title || new URL(item.url).hostname,
      url: item.url,
      snippet: item.excerpts?.join('\n\n') || '',
    }))
  }

  async extract(
    urls: string[],
    objective?: string,
    sessionId?: string
  ): Promise<{ pages: ExtractedWebPage[]; errors: WebExtractError[] }> {
    const normalizedUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))]
    const normalizedObjective = objective?.trim() || undefined
    const hasObjective = Boolean(normalizedObjective)

    const response = await this.client.beta.extract({
      urls: normalizedUrls,
      objective: normalizedObjective,
      ...(sessionId ? { session_id: sessionId } : {}),
      excerpts: hasObjective ? { max_chars_per_result: MAX_EXCERPT_CHARS } : false,
      full_content: hasObjective ? false : { max_chars_per_result: MAX_FULL_CONTENT_CHARS },
    } as any)

    const pages: ExtractedWebPage[] = []
    const emptyContentErrors: WebExtractError[] = []

    for (const item of response.results || []) {
      const content = hasObjective ? item.excerpts?.join('\n\n') || '' : item.full_content || ''

      if (!content) {
        emptyContentErrors.push({
          url: item.url,
          error: 'No content extracted from URL',
        })
        continue
      }

      pages.push({
        title: item.title || new URL(item.url).hostname,
        url: item.url,
        publishDate: item.publish_date || undefined,
        content,
      })
    }

    const errors = [...(response.errors || []), ...emptyContentErrors].map((error: any) => ({
      url: error.url,
      error:
        'error' in error && typeof error.error === 'string'
          ? error.error
          : `${error.error_type}${error.http_status_code ? ` (HTTP ${error.http_status_code})` : ''}`,
    }))

    return { pages, errors }
  }

  static create(): WebSearchService {
    const apiKey = env.get('PARALLEL_API_KEY')
    if (!apiKey) {
      throw new Error('PARALLEL_API_KEY environment variable is not set')
    }
    return new WebSearchService(apiKey)
  }
}
