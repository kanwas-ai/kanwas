import env from '#start/env'
import app from '@adonisjs/core/services/app'
import type { NodeOptions } from '@sentry/node'

export interface SentryConfig {
  enabled: boolean
  dsn: string
  environment: string
  release?: string
  tracesSampleRate: number
  profileSessionSampleRate: number
  beforeSendLog?: NodeOptions['beforeSendLog']
}

const config: SentryConfig = {
  /**
   * Enable or disable Sentry.
   * Only enabled in production when DSN is set.
   */
  enabled: app.inProduction && !!env.get('SENTRY_DSN'),

  /**
   * The DSN of the project
   */
  dsn: env.get('SENTRY_DSN', ''),

  /**
   * The environment Sentry is running in
   */
  environment: app.nodeEnvironment,

  /**
   * The release version (optional)
   */
  release: env.get('RELEASE_VERSION'),

  /**
   * The sample rate of traces to send to Sentry (0.0 to 1.0)
   * @see https://docs.sentry.io/platforms/javascript/guides/node/configuration/sampling
   */
  tracesSampleRate: 0.2,

  /**
   * The sample rate of profiling sessions (0.0 to 1.0)
   * @see https://docs.sentry.io/platforms/javascript/guides/node/profiling
   */
  profileSessionSampleRate: 0.2,

  /**
   * Filter or modify logs before they're sent to Sentry
   */
  beforeSendLog: (log) => {
    // Scrub sensitive data from log attributes
    if (log.attributes) {
      const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization']
      for (const key of sensitiveKeys) {
        if (key in log.attributes) {
          delete log.attributes[key]
        }
      }
    }
    return log
  },
}

export default config
