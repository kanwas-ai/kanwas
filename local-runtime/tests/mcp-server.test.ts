// Exercises the MCP tool handlers over a real (in-process) MCP client/server
// round-trip — InMemoryTransport pairs a Client directly with our McpServer,
// so this validates tool registration + schema + the handler's actual output,
// not just the pure ui-context helpers it delegates to.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLogger } from '../src/logger.js'
import {
  createKanwasMcpServer,
  KANWAS_MCP_INSTRUCTIONS,
  type McpMount,
  type MountSource,
} from '../src/terminal/mcp-server.js'
import { UiContextStore } from '../src/terminal/ui-context.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tmpFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-mcp-'))
  tmpDirs.push(dir)
  return dir
}

function fakeMountSource(mounts: McpMount[]): MountSource {
  return {
    list: () => mounts,
    get: (workspaceId) => mounts.find((m) => m.workspaceId === workspaceId),
  }
}

/** Connects a fresh Client to `server` over a linked in-memory transport pair. */
async function connectedClient(server: Awaited<ReturnType<typeof createKanwasMcpServer>>): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content = result.content as Array<{ type: string; text?: string }>
  const text = content.find((c) => c.type === 'text')?.text
  return text ? JSON.parse(text) : undefined
}

describe('kanwas_workspace_info', () => {
  it('lists mounted workspaces', async () => {
    const mounts: McpMount[] = [
      { workspaceId: 'ws-1', folder: '/vaults/one', orchestrator: { resolveNodePath: () => undefined } },
    ]
    const server = createKanwasMcpServer({
      mountManager: fakeMountSource(mounts),
      uiContextStore: new UiContextStore(),
      logger,
    })
    const client = await connectedClient(server)

    expect(client.getInstructions()).toBe(KANWAS_MCP_INSTRUCTIONS)
    const result = await client.callTool({ name: 'kanwas_workspace_info', arguments: {} })
    expect(textOf(result)).toEqual({ workspaces: [{ id: 'ws-1', folder: '/vaults/one', name: 'one' }] })
  })
})

describe('kanwas_get_ui_context', () => {
  it('returns the enriched context for the most recently updated workspace by default', async () => {
    const folder = tmpFolder()
    fs.mkdirSync(path.join(folder, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'notes/a.md'), 'first line\nsecond line\n', 'utf-8')

    const mounts: McpMount[] = [
      {
        workspaceId: 'ws-1',
        folder,
        orchestrator: { resolveNodePath: (id) => (id === 'n1' ? 'notes/a.md' : undefined) },
      },
    ]
    const uiContextStore = new UiContextStore()
    uiContextStore.set('ws-1', {
      activeCanvasId: 'root',
      selectedNodeIds: ['n1'],
      openDocument: { nodeId: 'n1' },
      textSelection: { nodeId: 'n1', text: 'second line' },
    })

    const server = createKanwasMcpServer({ mountManager: fakeMountSource(mounts), uiContextStore, logger })
    const client = await connectedClient(server)

    const result = await client.callTool({ name: 'kanwas_get_ui_context', arguments: {} })
    const payload = textOf(result) as Record<string, unknown>

    expect(payload.workspaceFolder).toBe(folder)
    expect(payload.activeCanvasId).toBe('root')
    expect(payload.selectedPaths).toEqual(['notes/a.md'])
    expect(payload.openDocument).toEqual({ nodeId: 'n1', path: 'notes/a.md' })
    expect(payload.textSelection).toEqual({
      nodeId: 'n1',
      text: 'second line',
      path: 'notes/a.md',
      startLine: 2,
      endLine: 2,
    })
  })

  it('accepts an explicit `workspace` arg to pick among several mounted workspaces', async () => {
    const mounts: McpMount[] = [
      { workspaceId: 'ws-1', folder: '/vaults/one', orchestrator: { resolveNodePath: () => undefined } },
      { workspaceId: 'ws-2', folder: '/vaults/two', orchestrator: { resolveNodePath: () => undefined } },
    ]
    const uiContextStore = new UiContextStore()
    uiContextStore.set('ws-1', {
      activeCanvasId: 'root-1',
      selectedNodeIds: [],
      openDocument: null,
      textSelection: null,
    })
    uiContextStore.set('ws-2', {
      activeCanvasId: 'root-2',
      selectedNodeIds: [],
      openDocument: null,
      textSelection: null,
    })

    const server = createKanwasMcpServer({ mountManager: fakeMountSource(mounts), uiContextStore, logger })
    const client = await connectedClient(server)

    const result = await client.callTool({ name: 'kanwas_get_ui_context', arguments: { workspace: 'ws-1' } })
    const payload = textOf(result) as Record<string, unknown>
    expect(payload.workspaceFolder).toBe('/vaults/one')
    expect(payload.activeCanvasId).toBe('root-1')
  })

  it('reports an error payload when nothing has been reported yet', async () => {
    const server = createKanwasMcpServer({
      mountManager: fakeMountSource([]),
      uiContextStore: new UiContextStore(),
      logger,
    })
    const client = await connectedClient(server)

    const result = await client.callTool({ name: 'kanwas_get_ui_context', arguments: {} })
    expect(textOf(result)).toEqual({ error: 'No UI context has been reported yet' })
  })
})
