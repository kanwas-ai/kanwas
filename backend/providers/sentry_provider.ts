import type { ApplicationService } from '@adonisjs/core/types'
import type { SentryConfig } from '#config/sentry'

export default class SentryProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {}

  /**
   * The container bindings have booted
   */
  async boot() {
    const config = this.app.config.get<SentryConfig>('sentry')

    if (!config.enabled) {
      return
    }

    // Dynamic import to avoid loading Sentry in dev/test when disabled
    const Sentry = await import('@sentry/node')
    const { nodeProfilingIntegration } = await import('@sentry/profiling-node')

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,

      // Tracing
      tracesSampleRate: config.tracesSampleRate,

      // Profiling
      profileSessionSampleRate: config.profileSessionSampleRate,
      profileLifecycle: 'trace',

      // Logs
      _experiments: {
        enableLogs: true,
      },
      beforeSendLog: config.beforeSendLog,

      // Integrations
      integrations: (defaultIntegrations) => [
        ...defaultIntegrations,
        nodeProfilingIntegration(),
        Sentry.pinoIntegration({
          log: { levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] },
        }),
      ],
    })
  }

  /**
   * The application has been booted
   */
  async start() {}

  /**
   * The process has been started
   */
  async ready() {}

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {
    const config = this.app.config.get<SentryConfig>('sentry')

    if (!config.enabled) {
      return
    }

    const Sentry = await import('@sentry/node')
    await Sentry.close(2000)
  }
}
