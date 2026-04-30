import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'
import { emitToolCostSpan, PARALLEL_COSTS } from './costs.js'

export const webSearchSchema = z.object({
  objective: z
    .string()
    .describe(
      'A concise, self-contained search objective. Include the key entity or topic plus any source, freshness, or content-type guidance.'
    ),
  search_queries: z
    .array(z.string())
    .min(3)
    .max(3)
    .optional()
    .describe(
      'Exactly 3 diverse keyword queries, each 3-6 words. Vary names, synonyms, and angles. Include the key entity or topic in each query. Do not write sentences or use site: operators.'
    ),
})

export const webSearchTool = tool({
  description: `Searches the web for current and factual information, returning relevant results with titles, URLs, and content snippets.

Use both fields for best results:
- objective: a concise, self-contained search objective that includes the key entity or topic.
- search_queries: exactly 3 diverse keyword queries, each 3-6 words, varying entity names, synonyms, and angles. Include the key entity or topic in every query. Do not write sentences or use site: operators.

Examples:
- objective: "Find recent pricing information for OpenAI API models. Prefer official OpenAI documentation and announcements from 2024-2025."
  search_queries: ["OpenAI API pricing", "OpenAI model pricing", "OpenAI pricing updates"]
- objective: "Research best practices for React Server Components. Focus on official Next.js documentation and Vercel blog posts."
  search_queries: ["React Server Components", "Next.js RSC patterns", "Vercel server components"]`,
  inputSchema: webSearchSchema,
  execute: async (input, execContext) => {
    const ctx = getToolContext(execContext)
    const { state, webSearchService, agent } = ctx
    const toolCallId = getToolCallId(execContext)

    const searchItemId = state.addTimelineItem(
      {
        type: 'web_search',
        objective: input.objective,
        searchQueries: input.search_queries,
        timestamp: Date.now(),
        status: 'searching',
        agent,
      },
      'web_search_started',
      toolCallId
    )

    try {
      const results = await webSearchService.search(input.objective, input.search_queries, ctx.traceContext.sessionId)

      emitToolCostSpan({
        context: ctx,
        toolName: 'web_search',
        toolCallId,
        costUsd: PARALLEL_COSTS.web_search.cost,
        costSource: PARALLEL_COSTS.web_search.source,
      })

      state.updateTimelineItem(
        searchItemId,
        {
          status: 'completed',
          resultsFound: results.length,
          results: results,
        },
        'web_search_completed'
      )

      if (results.length === 0) {
        return 'No results found.'
      }

      const formattedResults = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')

      return formattedResults
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      state.updateTimelineItem(
        searchItemId,
        {
          status: 'failed',
          error: errorMessage,
        },
        'web_search_failed'
      )

      return `Web search failed: ${errorMessage}`
    }
  },
})
