# Kanwas desktop

`@kanwas/desktop` is the Electron application shell. It starts the local runtime
inside Electron's main process, loads the prebuilt renderer, and owns the
runtime for the lifetime of the window. No system Node executable, repository
discovery, child process, login page, or separately started service is involved.

## Launch flow

1. Electron acquires the single-instance lock and creates a sandboxed loading
   window.
2. Main calls `startLocalRuntime()` with Electron's `userData` and log paths,
   the renderer build, and the bundled vault templates.
3. The runtime remounts remembered vaults and listens on
   `http://127.0.0.1:4300`.
4. Electron loads the active vault at `/app/w/<urlId>`, or `/app` when the user
   still needs to choose a folder.
5. A second launch focuses the existing window instead of starting another
   runtime on the fixed port.

In source development, resources are read from sibling `renderer/dist` and
`local-runtime/templates` directories. A future packaging phase will place the
same prebuilt resources under `process.resourcesPath`; the runtime does not
build them on first launch.

## Main/preload boundary

The renderer remains sandboxed with context isolation and without Node
integration. Preload exposes only typed desktop operations:

- list remembered vaults,
- open a folder through the native picker,
- activate a vault,
- change its display label,
- forget it without deleting anything on disk,
- participate in the bounded quit-flush handshake.

Navigation is restricted to the embedded runtime's `/app` origin. HTTP, HTTPS,
and mail links are handed to the operating system.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @kanwas/desktop dev
```

`dev` builds shared, Yjs core, local runtime, and renderer; rebuilds `node-pty`
for Electron's ABI; bundles main/preload; then launches Electron.

Useful source checks:

```bash
pnpm --filter @kanwas/desktop typecheck
pnpm --filter @kanwas/desktop bundle
pnpm --filter @kanwas/desktop check
```

`build` produces source build outputs. `package:dir` creates an unpacked app
for the host platform and `package` creates its configured electron-builder
installers under `desktop/release/`. Native dependencies are rebuilt for the
target Electron ABI during packaging.

GitHub Actions smoke-tests unpacked apps on Linux, macOS, and Windows. A
matching `v<desktop package version>` tag on `master` builds the complete
release matrix before publishing one GitHub Release. Signing and notarization
activate when their repository secrets are configured; unsigned releases work
without those secrets for now. See [`docs/RELEASING.md`](../docs/RELEASING.md).

## Native dependency

The embedded terminal uses `node-pty`. Run this after changing Electron or
`node-pty` versions if the normal development command has not already done so:

```bash
pnpm --filter @kanwas/desktop rebuild:native
```

Rebuilds must run on the target operating system. The app supports the native
macOS PTY and Windows ConPTY implementations.

## State and logs

The vault registry is stored below Electron's platform-specific `userData`
directory. On first use, the runtime can import the old
`~/.kanwas/vaults.json` registry if one exists; the legacy file is never
modified.

Runtime logs use Electron's platform-specific logs directory. User documents
and `metadata.yaml` remain in the folders the user selected.

## Quit behavior

Before quitting, main gives the renderer up to five seconds to flush queued
note saves. It then flushes mounted workspaces and closes terminal sessions,
watchers, Yjs rooms, and the loopback server. `close()` is idempotent, so normal
quit and partial-startup failure use the same cleanup path and do not leave an
orphan process.
