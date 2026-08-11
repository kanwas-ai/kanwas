# @kanwas/yjs-core

Embedded Yjs synchronization for the Kanwas desktop app. This package owns
workspace/note rooms, the Socket.IO protocol, workspace-scoped token
verification, awareness, and debounced persistence. It does not listen on a
port or choose a persistence implementation.

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
