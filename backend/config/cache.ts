import { defineConfig, drivers, store } from '@adonisjs/cache'
import type { InferStores } from '@adonisjs/cache/types'

const cacheConfig = defineConfig({
  default: 'default',

  stores: {
    default: store().useL2Layer(
      drivers.redis({
        connectionName: 'cache',
      })
    ),
  },
})

export default cacheConfig

declare module '@adonisjs/cache/types' {
  interface CacheStores extends InferStores<typeof cacheConfig> {}
}
