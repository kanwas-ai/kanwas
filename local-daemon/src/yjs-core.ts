import { NoopBackendNotifier } from 'kanwas-yjs-server/backend-notifier'
import { DisabledDocumentShareResolver } from 'kanwas-yjs-server/document-share-resolver'
import { logger as yjsLogger } from 'kanwas-yjs-server/logger'
import { startYjsServer, type RunningYjsServer } from 'kanwas-yjs-server/server'
import type { DocumentStore } from 'kanwas-yjs-server/storage'

export interface YjsCoreOptions {
  /** Per-run HMAC secret — signs AND verifies socket tokens (one process). */
  secret: string
  store: DocumentStore
  host: string
  port: number
  saveDebounceMs?: number
  saveMaxWaitMs?: number
}

/**
 * Start the embedded Yjs sync core by reusing yjs-server's own assembly
 * (`startYjsServer`) unchanged. It owns socket.io (Yjs rooms/subdocs), the
 * socket-token verifier (same `secret` the REST minter uses), and the admin
 * `/documents/:id/replace` HTTP endpoint on the same port.
 *
 * `BACKEND_URL`-unset semantics are reproduced by injecting a no-op backend
 * notifier + disabled share resolver, so there are zero cloud callbacks.
 */
export async function startYjsCore(options: YjsCoreOptions): Promise<RunningYjsServer> {
  return startYjsServer({
    adminSecret: options.secret,
    backendNotifier: new NoopBackendNotifier(),
    documentShareResolver: new DisabledDocumentShareResolver(),
    host: options.host,
    logger: yjsLogger,
    port: options.port,
    saveDebounceMs: options.saveDebounceMs ?? 1000,
    saveMaxWaitMs: options.saveMaxWaitMs ?? 5000,
    socketPingIntervalMs: 10_000,
    socketPingTimeoutMs: 5_000,
    store: options.store,
  })
}
