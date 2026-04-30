import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'
import { emitToolCostSpan, PARALLEL_COSTS } from './costs.js'

export const webFetchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20).describe('The URLs to fetch content from.'),
  objective: z
    .string()
    .optional()
    .describe(
      'A concise, self-contained extraction objective. Include the key entity or topic plus any specific information to pull from the pages. If not provided, the entire pages are fetched.'
    ),
})

export const webFetchTool = tool({
  description:
    'Fetches content from the given URLs, returning the content of each page, or if objective is provided, the content most relevant to that objective. Use this to fetch specific pages after search narrows down which URLs matter.',
  inputSchema: webFetchSchema,
  execute: async (input, execContext) => {
    const ctx = getToolContext(execContext)
    const { state, agent, webSearchService } = ctx
    const toolCallId = getToolCallId(execContext)
    const urls = [...new Set(input.urls.map((url) => url.trim()).filter(Boolean))]
    const objective = input.objective?.trim() || undefined

    const timelineId = state.addTimelineItem(
      {
        type: 'web_fetch',
        urls,
        objective,
        timestamp: Date.now(),
        status: 'fetching',
        agent,
      },
      'web_fetch_started',
      toolCallId
    )

    try {
      const { pages, errors } = await webSearchService.extract(urls, objective, ctx.traceContext.sessionId)
      const totalContentLength = pages.reduce((sum, page) => sum + page.content.length, 0)

      emitToolCostSpan({
        context: ctx,
        toolName: 'web_fetch',
        toolCallId,
        costUsd: PARALLEL_COSTS.web_fetch.cost,
        costSource: PARALLEL_COSTS.web_fetch.source,
      })

      state.updateTimelineItem(
        timelineId,
        pages.length > 0
          ? {
              status: 'completed',
              contentLength: totalContentLength,
              resultsFound: pages.length,
              errorsFound: errors.length,
              results: pages.map((page) => ({
                title: page.title,
                url: page.url,
                contentLength: page.content.length,
                publishDate: page.publishDate,
              })),
            }
          : {
              status: 'failed',
              error: formatFetchErrors(errors),
            },
        pages.length > 0 ? 'web_fetch_completed' : 'web_fetch_failed'
      )

      if (pages.length === 0) {
        return `Failed to fetch URLs: ${formatFetchErrors(errors)}`
      }

      return formatFetchedPages(pages, errors)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      state.updateTimelineItem(
        timelineId,
        {
          status: 'failed',
          error: errorMessage,
        },
        'web_fetch_failed'
      )

      return `Failed to fetch URLs: ${errorMessage}`
    }
  },
})

function formatFetchedPages(
  pages: Array<{ title: string; url: string; publishDate?: string; content: string }>,
  errors: Array<{ url: string; error: string }>
): string {
  const formattedPages = pages
    .map((page) => {
      const dateLine = page.publishDate ? `Published: ${page.publishDate}\n` : ''
      return `# ${page.title}\n\nSource: ${page.url}\n${dateLine}\n${page.content}`
    })
    .join('\n\n---\n\n')

  if (errors.length === 0) {
    return formattedPages
  }

  const formattedErrors = errors.map((error, index) => `${index + 1}. ${error.url} - ${error.error}`).join('\n')
  return `${formattedPages}\n\n## Extraction errors\n${formattedErrors}`
}

function formatFetchErrors(errors: Array<{ url: string; error: string }>): string {
  if (errors.length === 0) {
    return 'No content could be extracted from the provided URLs.'
  }

  return errors.map((error) => `${error.url}: ${error.error}`).join('; ')
}
