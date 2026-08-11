# Kanwas system overview

Kanwas is a local-first Electron application for viewing and editing a folder as a spatial canvas. The selected folder is durable truth. Electron embeds every service the UI needs and stops them when the app exits.

## Process model

```text
┌──────────────────────── Electron application ─────────────────────────┐
│                                                                       │
│  Main process                                                         │
│  ├─ window and lifecycle management                                   │
│  ├─ typed preload/IPC bridge                                           │
│  └─ local-runtime                                                     │
│       ├─ vault registry and mounts                                    │
│       ├─ folder watcher, converter, persistence, uploads              │
│       ├─ terminal sessions and MCP                                    │
│       ├─ loopback HTTP/WebSocket server                               │
│       └─ yjs-core rooms and Socket.IO transport                       │
│                         ▲                                             │
│                         │ same-origin loopback transport              │
│                         ▼                                             │
│  Sandboxed renderer                                                   │
│  └─ React + React Flow + BlockNote                                    │
│                                                                       │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ native filesystem APIs
                               ▼
                         selected vault folder
```

The loopback server is an internal application transport. It binds to `127.0.0.1`, shares the Electron lifecycle, and serves the prebuilt renderer, local API, terminal WebSocket, MCP endpoint, and Yjs Socket.IO path from one origin.

## Package responsibilities

### `desktop`

The Electron shell owns application lifecycle and operating-system integrations:

- enforce a single application instance,
- start and stop `local-runtime`,
- create a sandboxed, context-isolated window,
- expose a narrow preload API,
- show the native folder picker,
- restore or focus the active vault,
- hand external links to the operating system,
- coordinate the bounded save flush during shutdown.

The main process does not discover a checkout, find a system Node executable, or launch a daemon child process.

### `renderer`

The renderer is the desktop UI. It remains a React/Vite application because Chromium renders Electron windows, but it is not deployed as a standalone web application.

Its responsibilities are canvas interaction, BlockNote editing, navigation, local vault selection, terminal presentation, and UI-context reporting. It has no login, OAuth, account, organization, invitation, sharing, billing, or cloud-workspace model.

### `local-runtime`

The embedded runtime is the boundary between UI state and local resources. It owns:

- the vault registry under Electron's `userData`,
- mounted folder state and stable workspace identifiers,
- folder scanning and file watching,
- conversion between files/`metadata.yaml` and workspace documents,
- persistence of Yjs document changes back to files,
- local uploads and raw-file responses,
- terminal processes and attach WebSockets,
- link-preview fetching with SSRF and content validation,
- UI context and the local MCP endpoint,
- startup, flush, and idempotent shutdown.

`startLocalRuntime(options)` returns a handle used directly by Electron main. Vault open, label, activation, and forget operations go through that handle rather than public mutation routes.

### `yjs-core`

`yjs-core` contains realtime document mechanics: rooms, synchronization protocol, token checks, awareness, snapshots, and persistence interfaces. It has no standalone entrypoint, cloud object store, deployment configuration, hosted callback, or account/share resolver.

### `shared`

`shared` defines the workspace tree and reusable conversion code. It also contains browser-safe DTOs for the renderer/runtime contract. Node-only BlockNote and filesystem utilities must be imported through their server-specific exports so they are not bundled into the renderer.

### `website`

The marketing website is an independent workspace. It is not served by Electron and does not participate in the desktop dependency graph.

## Why Yjs remains

Local-first does not mean the editor can discard its live document model. React Flow and BlockNote update nested workspace state continuously, and terminal/file-watcher activity can change the same vault while it is open.

Yjs provides:

- transactional mutations and coherent undo origins,
- efficient rich-text updates for BlockNote,
- document/subdocument identity used by the existing canvas model,
- awareness and connection state inside the application,
- a stable seam where persistence can debounce and serialize changes.

Yjs is therefore an in-app editing and synchronization engine. It is not the durable cloud source of truth: the folder wins across restarts, and the persistence layer writes accepted UI changes back to disk.

## Data flows

### Opening a vault

1. The user chooses a folder through the native Electron dialog or selects a remembered vault.
2. Electron asks the runtime to register and mount the folder.
3. The runtime scans files and `metadata.yaml`, builds the workspace document, and starts its watcher.
4. Electron navigates the renderer to the local workspace route.
5. The renderer requests a short-lived local Yjs token and joins the workspace room at `/yjs/socket.io`.

Remembering a folder stores registry metadata only. Removing it from Kanwas never deletes the folder.

### Editing in Kanwas

1. A UI action updates the workspace or note Yjs document in a transaction.
2. `yjs-core` schedules persistence through the mounted folder store.
3. The runtime serializes content and canvas metadata to temporary files.
4. Atomic replacement commits the files and watcher suppression ignores the runtime's own events.
5. The renderer receives success or a revision conflict; failures remain visible instead of being silently discarded.

During shutdown, Electron asks the renderer to flush queued note saves and waits for at most five seconds. The runtime then flushes mounts before closing rooms, terminals, watchers, and the server.

### Editing outside Kanwas

1. The watcher observes a create, update, move, or delete under a mounted vault.
2. Paths are validated and normalized to vault-relative POSIX form.
3. The synchronization layer parses the changed file and reconciles `metadata.yaml` when necessary.
4. The runtime applies one transaction to the corresponding Yjs document.
5. The renderer updates through its existing Yjs subscription.

External-change handling must distinguish a real external edit from the runtime's atomic-write sequence and must preserve both sides when revisions conflict.

### Terminal and agent context

The runtime spawns PTYs with the selected vault as their working directory. macOS uses the user's login-shell environment; Windows resolves PowerShell or `%ComSpec%` and command shims through `PATHEXT`.

The renderer reports selected files and ranges to an in-memory UI-context store. Any terminal can receive explicit context as inserted text. MCP-capable local agents can read the same context through the loopback `/mcp` endpoint.

No command is sent to a hosted agent service.

## Local API surface

The renderer uses typed, same-origin endpoints for:

- workspace lookup and Yjs token minting,
- note saves and conflict responses,
- uploads and raw files,
- terminal discovery, session lifecycle, and attachment,
- UI-context reporting and resolution,
- validated link metadata,
- read-only MCP tools.

Unsupported paths and methods return explicit `404` or `405` responses. The old hosted API surface is not emulated.

## Security boundary

- The runtime listens only on loopback.
- Browser API requests are same-origin and cross-origin requests are rejected.
- The renderer has no raw Node, filesystem, or IPC access.
- Folder selection and vault mutations happen in Electron main.
- Resolved paths must stay beneath the mounted vault, including through symlinks.
- Link previews reject loopback, private, link-local, metadata-service, and unsafe redirect targets; response size and media signatures are validated.
- Navigation is restricted to the runtime origin. External URLs open outside Electron.
- Core startup does not require outbound network access.

The MCP endpoint is intentionally available to local command-line tools. Its tools expose current Kanwas context but do not create a general remote-control API.

## Cross-platform rules

Workspace-relative paths are canonical `/`-separated strings. Native absolute paths remain at the filesystem and PTY boundaries.

Windows support requires explicit handling for drive letters, UNC paths, case-insensitive vault equivalence, reserved names, `.cmd` shims, ConPTY, and replace-on-rename behavior. macOS and Windows tests must use native runners for PTY behavior.

## Persistence and recovery

The vault folder contains content and canvas metadata. The registry under `userData` contains only remembered-vault application state. If the new registry does not exist, the runtime may import legacy `~/.kanwas/vaults.json` once; it does not edit or delete that legacy file.

A missing remembered folder is reported as unavailable and can be forgotten safely. Runtime startup and `close()` are designed to be idempotent so partial startup failures and normal application quit use the same cleanup path.

## Development and release boundary

Source development builds the renderer before Electron starts and runs the runtime inside Electron's main process. There is no first-run Vite build and no dependency on a repository checkout from the running app.

Installer generation, signing, notarization, auto-update, and release artifact architecture are a later electron-builder phase. Development correctness must not depend on those packaging decisions.
