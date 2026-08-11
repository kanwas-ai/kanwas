# @kanwas/yjs-core

Embedded Yjs synchronization for the Kanwas desktop app. This package owns
one workspace room per mounted vault, the private Socket.IO document protocol,
workspace-scoped token verification, and debounced persistence. Each workspace
connection bootstraps the root plus every attached note document. There are no
presence events or dedicated note rooms. The package does not listen on a port
or choose a persistence implementation.

```ts
import { attachYjsCore } from '@kanwas/yjs-core'

const yjs = attachYjsCore({
  httpServer,
  logger,
  store,
  tokenSecret,
  socketPath: '/yjs/socket.io',
})

// During application shutdown. The application still owns httpServer.
await yjs.close()
```

The embedding runtime supplies a `DocumentStore` with five methods:
`loadRoot`, `saveRoot`, `loadNote`, `saveNote`, and `deleteNote`. Folder-backed
persistence belongs in the runtime, outside this protocol package.
