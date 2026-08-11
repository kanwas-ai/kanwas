import env from '#start/env'

const LOCALHOST_PREFIXES = ['localhost', '127.0.0.1', '0.0.0.0']
const DEFAULT_YJS_SERVER_HOST = 'localhost:1999'
const DEFAULT_SYNC_TIMEOUT_MS = 10_000

export interface YjsServerConnectionConfig {
  host: string
  protocol: 'ws' | 'wss'
  httpProtocol: 'http' | 'https'
  syncTimeoutMs: number
}

function isLocalHost(host: string): boolean {
  return LOCALHOST_PREFIXES.some((prefix) => host === prefix || host.startsWith(`${prefix}:`))
}

export function getYjsServerConnectionConfig(): YjsServerConnectionConfig {
  const host = env.get('YJS_SERVER_HOST', DEFAULT_YJS_SERVER_HOST)
  const configuredProtocol = env.get('YJS_SERVER_PROTOCOL')?.toLowerCase()

  const protocol: 'ws' | 'wss' =
    configuredProtocol === 'ws' || configuredProtocol === 'wss' ? configuredProtocol : isLocalHost(host) ? 'ws' : 'wss'

  const rawTimeout = Number(process.env.YJS_SERVER_SYNC_TIMEOUT_MS)
  const syncTimeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_SYNC_TIMEOUT_MS

  return {
    host,
    httpProtocol: protocol === 'wss' ? 'https' : 'http',
    protocol,
    syncTimeoutMs,
  }
}
