import env from '#start/env'
import { defineConfig } from '@adonisjs/redis'
import { InferConnections } from '@adonisjs/redis/types'

const redisConfig = defineConfig({
  connection: 'main',

  connections: {
    /*
    |--------------------------------------------------------------------------
    | The default connection
    |--------------------------------------------------------------------------
    |
    | The main connection you want to use to execute redis commands. The same
    | connection will be used by the session provider, if you rely on the
    | redis driver.
    |
    */
    main: {
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      password: env.get('REDIS_PASSWORD', ''),
      user: env.get('REDIS_USER', 'default'),
      db: 0,
      keyPrefix: '',
      family: 0, // Enable dual-stack DNS (IPv4 and IPv6) for IPv6-only private networking
      retryStrategy(times) {
        return times > 10 ? null : times * 50
      },
    },
    cache: {
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      password: env.get('REDIS_PASSWORD', ''),
      user: env.get('REDIS_USER', 'default'),
      db: 1,
      keyPrefix: '',
      family: 0, // Enable dual-stack DNS (IPv4 and IPv6) for IPv6-only private networking
      retryStrategy(times) {
        return times > 10 ? null : times * 50
      },
    },
  },
})

export default redisConfig

declare module '@adonisjs/redis/types' {
  export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
