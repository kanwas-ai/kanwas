/**
 * Composio Integration with Vercel AI SDK
 *
 * Provides Composio tools for external service integrations (Gmail, Slack, etc.)
 * in Vercel AI SDK format for use with generateText() and ToolLoopAgent.
 */
import { Composio } from '@composio/core'
import { VercelProvider } from '@composio/vercel'
import type { ToolContext } from '../tools/context.js'
import env from '#start/env'
import { buildComposioUserIdentity } from '#services/composio/identity'

// ============================================================================
// Types
// ============================================================================

type ToolRecord = Record<string, any>

// ============================================================================
// Singleton Instances
// ============================================================================

// Composio with VercelProvider for Tool Router (returns Vercel AI SDK format)
let composioInstance: ReturnType<typeof createComposioInstance> | null = null

function createComposioInstance() {
  const apiKey = env.get('COMPOSIO_API_KEY')
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY environment variable is not set')
  }
  return new Composio({
    apiKey,
    provider: new VercelProvider(),
  })
}

function getComposio() {
  if (!composioInstance) {
    composioInstance = createComposioInstance()
  }
  return composioInstance
}

// Core Composio instance for direct API calls (no provider needed)
let composioCoreInstance: Composio | null = null

function getComposioCore(): Composio {
  if (!composioCoreInstance) {
    const apiKey = env.get('COMPOSIO_API_KEY')
    if (!apiKey) {
      throw new Error('COMPOSIO_API_KEY environment variable is not set')
    }
    composioCoreInstance = new Composio({ apiKey })
  }
  return composioCoreInstance
}

// ============================================================================
// Connected Accounts Mapping
// ============================================================================

/**
 * Get connected accounts mapping for Tool Router session.
 * The Tool Router requires explicit { toolkitSlug: connectedAccountId } mapping
 * to know which accounts to use for authenticated tool execution.
 */
async function getConnectedAccountsMapping(entityId: string): Promise<Record<string, string>> {
  const composioCore = getComposioCore()
  const accounts = await composioCore.connectedAccounts.list({
    userIds: [entityId],
    statuses: ['ACTIVE'],
  })

  const mapping: Record<string, string> = {}
  for (const account of accounts.items) {
    // Get toolkit slug from the account
    const toolkit = (account as any).appName || (account as any).toolkit?.slug
    if (toolkit && account.id) {
      mapping[toolkit.toLowerCase()] = account.id
    }
  }

  return mapping
}

// ============================================================================
// Entity ID
// ============================================================================

/**
 * Get the Composio entity ID for a user/workspace.
 * Format: u_{userId}_w_{workspaceId}
 */
export function getComposioEntityId(userId: string, workspaceId: string): string {
  return buildComposioUserIdentity(userId, workspaceId)
}

// ============================================================================
// Tool Fetching
// ============================================================================

/**
 * Get Composio Tool Router for a user's connected services.
 * Returns the Tool Router - a single meta-tool that handles search,
 * authentication, and execution across all connected Composio tools.
 *
 * @returns Tool Router in Vercel AI SDK format (ready for generateText)
 */
export async function getComposioTools(userId: string, workspaceId: string): Promise<ToolRecord> {
  const entityId = getComposioEntityId(userId, workspaceId)

  try {
    // Fetch connected accounts mapping - Tool Router needs this to know which accounts to use
    const connectedAccounts = await getConnectedAccountsMapping(entityId)

    const composio = getComposio()
    const session = await composio.create(entityId, {
      manageConnections: false,
      connectedAccounts,
    })
    const tools = await session.tools()

    return tools
  } catch (error) {
    console.error('[Composio] Failed to create session:', error)
    return {}
  }
}

/**
 * Get Composio tools wrapped with timeline tracking for UI visibility.
 * Each tool execution creates ComposioToolItem events in the timeline.
 * Meta-tools get specialized wrappers with rich UI feedback.
 */
export async function getComposioToolsWithTimeline(
  userId: string,
  workspaceId: string,
  context: ToolContext
): Promise<ToolRecord> {
  const tools = await getComposioTools(userId, workspaceId)

  if (Object.keys(tools).length === 0) {
    return {}
  }

  // Wrap each tool with timeline tracking
  // Meta-tools get specialized wrappers, others get generic wrapper
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      if (META_TOOL_NAMES.includes(name)) {
        return [name, wrapComposioMetaTool(name, tool, context)]
      }
      return [name, wrapToolWithTimeline(name, tool, context)]
    })
  )
}

// ============================================================================
// Timeline Tracking Wrapper
// ============================================================================

function wrapToolWithTimeline(toolName: string, tool: any, context: ToolContext): any {
  const originalExecute = tool.execute
  if (!originalExecute) {
    return tool // No execute function to wrap
  }

  return {
    ...tool,
    execute: async (input: unknown, execContext: unknown) => {
      const { state } = context
      const displayName = formatToolDisplayName(toolName)
      const toolkit = extractToolkit(toolName)

      // Create timeline item
      const itemId = state.addTimelineItem(
        {
          type: 'composio_tool',
          toolkit,
          status: 'in_progress',
          thought: `Executing ${displayName}`,
          timestamp: Date.now(),
        },
        'composio_action'
      )

      try {
        const result = await originalExecute(input, execContext)

        state.updateTimelineItem(itemId, { status: 'completed' }, 'composio_action')

        return result
      } catch (error) {
        state.updateTimelineItem(
          itemId,
          {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
          'composio_action'
        )
        throw error
      }
    },
  }
}

// ============================================================================
// Meta-Tool Specialized Wrappers
// ============================================================================

const META_TOOL_NAMES = [
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_REMOTE_WORKBENCH',
  'COMPOSIO_REMOTE_BASH_TOOL',
  'COMPOSIO_GET_TOOL_SCHEMAS',
]

/**
 * Parse tool result (handles both string and object results).
 */
function parseResult(result: any): any {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result)
    } catch {
      return result
    }
  }
  return result
}

/**
 * Wrap Composio meta-tools with specialized timeline tracking.
 * Each meta-tool gets rich UI feedback tailored to its purpose.
 */
function wrapComposioMetaTool(toolName: string, tool: any, context: ToolContext): any {
  const originalExecute = tool.execute
  if (!originalExecute) {
    return tool
  }

  const { state } = context

  switch (toolName) {
    case 'COMPOSIO_SEARCH_TOOLS':
      return {
        ...tool,
        execute: async (input: any, execContext: unknown) => {
          const useCase = input.queries?.[0]?.use_case || input.query || 'Unknown'
          const knownFields = input.queries?.[0]?.known_fields

          const itemId = state.addTimelineItem(
            {
              type: 'composio_search',
              useCase,
              knownFields,
              timestamp: Date.now(),
              status: 'searching',
            },
            'composio_action'
          )

          try {
            const result = await originalExecute(input, execContext)
            const parsed = parseResult(result)
            const data = parsed?.data || parsed

            let toolsFound = 0
            let tools: Array<{ toolSlug: string; description: string; toolkit: string }> = []
            let validatedPlan: string[] = []

            if (data?.results && Array.isArray(data.results)) {
              for (const queryResult of data.results) {
                if (queryResult.primary_tool_slugs && Array.isArray(queryResult.primary_tool_slugs)) {
                  toolsFound += queryResult.primary_tool_slugs.length
                  queryResult.primary_tool_slugs.forEach((slug: string) => {
                    tools.push({
                      toolSlug: slug,
                      description: data.tool_schemas?.[slug]?.description || '',
                      toolkit: queryResult.toolkits?.[0] || 'unknown',
                    })
                  })
                }
                if (queryResult.validated_plan && Array.isArray(queryResult.validated_plan)) {
                  validatedPlan = queryResult.validated_plan
                }
              }
            }

            state.updateTimelineItem(
              itemId,
              { status: 'completed', toolsFound, tools, validatedPlan },
              'composio_action'
            )

            return result
          } catch (error) {
            state.updateTimelineItem(
              itemId,
              { status: 'failed', error: error instanceof Error ? error.message : 'Search failed' },
              'composio_action'
            )
            throw error
          }
        },
      }

    case 'COMPOSIO_MULTI_EXECUTE_TOOL':
      return {
        ...tool,
        execute: async (input: any, execContext: unknown) => {
          const tools = input.tools || []
          const toolsMetadata = tools.map((t: any) => {
            const slug = t.tool_slug
            const displayName = formatToolDisplayName(slug)
            const toolkit = slug.split('_')[0].toLowerCase()
            return { slug, displayName, toolkit }
          })

          const uniqueToolkits = new Set(toolsMetadata.map((t: any) => t.toolkit))
          const toolkit = uniqueToolkits.size === 1 ? toolsMetadata[0]?.toolkit || 'unknown' : 'mixed'

          const itemId = state.addTimelineItem(
            {
              type: 'composio_tool',
              toolkit,
              timestamp: Date.now(),
              status: 'initializing',
              toolCount: toolsMetadata.length,
              tools: toolsMetadata,
            },
            'composio_action'
          )

          try {
            const result = await originalExecute(input, execContext)
            const parsed = parseResult(result)
            const responseData = parsed?.data || parsed
            const isError = parsed?.isError || parsed?.successful === false || (responseData?.error_count ?? 0) > 0

            state.updateTimelineItem(
              itemId,
              { status: isError ? 'failed' : 'completed', error: isError ? 'Tool execution failed' : undefined },
              'composio_action'
            )

            return result
          } catch (error) {
            state.updateTimelineItem(
              itemId,
              { status: 'failed', error: error instanceof Error ? error.message : 'Execution failed' },
              'composio_action'
            )
            throw error
          }
        },
      }

    case 'COMPOSIO_REMOTE_WORKBENCH':
      return {
        ...tool,
        execute: async (input: any, execContext: unknown) => {
          const thought = input.thought || 'Executing Python code'
          const code = input.code_to_execute

          const itemId = state.addTimelineItem(
            {
              type: 'composio_workbench',
              codeDescription: thought,
              timestamp: Date.now(),
              status: 'executing',
              thought,
              code,
            },
            'composio_action'
          )

          try {
            const result = await originalExecute(input, execContext)
            const response = parseResult(result)
            const hasError = !!response.error

            state.updateTimelineItem(
              itemId,
              { status: hasError ? 'failed' : 'completed', error: hasError ? response.error : undefined },
              'composio_action'
            )

            return result
          } catch (error) {
            state.updateTimelineItem(
              itemId,
              { status: 'failed', error: error instanceof Error ? error.message : 'Code execution failed' },
              'composio_action'
            )
            throw error
          }
        },
      }

    case 'COMPOSIO_REMOTE_BASH_TOOL':
      return {
        ...tool,
        execute: async (input: any, execContext: unknown) => {
          const command = input.command || ''

          const itemId = state.addTimelineItem(
            {
              type: 'composio_bash',
              command,
              timestamp: Date.now(),
              status: 'executing',
            },
            'composio_action'
          )

          try {
            const result = await originalExecute(input, execContext)
            const parsed = parseResult(result)
            const data = parsed?.data || parsed
            const isError = !!data?.error

            state.updateTimelineItem(
              itemId,
              {
                status: isError ? 'failed' : 'completed',
                stdout: data?.stdout,
                stderr: data?.stderr,
                error: isError ? data?.error : undefined,
              },
              'composio_action'
            )

            return result
          } catch (error) {
            state.updateTimelineItem(
              itemId,
              { status: 'failed', error: error instanceof Error ? error.message : 'Bash execution failed' },
              'composio_action'
            )
            throw error
          }
        },
      }

    case 'COMPOSIO_GET_TOOL_SCHEMAS':
      return {
        ...tool,
        execute: async (input: any, execContext: unknown) => {
          const toolSlugs = input.tool_slugs || []

          const itemId = state.addTimelineItem(
            {
              type: 'composio_schema',
              toolSlugs,
              timestamp: Date.now(),
              status: 'fetching',
            },
            'composio_action'
          )

          try {
            const result = await originalExecute(input, execContext)
            const parsed = parseResult(result)
            const data = parsed?.data || parsed
            const schemas = data?.tool_schemas || {}
            const schemasFound = Object.keys(schemas).length

            state.updateTimelineItem(itemId, { status: 'completed', schemasFound }, 'composio_action')

            return result
          } catch (error) {
            state.updateTimelineItem(
              itemId,
              { status: 'failed', error: error instanceof Error ? error.message : 'Schema fetch failed' },
              'composio_action'
            )
            throw error
          }
        },
      }

    default:
      // Unknown meta-tool, use generic wrapper
      return wrapToolWithTimeline(toolName, tool, context)
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract toolkit name from tool slug.
 * Example: "GMAIL_SEND_EMAIL" -> "gmail"
 */
function extractToolkit(toolSlug: string): string {
  const parts = toolSlug.split('_')
  return parts[0]?.toLowerCase() || toolSlug.toLowerCase()
}

/**
 * Format tool display name for UI.
 * Example: "GMAIL_SEND_EMAIL" -> "Gmail: Send Email"
 */
export function formatToolDisplayName(toolSlug: string): string {
  const cleaned = toolSlug.replace(/^COMPOSIO_/i, '')
  const parts = cleaned.split('_')

  if (parts.length < 2) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
  }

  const toolkit = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  const action = parts
    .slice(1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  return `${toolkit}: ${action}`
}
