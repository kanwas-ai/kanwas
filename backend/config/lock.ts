import { defineConfig, stores } from '@adonisjs/lock'
import type { InferLockStores } from '@adonisjs/lock/types'

const lockConfig = defineConfig({
  default: 'redis',

  stores: {
    redis: stores.redis({
      connectionName: 'main',
    }),
    memory: stores.memory(),
  },
})

export default lockConfig

declare module '@adonisjs/lock/types' {
  interface LockStoresList extends InferLockStores<typeof lockConfig> {}
}
