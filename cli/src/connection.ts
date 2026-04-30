import WebSocket from 'ws'
import { connectToWorkspace, type WorkspaceConnection } from 'shared'
import { apiFetch } from './api.js'
import type { GlobalConfig } from './config.js'

interface ConnectParams {
  yjsServerHost: string
  workspaceId: string
  globalConfig: GlobalConfig
}

async function fetchSocketToken(globalConfig: GlobalConfig, workspaceId: string): Promise<string> {
  const response = await apiFetch(globalConfig, `/workspaces/${workspaceId}/yjs-socket-token`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to mint Yjs socket token: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as { token: string; expiresAt: string }
  if (!data.token) {
    throw new Error('Yjs socket token response missing "token" field')
  }
  return data.token
}

export async function connect(params: ConnectParams): Promise<WorkspaceConnection> {
  const isLocalhost =
    params.yjsServerHost.includes('localhost') ||
    params.yjsServerHost.includes('127.0.0.1') ||
    params.yjsServerHost.includes('0.0.0.0')
  const protocol = isLocalhost ? 'ws' : 'wss'

  const socketToken = await fetchSocketToken(params.globalConfig, params.workspaceId)

  return connectToWorkspace({
    clientKind: 'cli',
    host: params.yjsServerHost,
    workspaceId: params.workspaceId,
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    protocol,
    timeout: 15000,
    socketToken,
  })
}
