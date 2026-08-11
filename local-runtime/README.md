# Kanwas local runtime

`@kanwas/local-runtime` is the Electron-owned application runtime. It is a
library, not a command-line program or independently managed process. Electron
calls `startLocalRuntime()` during startup and closes the returned handle when
the app quits.

The runtime connects the renderer to local folders, a private Yjs document
session, terminal sessions, and MCP through one loopback HTTP server. The Yjs
channel synchronizes documents only; it does not carry presence. A selected
folder is called a **vault** and remains the durable source of truth.

## Lifecycle API

```ts
const runtime = await startLocalRuntime({
  stateDir,
  rendererDir,
  templatesDir,
  logFile,
})
```

Required options provide the application state directory, prebuilt renderer,
and vault templates. The optional logger, log level, host, port, and legacy
registry path are primarily useful for integration tests. Production binding
is restricted to `127.0.0.1`; the default port is `4300`.

The returned handle exposes:

- `origin`
- `listVaults()` and `getActiveVault()`
- `openVault(folder, label?)`
- `activateVault(workspaceId)`
- `renameVaultLabel(workspaceId, label)`
- `forgetVault(workspaceId)`
- `flushAll()`
- idempotent `close()`

Opening, activating, labeling, and forgetting vaults are called directly from
Electron main through the typed preload boundary. They are not public mutation
routes. Forgetting unmounts a vault and removes its registry entry; it never
deletes the selected folder or its contents.

## Runtime composition

`startLocalRuntime()` creates one HTTP server and attaches:

- the renderer under `/app`,
- the typed local API under `/api`,
- Yjs Socket.IO at `/yjs/socket.io`,
- terminal attachment WebSockets under the workspace API,
- the local MCP handler at `/mcp`.

It then initializes the vault registry and remounts up to ten recently used
folders. Startup failure uses the same cleanup path as normal shutdown.

## Vault registry

The registry is `vaults.json` inside the state directory supplied by Electron
(`app.getPath('userData')`). It contains paths, stable workspace IDs, display
labels, last-opened timestamps, and the active vault.

When the new registry does not yet exist, the runtime can import
`~/.kanwas/vaults.json` once. The legacy file is read only and is never changed
or removed. Missing remembered folders remain visible with a `missing` status
until the user forgets them.

Each vault also contains `.kanwas/workspace.json`, which keeps its workspace ID
stable when registry state is recreated.

## Folder-to-canvas model

| On disk                        | In Kanwas                                                 |
| ------------------------------ | --------------------------------------------------------- |
| directory                      | canvas                                                    |
| Markdown file                  | BlockNote document node                                   |
| supported image/audio/PDF/file | media or file node                                        |
| `metadata.yaml`                | positions, sizes, edges, groups, sections, and stable IDs |

The runtime adopts existing folders without clearing or reorganizing them.
Files that have no sidecar entry receive stable metadata. Empty folders may be
seeded with the bundled `AGENTS.md` and MCP configuration guidance; existing
non-empty folders are not populated automatically.

### External changes

Chokidar watches mounted vaults while ignoring `.git`, `node_modules`, and
`.kanwas`. Creates, edits, renames, and deletes are normalized into one
vault-relative path model before being applied to Yjs.

The synchronizer preserves Markdown frontmatter verbatim. Body content may be
normalized by BlockNote after a user edits it in the canvas. Runtime-authored
writes use suppression records so their watcher echoes are not mistaken for
new external changes.

### Renderer changes

Canvas structure is persisted through the Yjs core's `DocumentStore` seam.
`FolderStore` schedules `FolderFlusher`, which reconciles dirty documents and
metadata to disk. Note bodies use an explicit save endpoint with base hashes;
an external edit that wins the race returns `409` instead of being overwritten.

Writes are skipped when bytes are unchanged. Changed files use temporary files
and atomic replacement. UI deletes move user material under `.kanwas/trash`
rather than permanently removing it.

## Local API

The renderer uses browser-safe DTOs from `shared/local-api`. Supported API
families are:

- workspace lookup and short-lived Yjs-token minting,
- multipart upload and raw-file `GET`/`HEAD`,
- revision-aware note saves and explicit flush,
- terminal-agent discovery and session lifecycle,
- UI-context reporting and context resolution,
- validated link metadata.

Requests from a different browser origin are rejected. Unsupported routes and
methods return explicit `404` and `405` responses; there are no compatibility
responses for removed services.

## Link metadata safety

Link previews are the only core feature that fetches arbitrary user-provided
web URLs. Resolution and every redirect are checked against loopback, private,
link-local, and metadata-service addresses. Response sizes are bounded and
downloaded preview images must match allowed magic bytes before they are saved
to the vault.

## Terminal and MCP

Each terminal session runs with the active vault as its working directory.
Command discovery is platform-aware: macOS uses the user's login environment;
Windows uses `PATHEXT`, PowerShell or `%ComSpec%`, and ConPTY through
`node-pty`.

The renderer can push selected file/range context into a terminal. MCP-capable
local agents can pull the same in-memory context from `/mcp`. The bundled
`mcp.json.template` points local tools at the fixed loopback endpoint.

## Vault template

`templates/AGENTS.md` explains the folder-to-canvas rules to coding agents. To
add it to an existing vault explicitly:

```bash
cp local-runtime/templates/AGENTS.md /path/to/vault/AGENTS.md
```

The MCP template can likewise be copied or merged into the agent's local MCP
configuration:

```bash
cp local-runtime/templates/mcp.json.template /path/to/vault/.mcp.json
```

## Development

The runtime is normally built and started by Electron:

```bash
pnpm --filter @kanwas/desktop dev
```

Run its source checks directly with:

```bash
pnpm --filter shared build
pnpm --filter @kanwas/yjs-core build
pnpm --filter @kanwas/local-runtime typecheck
pnpm --filter @kanwas/local-runtime test
pnpm --filter @kanwas/local-runtime build
```

Tests use temporary vault and state directories. They cover adoption,
frontmatter, folder flushing, note conflicts, atomic metadata writes,
multi-folder resolution, terminal behavior, UI context, MCP, and registry
migration. Tests must never mount a real user folder.
