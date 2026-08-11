# local-daemon (`kanwasd`)

One Node process that serves **local folders** as Kanwas workspaces to the
**stock** frontend — no cloud, no accounts, no agent. Point it at a folder and
that folder renders as a spatial canvas: directories are canvases, `.md` files
are rich-text nodes, images are media nodes. Since Phase 3, `kanwasd` is
genuinely **multi-folder**: one daemon process, fixed ports, and as many
mounted folders as you like — each `kanwas up <folder>` adds one without
restarting the others.

## Quick start — `kanwas up`

**Any folder → one command → the canvas opens in your browser. Zero manual steps**
(no devtools, no `localStorage`, no `vite` invocations).

```bash
# from the folder you want to open (defaults to the current directory):
local-daemon/bin/kanwas up            # or: kanwas up <folder>
```

`kanwas up`:

1. **builds the frontend bundle** into `local-daemon/web-dist/` on first run
   (`vite build --mode kanwasup`, ~30–60s once; instant afterwards — pass
   `--rebuild-web` to force),
2. **starts (or joins) `kanwasd`**: if a daemon is already running on the fixed
   ports, the folder is registered with it via `POST /vaults` — **no restart**,
   the other mounted folders keep serving. Otherwise a fresh `kanwasd` is
   started (fixed ports **REST 4300 / Yjs 1999**), detached, logging to
   `~/.kanwas/daemon.log`,
3. **opens** `http://127.0.0.1:4300/local-login` (or `?to=/app/w/<id>` for a
   folder joining an already-running daemon) — a tiny page the daemon serves
   that sets the auth token on its own origin and redirects into the canvas
   (this is what removes the old console/`localStorage` step, papercut #1).

The daemon **serves the frontend itself**, so the app, the REST API and the login
page are all same-origin on `:4300`. Because the served bundle carries the token,
there is nothing to paste and no console to open.

```bash
kanwas ls       # every folder Kanwas knows about (mounted + registered)
kanwas status   # what's running: pid, ports, every mounted vault
kanwas rm <folder-or-id>   # unmount + forget a folder (never touches its contents)
kanwas down     # stop the daemon (unmounts every folder)
```

**One daemon, many folders.** Every folder ever opened is remembered in a
persistent registry, `~/.kanwas/vaults.json`:

- `kanwas up <folder>` — if a `kanwasd` is already listening on the fixed REST
  port, the folder is mounted into that **same running process** (no restart,
  every other open folder keeps serving); otherwise a new daemon boots and
  mounts it via `--folder`.
- at boot, the daemon also **remounts every registered folder** (most recently
  opened first, capped at 10) — so after `kanwas down` + `kanwas up`, whatever
  you had open before comes back automatically.
- the fixed ports held by **something that isn't a tracked kanwasd** → a clear
  error telling you which PID to free (`lsof -ti tcp:4300 | xargs kill`).
- `kanwas rm` unmounts a folder and drops it from the registry, but **never**
  touches the folder's contents on disk — only Kanwas forgets it.

Workspace identity is stable across restarts (stored in `<folder>/.kanwas/workspace.json`),
so `up`-ing the same folder again always lands on the same workspace/URL.

### From Claude Code (or any CLI agent)

A user-level skill at `~/.claude/skills/kanwas-up/SKILL.md` matches phrases like
**"spin up kanwas here"** / "open kanwas on this folder". In any Claude Code
session, just say it — the skill runs `local-daemon/bin/kanwas up` in the current
directory and relays the URL. (The skill hard-codes this repo's absolute launcher
path; move the repo and you'll want to update it.)

### Known limitations of the launcher

- **CDN assets.** The production `index.html` still loads Google Fonts +
  FontAwesome from their CDNs, so first paint needs an internet connection.
  Offline font/icon packaging is not done.
- **Fixed ports, single daemon.** One `kanwasd` process, ports 4300/1999 —
  those don't vary. Multi-folder parallelism itself is supported (`kanwas up`
  on a new folder joins the running daemon rather than replacing it; see
  above), but you can't run two independent daemons side by side on this
  machine without overriding the ports via env.
- **macOS-first `open`.** The browser auto-open uses `open` (macOS) /
  `xdg-open` (Linux) / `start` (Windows); the URL is always printed as a fallback.

---

Sync is **bidirectional** (Step 2A read/adopt/live-sync + Step 2B flusher +
Step 2C binaries/uploads/identity hardening):

- **Folder → canvas** is fully live: edit/create/delete a file on disk (agent,
  git, IDE) and the canvas updates within ~1s.
- **Canvas → folder** persists: edit a note in the UI and the `.md` on disk
  updates within ~2s (debounced). Create/rename/move/delete nodes, drag
  positions, edges/groups/sections — the **FolderFlusher** reconciles it all to
  `metadata.yaml` sidecars and real file operations. Kill the daemon, restart it
  on the same folder: everything you did in the UI is on disk and renders
  identically (stable node ids).
- **Uploads & binaries** (2C): drag/drop or the canvas menu uploads an image,
  file, or audio clip through `POST /workspaces/:id/files`, which writes the
  bytes straight into the canvas directory (dedup names) and returns a
  workspace-relative `storagePath`. The upload is suppression-tagged so the
  watcher never mints a second node for the file. Renaming a binary node moves
  its file on disk (bytes preserved); deleting one trashes the file; replacing
  the bytes externally refreshes the node (contentHash).
- **Editor atomic-save identity** (2C): editors save via write-tmp+rename or
  delete+recreate. A short quiescence window (deferred deletes + verify-on-recreate
  - content-hash pairing) folds those into an in-place update, so node ids —
    and their edges/positions — survive an atomic save instead of being re-minted.
- **Offline-rename recovery** (2C): rename/move a file while the daemon is off,
  restart, and adoption re-pairs the file with its node (binaries by contentHash,
  content files by an unambiguous 1:1 match), preserving the id and cleaning the
  stale sidecar entry. No ghosts, no duplicates.

The folder is the **source of truth**; the yDoc is a disposable in-memory edit
buffer rebuilt from the folder at every boot.

## Conflict policy — last-writer-wins at file granularity

There is deliberately **no merge engine**. Both sync directions are debounced
whole-file writes:

- **UI edit** → room save debounce (~1s) + flusher debounce (~0.6s) → whole-file
  write, suppression-tagged so the daemon's watcher ignores its own echo.
- **External edit** → watcher → whole-file read → yDoc apply (open clean notes
  remount via the existing fragment-replacement hook).
- **Both at once, different files** → both land; no interaction.
- **Both at once, the SAME file** → last writer wins at file granularity: if the
  external write lands first, the pending UI flush overwrites it; if the flush
  lands first, the external write flows back into the yDoc and wins. No duplicate
  nodes, no crash — one side's whole-file version prevails.
- **Known race window:** an external write landing _inside_ the ~1.6s debounce
  window of an in-flight UI edit to the same file is overwritten by that flush
  (tolaria ADR-0135 "dirty buffer wins").
- **No echo of external content** (2C): content applied _from_ disk (external
  edit, git checkout, agent write) is never re-serialized back over the bytes the
  external writer produced. That keeps a `git checkout` working tree clean (no
  cosmetic markdown-reflow diffs) and stops churn during multi-file storms.

## Deletes are never destructive — `.kanwas/trash/`

The flusher **never hard-deletes**. Deleting a node or canvas in the UI moves the
backing file/dir to `<folder>/.kanwas/trash/<timestamp>/<original-relative-path>`.
Files never touched from the UI are never modified or deleted (checksum-verified
in the restart test).

## Frontmatter round-trip guard

YAML frontmatter **never enters the editor** (tolaria's model). On read (adoption

- live watcher) a leading `---` block is split off and stashed in a daemon-side
  registry keyed by node id; the editor sees only the body. On flush the stashed
  block is re-prepended **byte-for-byte**. The registry survives restarts because
  the frontmatter lives in the file itself and is re-split at every boot — editing
  a frontmatter'd note in the UI keeps its frontmatter byte-identical on disk.

## Run it manually (dev / debugging)

For most use, prefer **`kanwas up`** above. This is the lower-level path — run the
daemon by hand and point a **Vite dev server** at it (handy for frontend HMR while
hacking on the app). Still supported; the `kanwas up` work is purely additive.

```bash
# build once (shared + yjs-server dist must exist; `pnpm -r build` if not)
pnpm --filter local-daemon build

# start the daemon on a folder
node local-daemon/dist/index.js --folder /path/to/folder --port 4300 --yjs-port 1999 --pretty
# or:  pnpm --filter local-daemon dev -- --folder /path/to/folder

# point the stock frontend at it (untracked, mode-scoped so it can't disturb
# a default `pnpm dev` on :5173) — frontend/.env.localdaemon.local:
#   VITE_API_URL=http://127.0.0.1:4300
#   VITE_YJS_SERVER_URL=127.0.0.1:1999
#   VITE_AUTH_TOKEN_KEY=auth_token
( cd frontend && ./node_modules/.bin/vite --mode localdaemon --port 5273 )

# open http://localhost:5273/app/w/<workspaceUrlId>
# (set localStorage['auth_token']='anything' — /auth/me accepts any bearer)
```

CLI: `kanwasd --folder <path> [--port <rest>] [--yjs-port <n>] [--host <h>]
[--log-level <l>] [--pretty] [--web-dist <p>] [--token-key <k>] [--instance-file <p>]`.
Clean shutdown on SIGINT/SIGTERM. When `--instance-file` is passed (as `kanwas up`
does) the daemon publishes `{pid,folder,ports,workspace,loginUrl}` there on ready
and removes it on shutdown; without it the daemon stays untracked (so the manual
run above never clobbers a launcher-managed instance).

Since Step 3 the daemon **also serves the built frontend itself**: `GET /app/*`
streams the `web-dist` bundle (SPA-fallback to `index.html`), `GET /local-login`
sets the token and redirects into the canvas, and `GET /` → `/local-login`. The
dead app-channel `socket.io` the stock frontend opens at the API origin is
answered by a minimal Engine.IO stub, so it connects once and stays quiet instead
of reconnect-spamming (papercut #2).

## Architecture

```
                 ┌──────────────── kanwasd (one Node process) ────────────────┐
 Browser         │  Embedded Yjs core (yjs-server, reused)   REST surface     │
 ┌────────────┐  │  socket.io + token verify + admin HTTP    /auth/me         │
 │ stock React│◄─┼─► (:1999)                                  /workspaces      │
 │ + BlockNote│  │        ▲  replaceDocument (in-process)     /…/yjs-socket-   │
 └────────────┘  │        │                                    token (mint)    │
                 │   in-memory yDoc (ephemeral edit buffer)   /files/signed-   │
                 │        ▲│  debounced saveRoot/saveNote       url → static    │
                 │        ││  (FolderStore seam)               (:4300)         │
                 │        │▼                                                   │
                 │   SyncOrchestrator                                          │
                 │    ├─ folder→yDoc: chokidar → FilesystemSyncer.syncChange   │
                 │    │              + MetadataManager (suppressed sidecars)    │
                 │    └─ yDoc→folder: FolderFlusher reconcile (notes → .md,    │
                 │       structure → metadata.yaml + rename/move/trash),        │
                 │       suppression-tagged, frontmatter re-prepended           │
                 └────────┼───────────────────────────────────────────────────┘
                          ▼
                 📁 folder = SOURCE OF TRUTH  ◄─ Claude Code / Codex / git / IDE
```

Boot sequence (`src/index.ts`):

1. `identity.ts` — stable workspace id from `<folder>/.kanwas/workspace.json`.
2. `yjs-core.ts` — start `startYjsServer` (reused from yjs-server) with the
   `FolderStore` and a per-run HMAC secret shared with the REST minter.
3. `adopt.ts` — build a fresh, disposable yDoc from the folder (**never wipes**),
   splitting frontmatter into the registry, then `roomManager.replaceDocument()`
   seeds the room in-process. The store is **not yet armed**: the seed's own
   saves must not rewrite the folder they were just read from.
4. `sync-orchestrator.ts` — connect a watcher client (keeps the room alive across
   frontend reloads), materialize missing `metadata.yaml` sidecars, start
   chokidar, construct the `FolderFlusher` (same serialization queue as the
   watcher handlers, so a flush never interleaves with a folder→yDoc apply).
5. **Arm the flusher** and bind it to the `FolderStore` — from here on, debounced
   room saves flush UI edits to disk.
6. `rest-server.ts` — the REST surface + static file route.

## Reuse decisions

| Piece                                                                                                                 | How                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yjs sync core (rooms, sockets, subdocs, token verify)                                                                 | **imported** from `yjs-server`                 | via a **new `exports` map** in `yjs-server/package.json` (the only yjs-server change; additive, no logic touched). `startYjsCore` calls `startYjsServer` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Conversion engine (`FilesystemSyncer`, `ContentConverter`, `PathMapper`, snapshot bundle, `assertValidWorkspaceRoot`) | **used as-is** from `shared`                   | the crown jewels; untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `watcher.ts`                                                                                                          | **copied** from `execenv`                      | changes: drop the `.ready` sandbox marker; **chokidar-4 FUNCTION `ignored`** (glob-string ignores are silently dead in chokidar 4 — the execenv original was watching `.git/`, `node_modules/`, `.kanwas/`) that skips those dirs by path segment and splits text vs binary by extension; directory (canvas) events fire from a single watcher only.                                                                                                                                                                                                                                                                                                                                                                   |
| `filesystem.ts`                                                                                                       | **copied (trimmed)** from `execenv`            | dropped `clearDirectory`, `writeFSNode`, ready-marker so the wipe/hydration path cannot be inherited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `metadata-manager.ts`                                                                                                 | **copied (adapted)** from `execenv`            | audit/identity stripped; root-canvas skip removed (root sidecar at `<folder>/metadata.yaml`); injectable suppressed writer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SyncOrchestrator`                                                                                                    | **new**, trimmed sync-manager                  | connect + watch + `syncChange` + suppressed sidecars. Deliberately omits clearDirectory hydration, 3-way merge, markdown shadow, yDoc-wins writebacks, Kanwas-restore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `adopt.ts` + `disk-align.ts`                                                                                          | **new** (2A)                                   | metadata-first id-stable adoption; yDoc-identity ↔ real-filename bridge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `folder-flusher.ts` + `folder-store.ts` + `disk-index.ts`                                                             | **new (2B)** — the yDoc→folder flusher         | `FolderStore` implements yjs-server's `DocumentStore`; its `saveRoot`/`saveNote`/`deleteNote` (fired by the room's debounced `scheduleSave`) signal the `FolderFlusher`, which reconciles the live tree to disk: dirty note fragments → markdown (`ContentConverter`, frontmatter re-prepended), structure → canonical `metadata.yaml` (shared `canvas-metadata.ts` builder, byte-identical with the MetadataManager's), UI renames → **byte-exact** file moves keyed by the on-disk id→path index (`disk-index.ts`, built from sidecars + real filenames), deletes → `.kanwas/trash/`. Coarse whole-workspace reconcile per flush; all writes idempotent (skip when byte-identical) so untouched files never rewrite. |
| `frontmatter.ts` + `frontmatter-registry.ts`                                                                          | **new (2B)**                                   | verbatim split/join of leading YAML frontmatter; node-id-keyed registry populated on every read path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `suppression.ts`                                                                                                      | **new (2B)**, extracted from 2A's orchestrator | daemon-wide echo cancellation: content-hash-matched write suppressions (now string **or Buffer**, for binary uploads/moves) + path-matched delete suppressions (renames/trash), shared by both sync directions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `name-match.ts`                                                                                                       | **new (2C)**                                   | the single source of truth for node ↔ filename matching (sanitize BOTH sides), consumed by `disk-index.ts` + `disk-align.ts` (they had drifted — one compared against the raw node name).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `multipart.ts` + `upload.ts`                                                                                          | **new (2C)**                                   | dependency-free multipart/form-data parser + upload dedup/MIME helpers for `POST /workspaces/:id/files`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| REST stubs + token mint + static route + **multipart upload**                                                         | **new, small**                                 | mirrors `yjs_socket_token_service.ts`; the upload route writes into the folder via `SyncOrchestrator.handleUpload`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Two findings that shaped the build

1. **A naive `FilesystemSyncer` full scan is NOT id-stable.** `createNode` /
   `createCanvas` mint a fresh `crypto.randomUUID()` every time and have **no path
   to recover ids from `metadata.yaml`** (`applyMetadataToNodes` only _matches
   existing_ nodes by id). So restart-stability required a **metadata-first
   adoption loader** (`adopt.ts`): reconstruct canvases + nodes with their stored
   ids from the sidecars, fall back to the syncer's create path only for genuinely
   new / sidecar-less files, and prune reconstructed nodes whose backing file
   vanished. The mission brief assumed sidecars alone gave id-stability; they
   don't without this reader.

2. **Adopted filenames don't match sanitized node names.** `PathMapper` derives
   every path from the sanitized (lower-kebab) node _name_ (`readme` → `readme.md`),
   but the daemon never renames the user's files, so `README.md` fails to map back
   — breaking id-stability _and_ duplicating on a live edit. `disk-align.ts` walks
   the proxy tree and the folder in tandem and re-registers each mapping under its
   **real on-disk path**. Used by both adoption and the live orchestrator.

## AGENTS.md — the CLI-agent guide

A user's CLI agent (Claude Code, Codex) works by editing files in the folder. To
tell it how the folder maps to the canvas, the daemon ships a one-page guide at
`local-daemon/templates/AGENTS.md` (dirs = canvases, `.md` = rich-text nodes,
binaries = media nodes, `metadata.yaml` = layout, `.kanwas/` = internal, the
frontmatter/round-trip rules, and the cross-directory-`mv` caveat).

- **New (empty) folders are seeded automatically.** When kanwasd is pointed at an
  empty folder, `seed-template.ts` copies `AGENTS.md` into it before adoption, so
  it becomes the workspace's first canvas node and is present for the agent. This
  is gated on emptiness (an existing folder is never injected with the file) and
  never overwrites an existing `AGENTS.md`.
- **Existing folders: add it yourself.** The daemon deliberately does not drop
  `AGENTS.md` into a non-empty folder you already own. To add the guide to an
  existing workspace, copy the template into the folder root:

  ```bash
  cp local-daemon/templates/AGENTS.md /path/to/your/folder/AGENTS.md
  ```

  It will render as a node on the root canvas within ~1s and your CLI agent will
  pick it up. (You can freely edit or delete it afterwards — it is a normal note.)

## Terminal & agent context

The embedded terminal panel (frontend) runs the user's own coding agent (Claude
Code, Codex, or a plain shell) cwd'd into the workspace folder. Two channels let
that agent know what the user is looking at on the canvas right now:

**Push** — the frontend debounces canvas selection / open document / text
selection (300 ms) into an in-memory, per-workspace store (no file writes — it
would spam the watcher for no benefit):

- `POST /workspaces/:id/ui-context` — body
  `{activeCanvasId, selectedNodeIds, openDocument: {nodeId}|null, textSelection: {nodeId, text}|null}`
  → `204`.
- `GET /workspaces/:id/ui-context` → the same context, enriched: every node id
  resolved to its workspace-relative path, and a text selection additionally
  resolved to a 1-based `{startLine, endLine}` by locating the (whitespace-
  normalized) text in that node's file on disk. Useful for debugging; it's also
  what backs the MCP tool below.
- `POST /workspaces/:id/resolve-context` — body `{nodeId, text?}` → `{path,
startLine?, endLine?}` (`404` if the node has no on-disk mapping). This is what
  the terminal panel's "Insert context" button/shortcut (`Ctrl+Shift+K`) calls
  before writing a reference into the active session's stdin — `@<path> ` per
  selected node, or `<path>:<startLine>-<endLine> ` for a resolved text
  selection (falls back to `@<path> ` if no lines resolve). Lands like a normal
  paste into whatever agent is running — no agent-specific integration needed.

**Pull** — for MCP-capable agents, kanwasd exposes a stateless streamable-HTTP
MCP endpoint at `POST /mcp` with two tools:

- `kanwas_get_ui_context` (optional `workspace` id arg, defaults to whichever
  workspace's context was most recently reported) → the same enriched context
  as `GET .../ui-context`, plus `workspaceFolder` (absolute path).
- `kanwas_workspace_info` → the mounted workspace(s): `id`, `folder`, `name`.

A brand-new (empty) folder is seeded with a `.mcp.json` (packaged as
`templates/mcp.json.template` — this repo's own `.gitignore` blanket-ignores
`.mcp.json` as a personal config, so the template is named differently on disk;
the file it seeds into your workspace is still `.mcp.json`) registering
`{"mcpServers":{"kanwas":{"type":"http","url":"http://127.0.0.1:4300/mcp"}}}` —
alongside `AGENTS.md` (same never-overwrite, empty-folder-only rules as below;
add it by hand to an existing workspace the same way you'd add `AGENTS.md`):

```bash
cp local-daemon/templates/mcp.json.template /path/to/your/folder/.mcp.json
```

## The writes the daemon makes to your folder

- `<folder>/.kanwas/workspace.json` — stable workspace id.
- `<folder>/AGENTS.md` and `<folder>/.mcp.json` — the CLI-agent guide and MCP
  registration, **only when seeding a brand-new empty folder** (never written
  into an existing/non-empty folder, never overwrites an existing one; seeded
  independently of each other).
- `<folder>/.kanwas/trash/<timestamp>/…` — files/dirs backing nodes you deleted
  **in the UI** (never hard-deleted).
- `metadata.yaml` sidecars (materialized for canvases that lack one; rewritten on
  structural change from either direction; echo-suppressed; idempotent — an
  unchanged sidecar is never rewritten).
- Content files backing nodes you **edited, created, renamed, or moved in the
  UI** (`.md`, `.sticky.yaml`; renames are byte-exact moves).
- **Uploaded binaries** you drop/add in the UI (written into the target canvas
  dir with a de-duplicated name); a binary node you rename in the UI moves its
  file (bytes preserved).

Files you never touch from the UI are **never** modified or deleted (verified by
checksum in the restart test).

## What actually remains (honest list)

Delivered through 2C: adoption, live sync both directions, flusher (notes /
structure / renames / trash), frontmatter byte-preservation, LWW convergence,
restart-stable identity, **uploads + binary node ops**, **editor atomic-save
identity**, **offline-rename recovery**, **git-checkout-storm resilience**, and a
chokidar-4-correct ignore.

Still open (later missions):

- **Live cross-directory move of a content file mints a new id.** Same-directory
  renames/moves (inode-preserved) and same-path atomic saves keep the id; a live
  `mv` into another directory fires create-before-delete with a fresh inode, and
  the content-hash pairing only fires for the delete-before-create ordering, so
  the moved file becomes a new node. (Restart recovers the id via adoption; git
  branch renames land as delete+add and likewise get a new id.)
- **Offline-rename id recovery is best-effort.** Binaries recover by stored
  contentHash; content files recover only when the match is an unambiguous 1:1
  within a canvas. Ambiguous renames (2+ files) fall back to fresh ids — no
  duplicates, no ghosts, but the id changes.
- **gitignore-aware ignore strategy** (only `.git/ node_modules/ .DS_Store
.kanwas/` are skipped; a user's own `.gitignore` is not consulted).
- **Generic code-file nodes** (only `.md`/`.sticky.yaml`/binaries back file
  nodes; `.text.yaml`/`.url.yaml` are read but never written by the flusher).
- **Windows** is **untested** (path-segment ignore + `path.sep` should port, but
  no run has been done there).
- **Trash retention policy** (`.kanwas/trash/` grows unbounded).
- **Electron / MCP** desktop packaging.

## Tests & verification

- `pnpm --filter local-daemon test` — 2A: adoption id-stability, non-destructive
  round-trip, empty-folder seed, offline-delete prune, **offline-rename recovery
  (1:1 + ambiguous-no-dup)**. 2B: frontmatter split/join byte-fidelity, flusher
  reconcile (note edit w/ frontmatter guard, UI-create incl. display-name nodes,
  byte-exact rename with edges, drag → metadata-only, delete → trash, idempotent
  no-op flush, debounce coalescing, **binary rename → file move + storagePath**,
  **binary delete → trash**). 2C: **name-match** (both-sides sanitize, per-type
  file resolution), **multipart** parse (binary-safe, boundary edge cases).
- `scripts/render-check.mjs`, `scripts/live-sync-check.mjs`,
  `scripts/media-canvas-check.mjs` — 2A headless browser checks (screenshots to
  `spike/artifacts/step2a-*.png`).
- `scripts/flush-check.mjs` — 2B: UI typing → disk (~2s), frontmatter
  byte-identity, echo-storm boundedness (no feedback loop), external+UI
  convergence (screenshots to `spike/artifacts/step2b-*.png`).
- `scripts/ui-ops-check.mjs` — 2B: UI create (document/sticky/text/link), drag
  (single debounced metadata write), rename (id-stable file move), delete
  (trash).
- `scripts/restart-check.mjs` — 2B headline: UI edits → SIGKILL → restart →
  identical render (same node ids/positions/content) + untouched checksums.
- `scripts/upload-check.mjs` — 2C: image/file/audio upload → exactly one node,
  file on disk, renders (restart-stability checked by the driver).
- `scripts/binary-check.mjs` — 2C: binary rename → file moved (id stable, bytes
  preserved), external replace → contentHash refresh, delete → trash.
- `scripts/atomic-check.mjs` — 2C: editor atomic saves (delete+recreate at 300ms
  and 900ms gaps, write-tmp+rename) with an edge attached → id/edge/position
  survive, content updates, exactly one node.
- `scripts/git-storm-check.mjs` — 2C: checkout back-and-forth between two
  branches → converges each time, identical-content files keep ids/positions,
  no dup/orphan nodes, bounded writes (no feedback storm), clean `git` tree.
  Screenshots to `spike/artifacts/step2c-*.png`.
