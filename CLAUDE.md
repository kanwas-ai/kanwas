# Kanwas engineering guide

Never add an AI tool as a commit co-author.

## Product boundary

Kanwas is a local-first Electron application. The desktop process embeds the local runtime; there is no hosted application service, account system, organization model, or separately launched process.

The marketing site in `website/` is an independent package. Do not couple it to desktop packages or change it as a side effect of app work.

## Monorepo structure

- `desktop/` — Electron main process and narrow preload bridge.
- `renderer/` — React/Vite/React Flow/BlockNote desktop UI.
- `local-runtime/` — embedded loopback HTTP server, vault registry, folder synchronization, terminal, uploads, and MCP.
- `yjs-core/` — reusable Yjs rooms, protocols, socket transport, token validation, and persistence interfaces. It is a library, not a standalone service.
- `shared/` — workspace model, filesystem conversion, path helpers, and local API contracts shared across process boundaries.
- `website/` — standalone marketing website, outside the desktop runtime graph.

When looking for types or conversion utilities, check `shared/` first. Keep browser-safe types separate from Node-only code: `@blocknote/server-util` and filesystem helpers must not enter the renderer bundle.

## Development

Install once at the repository root, then run Electron:

```bash
pnpm install
pnpm --filter @kanwas/desktop dev
```

Do not start a Yjs or application service separately. Electron owns the runtime lifecycle.

Run the build/typecheck/test scripts of every changed workspace. Builds and typechecks must fail on errors; do not hide failures with `|| true` or filtered diagnostics.

When resolving a `pnpm-lock.yaml` conflict, regenerate it after all manifests are correct. Never keep one side of a conflicted lockfile as the final resolution.

## Runtime invariants

- A selected folder (a **vault**) is durable truth. Yjs is live editing state and must flush through the folder persistence layer.
- The internal HTTP/Yjs server listens only on loopback and closes with Electron.
- Renderer network requests are same-origin; the runtime rejects cross-origin browser requests.
- Vault mutations use the preload/main-process boundary. Forgetting a vault removes registry state only; it never deletes user files.
- The vault registry lives under Electron's `userData`. Legacy `~/.kanwas/vaults.json` import is one-time and non-destructive.
- Electron uses a single-instance lock. A second launch focuses the existing window rather than starting another runtime on the same port.
- On quit, give the renderer a bounded opportunity to flush pending note saves, then close terminals, mounts, Yjs rooms, watchers, and HTTP in order.
- Unknown local API routes return real `404`/`405` responses. Do not add permissive cloud-compatibility stubs.

## Filesystem and paths

Internal vault-relative paths use `/` separators. Convert to native paths only at filesystem boundaries.

Treat these cases as first-class:

- Windows drive-letter and UNC paths
- case-insensitive vault deduplication on Windows
- traversal and symlink escape attempts
- Windows reserved names and replace-on-rename behavior
- atomic writes, watcher suppression, and external rename storms

The canonical workspace-to-filesystem conversion code lives in `shared/src/workspace/`. Reuse it rather than creating a second serialization format.

## Yjs and BlockNote gotchas

### Clone loses non-string attributes

`Y.XmlElement.clone()` only preserves string attributes. Numeric and boolean BlockNote properties can be lost. Prefer the shared content conversion and fragment replacement paths.

### Detached fragments must be adopted

A detached `Y.XmlFragment` produced by BlockNote conversion must be attached to a Y container before its contents are read. Adoption integrates it into the target document.

### Replace note fragments coherently

When replacing BlockNote content, replace the entire `noteDoc.getXmlFragment('content')` fragment. The renderer observes fragment identity and remounts the editor binding. Do not partially clone the child XML tree.

### Transactions matter

Group one user-visible canvas operation into one Yjs transaction with the appropriate origin. This keeps undo, audit metadata, persistence, and external-file reconciliation coherent.

## Electron boundary

- Keep `contextIsolation` and renderer sandboxing enabled.
- Expose only typed, purpose-specific preload methods; never expose raw `ipcRenderer`, filesystem access, or the runtime object.
- Allow navigation only to the exact runtime origin. Open ordinary web links through the operating system.
- Keep native dependencies such as `node-pty` in the desktop/runtime boundary, out of the renderer bundle.
- Release packaging is deferred. Do not reintroduce checkout-dependent packaging or first-run renderer builds.

## Tests

Synchronization changes require tests for both directions: UI/Yjs to disk and external disk edits to Yjs/UI. Use temporary folders and state directories; never point tests at a real user vault.

For desktop behavior, cover macOS and Windows-specific path, shell, PTY, and shutdown behavior. Core startup must work with outbound networking blocked.

When completing a task, suggest: "Would you like to run `/reflect` to capture any learnings from this session?"
