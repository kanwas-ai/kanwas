import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const closeMock = vi.fn(async () => undefined)
const captureExceptionMock = vi.fn()
const initMock = vi.fn()
const sentryLoggerMock = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}

vi.mock('@sentry/node', () => ({
  captureException: captureExceptionMock,
  close: closeMock,
  init: initMock,
  logger: sentryLoggerMock,
}))

describe('sentry', () => {
  beforeEach(() => {
    vi.resetModules()
    closeMock.mockClear()
    captureExceptionMock.mockClear()
    initMock.mockClear()
    sentryLoggerMock.debug.mockClear()
    sentryLoggerMock.error.mockClear()
    sentryLoggerMock.info.mockClear()
    sentryLoggerMock.warn.mockClear()
  })

  afterEach(async () => {
    const sentry = await import('../../src/sentry.js')
    await sentry.flush()
  })

  it('does not initialize when the DSN is missing', async () => {
    const sentry = await import('../../src/sentry.js')

    sentry.initSentry({
      dsn: '',
      environment: 'test',
    })
    sentry.captureException(new Error('boom'))

    expect(initMock).not.toHaveBeenCalled()
    expect(captureExceptionMock).not.toHaveBeenCalled()
    expect(closeMock).not.toHaveBeenCalled()
  })

  it('initializes once and scrubs sensitive log attributes', async () => {
    const sentry = await import('../../src/sentry.js')

    sentry.initSentry({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'staging',
    })
    sentry.initSentry({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'staging',
    })

    expect(initMock).toHaveBeenCalledTimes(1)

    const initOptions = initMock.mock.calls[0][0] as {
      _experiments: { enableLogs: boolean }
      beforeSendLog: (log: { attributes?: Record<string, string> }) => { attributes?: Record<string, string> }
      dsn: string
      environment: string
      initialScope: { tags: Record<string, string> }
      release: string
    }

    expect(initOptions).toEqual(
      expect.objectContaining({
        _experiments: { enableLogs: true },
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'staging',
        initialScope: { tags: { component: 'yjs-server' } },
        release: expect.stringContaining('kanwas-yjs-server@'),
      })
    )

    const filteredLog = initOptions.beforeSendLog({
      attributes: {
        authorization: 'Bearer secret',
        keep: 'ok',
        password: 'hunter2',
      },
    })

    expect(filteredLog.attributes).toEqual({ keep: 'ok' })
  })

  it('captures structured logs with primitive attributes only', async () => {
    const sentry = await import('../../src/sentry.js')

    sentry.initSentry({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'test',
    })

    sentry.captureLog('info', 'Persisted workspace document', {
      attempt: 2,
      error: new Error('backend failed'),
      nested: { secret: 'hidden' },
      notifyBackend: true,
      skipped: undefined,
      workspaceId: 'workspace-1',
    })

    expect(sentryLoggerMock.info).toHaveBeenCalledWith('Persisted workspace document', {
      attempt: 2,
      error: 'backend failed',
      notifyBackend: true,
      workspaceId: 'workspace-1',
    })
  })

  it('captures exceptions with extra context and flushes cleanly', async () => {
    const sentry = await import('../../src/sentry.js')

    sentry.initSentry({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      environment: 'test',
    })
    sentry.captureException('startup failed', {
      phase: 'startup',
      workspaceId: 'workspace-1',
    })

    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      extra: {
        phase: 'startup',
        workspaceId: 'workspace-1',
      },
    })
    expect((captureExceptionMock.mock.calls[0][0] as Error).message).toBe('startup failed')

    await sentry.flush()

    expect(closeMock).toHaveBeenCalledWith(2000)

    captureExceptionMock.mockClear()
    sentry.captureException(new Error('after flush'))
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })
})
