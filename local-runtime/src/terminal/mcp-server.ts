// Streamable-HTTP MCP endpoint (WP-C) mounted at `/mcp` on the existing REST
// http server. Lets an MCP-capable coding agent (running in the embedded
// terminal, or anywhere else pointed at this runtime) PULL the same UI context
// the renderer PUSHES into the terminal's stdin — see ui-context.ts for the
// shared store/resolution logic.
//
// Stateless mode (`sessionIdGenerator: undefined`, no session bookkeeping):
// this runtime has no need for the resumable-stream story stateful mode
// exists for. Following the SDK's documented stateless pattern, a fresh
// McpServer + transport is built per request — a single McpServer instance
// is meant to `connect()` to exactly one transport, and reusing one across
// unrelated requests is not the supported shape for stateless HTTP.
//
// Kept isolated so rest-server.ts only gains a one-line route hook (mirrors
// the existing staticWeb.handle / socketIoStub.handleHttp pattern).
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Logger } from 'pino'
import { z } from 'zod'
import { emptyEnrichedContext, enrichContext, type UiContextMount, type UiContextStore } from './ui-context.js'

/** A mounted workspace as seen by the MCP tools — real `Mount`s (via `MountManager`) satisfy this structurally. */
export interface McpMount extends UiContextMount {
  workspaceId: string
}

/** Narrow view of MountManager the MCP tools need — kept structural so this module is unit-testable without real mounts. */
export interface MountSource {
  list(): McpMount[]
  get(workspaceId: string): McpMount | undefined
}

export interface McpHandlerOptions {
  mountManager: MountSource
  uiContextStore: UiContextStore
  logger: Logger
}

export interface McpHandler {
  /** Handles a request whose pathname is exactly `/mcp`. False (no-op) for any other path. */
  handle(req: IncomingMessage, res: ServerResponse, pathname: string): boolean
}

function jsonText(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * Fresh McpServer with both tools registered — see the module doc for why
 * this is built per-request in `createMcpHandler`. Exported directly for
 * tests, which connect it to an `InMemoryTransport` instead of going over HTTP.
 */
export function createKanwasMcpServer(options: McpHandlerOptions): McpServer {
  const { mountManager, uiContextStore } = options
  const server = new McpServer({ name: 'kanwas', version: '1.0.0' })

  server.registerTool(
    'kanwas_workspace_info',
    {
      title: 'Kanwas workspace info',
      description: 'List the Kanwas workspace(s) this runtime has mounted: id, absolute folder path, and display name.',
    },
    async () => {
      const workspaces = mountManager.list().map((mount) => ({
        id: mount.workspaceId,
        folder: mount.folder,
        name: path.basename(mount.folder) || mount.folder,
      }))
      return jsonText({ workspaces })
    }
  )

  server.registerTool(
    'kanwas_get_ui_context',
    {
      title: 'Kanwas UI context',
      description:
        'What the user is currently looking at in the Kanwas canvas right now: the active canvas, selected node(s), ' +
        'the open document, and any selected text — each resolved to a workspace-relative file path (and line range, ' +
        'for text selections) on disk. Pass `workspace` (its id) when more than one workspace is mounted; otherwise ' +
        "defaults to whichever workspace's context was most recently reported.",
      inputSchema: { workspace: z.string().optional() },
    },
    async ({ workspace }: { workspace?: string }) => {
      const workspaceId = workspace ?? uiContextStore.mostRecent()?.workspaceId
      if (!workspaceId) return jsonText({ error: 'No UI context has been reported yet' })

      const mount = mountManager.get(workspaceId)
      if (!mount) return jsonText({ error: `Unknown or unmounted workspace: ${workspaceId}` })

      const stored = uiContextStore.get(workspaceId)
      const enriched = stored ? enrichContext(mount, stored.input, stored.updatedAt) : emptyEnrichedContext()
      return jsonText({ ...enriched, workspaceFolder: mount.folder })
    }
  )

  return server
}

export function createMcpHandler(options: McpHandlerOptions): McpHandler {
  const log = options.logger.child({ component: 'Mcp' })

  return {
    handle(req, res, pathname) {
      if (pathname !== '/mcp') return false

      void (async () => {
        const server = createKanwasMcpServer(options)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.on('close', () => {
          void transport.close()
          void server.close()
        })
        try {
          await server.connect(transport)
          await transport.handleRequest(req, res)
        } catch (error) {
          log.error({ error: String(error) }, 'MCP request failed')
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Internal server error' }))
          }
        }
      })()
      return true
    },
  }
}
