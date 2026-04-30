import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, targets } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  default: 'app',

  /**
   * The loggers object can be used to define multiple loggers.
   * By default, we configure only one logger (named "app").
   */
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME'),
      level: env.get('LOG_LEVEL'),
      transport: !app.inProduction
        ? {
            targets: targets()
              .push(targets.pretty())
              .push({
                target: 'pino/file',
                level: 'debug',
                options: {
                  destination: join(
                    app.appRoot instanceof URL ? fileURLToPath(app.appRoot) : app.appRoot,
                    'logs',
                    'agent.log'
                  ),
                  mkdir: true,
                },
              })
              .toArray(),
          }
        : undefined,
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
