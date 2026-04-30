import { afterEach, describe, expect, it } from 'vitest'
import { HttpBackendNotifier, NoopBackendNotifier } from '../../src/backend-notifier.js'
import { loadConfig } from '../../src/config.js'
import { MigratingDocumentStore } from '../../src/migrating-document-store.js'
import { FileDocumentStore, R2DocumentStore } from '../../src/storage.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('loadConfig', () => {
  it('requires BACKEND_API_SECRET', () => {
    delete process.env.BACKEND_API_SECRET

    expect(() => loadConfig()).toThrow('BACKEND_API_SECRET is required')
  })

  it('loads filesystem storage defaults and a noop backend notifier', () => {
    process.env.BACKEND_API_SECRET = 'secret'
    process.env.NODE_ENV = 'development'
    process.env.YJS_SERVER_STORAGE_DRIVER = 'fs'
    delete process.env.BACKEND_URL
    delete process.env.PORT
    delete process.env.HOST
    delete process.env.LOG_LEVEL
    delete process.env.SENTRY_DSN
    delete process.env.SENTRY_ENVIRONMENT
    delete process.env.YJS_SERVER_LOG_LEVEL
    delete process.env.YJS_SERVER_SAVE_DEBOUNCE_MS
    delete process.env.YJS_SERVER_SOCKET_PING_INTERVAL_MS
    delete process.env.YJS_SERVER_SOCKET_PING_TIMEOUT_MS
    delete process.env.YJS_SERVER_STORE_DIR

    const config = loadConfig()

    expect(config.port).toBe(1999)
    expect(config.host).toBe('0.0.0.0')
    expect(config.logLevel).toBe('info')
    expect(config.saveDebounceMs).toBe(1000)
    expect(config.socketPingIntervalMs).toBe(10 * 1000)
    expect(config.socketPingTimeoutMs).toBe(5 * 1000)
    expect(config.backendNotificationsEnabled).toBe(false)
    expect(config.storageDriver).toBe('fs')
    expect(config.backendNotifier).toBeInstanceOf(NoopBackendNotifier)
    expect(config.sentry).toEqual({
      dsn: '',
      enabled: false,
      environment: 'development',
    })
    expect(config.store).toBeInstanceOf(MigratingDocumentStore)
    expect((config.store as { store: FileDocumentStore }).store).toBeInstanceOf(FileDocumentStore)
    expect((config.store as { store: { directory: string } }).store.directory).toContain('.yjs-server-data')
  })

  it('loads trimmed R2 settings and an HTTP backend notifier', () => {
    process.env.BACKEND_API_SECRET = 'secret'
    process.env.BACKEND_URL = ' https://backend.test '
    process.env.HOST = '127.0.0.1'
    process.env.YJS_SERVER_LOG_LEVEL = ' debug '
    process.env.PORT = '2999'
    process.env.SENTRY_DSN = ' https://examplePublicKey@o0.ingest.sentry.io/0 '
    process.env.SENTRY_ENVIRONMENT = ' staging '
    process.env.YJS_SERVER_SAVE_DEBOUNCE_MS = '250'
    process.env.YJS_SERVER_SOCKET_PING_INTERVAL_MS = '12000'
    process.env.YJS_SERVER_SOCKET_PING_TIMEOUT_MS = '6000'
    process.env.YJS_SERVER_R2_ENDPOINT = ' https://r2.test '
    process.env.YJS_SERVER_R2_BUCKET = ' docs '
    process.env.YJS_SERVER_R2_ACCESS_KEY_ID = ' key '
    process.env.YJS_SERVER_R2_SECRET_ACCESS_KEY = ' secret-key '
    process.env.YJS_SERVER_R2_REGION = ' eu-central-1 '
    process.env.YJS_SERVER_R2_FORCE_PATH_STYLE = 'false'

    const config = loadConfig()

    expect(config.port).toBe(2999)
    expect(config.host).toBe('127.0.0.1')
    expect(config.logLevel).toBe('debug')
    expect(config.saveDebounceMs).toBe(250)
    expect(config.socketPingIntervalMs).toBe(12000)
    expect(config.socketPingTimeoutMs).toBe(6000)
    expect(config.backendNotificationsEnabled).toBe(true)
    expect(config.storageDriver).toBe('r2')
    expect(config.backendNotifier).toBeInstanceOf(HttpBackendNotifier)
    expect(config.sentry).toEqual({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      enabled: true,
      environment: 'staging',
    })
    expect(config.store).toBeInstanceOf(MigratingDocumentStore)
    expect((config.store as { store: R2DocumentStore }).store).toBeInstanceOf(R2DocumentStore)
    expect((config.store as { store: { options: Record<string, unknown> } }).store.options).toEqual(
      expect.objectContaining({
        accessKeyId: 'key',
        bucket: 'docs',
        endpoint: 'https://r2.test',
        forcePathStyle: false,
        region: 'eu-central-1',
        secretAccessKey: 'secret-key',
      })
    )
  })

  it('throws when R2 configuration is incomplete', () => {
    process.env.BACKEND_API_SECRET = 'secret'
    delete process.env.YJS_SERVER_STORAGE_DRIVER
    process.env.YJS_SERVER_R2_ENDPOINT = 'https://r2.test'
    process.env.YJS_SERVER_R2_BUCKET = 'docs'
    process.env.YJS_SERVER_R2_ACCESS_KEY_ID = 'key'
    delete process.env.YJS_SERVER_R2_SECRET_ACCESS_KEY

    expect(() => loadConfig()).toThrow(
      'YJS_SERVER_R2_ENDPOINT, YJS_SERVER_R2_BUCKET, YJS_SERVER_R2_ACCESS_KEY_ID, and YJS_SERVER_R2_SECRET_ACCESS_KEY are required when YJS_SERVER_STORAGE_DRIVER=r2'
    )
  })

  it('falls back to the default heartbeat settings when invalid', () => {
    process.env.BACKEND_API_SECRET = 'secret'
    process.env.YJS_SERVER_STORAGE_DRIVER = 'fs'
    process.env.YJS_SERVER_SOCKET_PING_INTERVAL_MS = '0'
    process.env.YJS_SERVER_SOCKET_PING_TIMEOUT_MS = '-1'

    const config = loadConfig()

    expect(config.socketPingIntervalMs).toBe(10 * 1000)
    expect(config.socketPingTimeoutMs).toBe(5 * 1000)
  })
})
