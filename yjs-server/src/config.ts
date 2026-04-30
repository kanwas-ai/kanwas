import path from 'node:path'
import { HttpBackendNotifier, NoopBackendNotifier, type BackendNotifier } from './backend-notifier.js'
import {
  DisabledDocumentShareResolver,
  HttpDocumentShareResolver,
  type DocumentShareResolver,
} from './document-share-resolver.js'
import { logger } from './logger.js'
import { MigratingDocumentStore } from './migrating-document-store.js'
import { FileDocumentStore, R2DocumentStore, type DocumentStore, type LegacyDocumentStore } from './storage.js'

export interface YjsServerConfig {
  adminSecret: string
  backendNotificationsEnabled: boolean
  backendNotifier: BackendNotifier
  documentShareResolver: DocumentShareResolver
  sharedLinkResolutionEnabled: boolean
  host: string
  logLevel: string
  port: number
  saveDebounceMs: number
  socketPingIntervalMs: number
  socketPingTimeoutMs: number
  sentry: YjsServerSentryConfig
  storageDriver: 'fs' | 'r2'
  store: DocumentStore
}

export interface YjsServerSentryConfig {
  dsn: string
  enabled: boolean
  environment: string
}

export function loadConfig(): YjsServerConfig {
  const port = Number(process.env.PORT ?? 1999)
  const host = process.env.HOST ?? '0.0.0.0'
  const logLevel = process.env.YJS_SERVER_LOG_LEVEL?.trim() || process.env.LOG_LEVEL?.trim() || 'info'
  const saveDebounceMs = Number(process.env.YJS_SERVER_SAVE_DEBOUNCE_MS ?? 1000)
  const socketPingIntervalMs = Number(process.env.YJS_SERVER_SOCKET_PING_INTERVAL_MS ?? 10 * 1000)
  const socketPingTimeoutMs = Number(process.env.YJS_SERVER_SOCKET_PING_TIMEOUT_MS ?? 5 * 1000)
  const adminSecret = process.env.BACKEND_API_SECRET
  const backendUrl = process.env.BACKEND_URL?.trim()
  const storageDriver = resolveStorageDriver()

  if (!adminSecret) {
    throw new Error('BACKEND_API_SECRET is required')
  }

  return {
    adminSecret,
    backendNotificationsEnabled: Boolean(backendUrl),
    backendNotifier: loadBackendNotifier(adminSecret, backendUrl),
    documentShareResolver: loadDocumentShareResolver(adminSecret, backendUrl),
    host,
    logLevel,
    port,
    saveDebounceMs: Number.isFinite(saveDebounceMs) && saveDebounceMs > 0 ? saveDebounceMs : 1000,
    socketPingIntervalMs:
      Number.isFinite(socketPingIntervalMs) && socketPingIntervalMs > 0 ? socketPingIntervalMs : 10 * 1000,
    socketPingTimeoutMs:
      Number.isFinite(socketPingTimeoutMs) && socketPingTimeoutMs > 0 ? socketPingTimeoutMs : 5 * 1000,
    sharedLinkResolutionEnabled: Boolean(backendUrl),
    sentry: loadSentryConfig(),
    storageDriver,
    store: new MigratingDocumentStore(loadDocumentStore(storageDriver), logger),
  }
}

function loadSentryConfig(): YjsServerSentryConfig {
  const dsn = process.env.SENTRY_DSN?.trim() ?? ''
  const environment = process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV?.trim() || 'development'

  return {
    dsn,
    enabled: dsn.length > 0,
    environment,
  }
}

function loadBackendNotifier(adminSecret: string, backendUrl?: string): BackendNotifier {
  if (!backendUrl) {
    return new NoopBackendNotifier()
  }

  return new HttpBackendNotifier({
    backendApiSecret: adminSecret,
    backendUrl,
    logger,
  })
}

function loadDocumentShareResolver(adminSecret: string, backendUrl?: string): DocumentShareResolver {
  if (!backendUrl) {
    return new DisabledDocumentShareResolver()
  }

  return new HttpDocumentShareResolver({
    backendApiSecret: adminSecret,
    backendUrl,
  })
}

function loadDocumentStore(driver: 'fs' | 'r2'): LegacyDocumentStore {
  if (driver === 'fs') {
    const directory = process.env.YJS_SERVER_STORE_DIR?.trim() || path.resolve('.yjs-server-data')
    return new FileDocumentStore(directory, logger)
  }

  const endpoint = process.env.YJS_SERVER_R2_ENDPOINT?.trim()
  const bucket = process.env.YJS_SERVER_R2_BUCKET?.trim()
  const accessKeyId = process.env.YJS_SERVER_R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.YJS_SERVER_R2_SECRET_ACCESS_KEY?.trim()

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'YJS_SERVER_R2_ENDPOINT, YJS_SERVER_R2_BUCKET, YJS_SERVER_R2_ACCESS_KEY_ID, and YJS_SERVER_R2_SECRET_ACCESS_KEY are required when YJS_SERVER_STORAGE_DRIVER=r2'
    )
  }

  return new R2DocumentStore({
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle: process.env.YJS_SERVER_R2_FORCE_PATH_STYLE !== 'false',
    logger,
    region: process.env.YJS_SERVER_R2_REGION?.trim() || 'auto',
    secretAccessKey,
  })
}

function resolveStorageDriver(): 'fs' | 'r2' {
  return (process.env.YJS_SERVER_STORAGE_DRIVER ?? 'r2').toLowerCase() === 'fs' ? 'fs' : 'r2'
}
