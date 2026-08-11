import * as Y from 'yjs'

export type BinaryPayload = ArrayBuffer | Uint8Array | number[]
export type AwarenessChanges = { added: number[]; updated: number[]; removed: number[] }
export type ProviderParams =
  | Record<string, string | null | undefined>
  | (() => Record<string, string | null | undefined>)

const LOCALHOST_PREFIXES = ['localhost', '127.0.0.1', '0.0.0.0']

export function normalizeServerUrl(host: string, protocol?: 'ws' | 'wss'): string {
  if (/^https?:\/\//.test(host)) {
    return host
  }

  if (/^wss?:\/\//.test(host)) {
    return host.replace(/^ws/, 'http')
  }

  const resolvedProtocol = resolveProtocol(host, protocol)
  return `${resolvedProtocol === 'wss' ? 'https' : 'http'}://${host}`
}

export function normalizeBinary(payload: BinaryPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  return Uint8Array.from(payload)
}

export function getAuthParams(
  params: ProviderParams | undefined
): Record<string, string | null | undefined> | undefined {
  if (!params) {
    return undefined
  }

  return typeof params === 'function' ? params() : params
}

export function installWebSocketPolyfill(WebSocketPolyfill?: typeof globalThis.WebSocket): void {
  if (typeof globalThis.WebSocket === 'undefined' && WebSocketPolyfill) {
    ;(globalThis as any).WebSocket = WebSocketPolyfill
  }
}

export function isDocReady(doc: Y.Doc): boolean {
  return doc.share.size > 0
}

export function collectChangedClients(changes: AwarenessChanges): number[] {
  return changes.added.concat(changes.updated, changes.removed)
}

function isLocalHost(host: string): boolean {
  return LOCALHOST_PREFIXES.some((prefix) => host === prefix || host.startsWith(`${prefix}:`))
}

function resolveProtocol(host: string, protocol?: 'ws' | 'wss'): 'ws' | 'wss' {
  if (protocol) {
    return protocol
  }

  if (isLocalHost(host)) {
    return 'ws'
  }

  const browserLocation = (globalThis as { location?: { protocol?: string } }).location
  if (browserLocation?.protocol === 'http:') {
    return 'ws'
  }

  return 'wss'
}
