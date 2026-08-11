# Kanwas Local-First — Assessment & Execution Plan

**Date:** 2026-07-02. Builds on `plan/local-first-handover.md` (its findings F1–F5 and decisions D1–D3 were re-verified at `88208fbd` and stand). This plan adds three new investigations run today: (1) an execenv repurposing map, (2) the exact frontend↔backend "local-mode contract," (3) a teardown of tolaria (github.com/refactoringhq/tolaria) and contrast with Obsidian.

---

## 0. TL;DR

- **Direction confirmed, with stronger evidence than the handover had.** Tolaria (~18k★, Tauri + React, AGPL) uses **BlockNote — the same editor as Kanwas — over plain `.md` folders**, and its ~150 ADRs document exactly how to make that non-lossy. The "keep BlockNote" decision (D3) upgrades from "cheap tier, measure, maybe swap" to "validated choice with a copyable playbook."
- **One discovery reshapes the build:** execenv has **no live yDoc→folder path** — it is a one-way pump (yDoc→folder once at boot, folder→yDoc continuously after). The "flush frontend edits to disk" half of folder-as-truth is **net-new code**, not an inversion. The natural seam for it already exists: yjs-server's debounced `DocumentStore` save.
- **Target architecture: one local daemon process** ("kanwasd") = yjs-server's sync core + a new folder-persistence driver + execenv's folder→yDoc engine + ~5 stub REST endpoints + local file serving + local socket-token minting. **The folder becomes the DocumentStore.**
- **Sequence:** Spike (days) → agent removal (~1 wk) → daemon core (~4–6 wks) → real-folder robustness (~2–3 wks) → CLI-agent conventions (~1 wk) → Tauri + MCP (~2–4 wks). Realistic total: **~2.5–3 months** to a shippable local-first v1. Matches the handover estimate.

---

## 1. What the new investigations changed

### 1.1 execenv is a one-way pump — the flusher is net-new (changes Phase-3 scope in the handover)

Verified by grep: **no `observe`/`observeDeep` anywhere in `execenv/src`.** After boot hydration, all live sync is folder→yDoc (`watcher → sync-manager.handleFileChange → FilesystemSyncer.syncChange`). yDoc→folder happens only:

- once, at boot (`workspaceToFilesystem` → `clearDirectory` → write tree, `sync-manager.ts:663-677`), and
- as narrow "yDoc wins" conflict writebacks triggered by folder events (`writeMarkdownWithSuppression`, `sync-manager.ts:879, 1188, 1250, 1560`).

Consequence: in the local model, when the user edits in the canvas UI, the edit lands in the daemon's yDoc via websocket — and **nothing existing writes it to disk**. We must build that flusher. Good news: yjs-server already debounces per-doc saves on live edits (`room.ts` `scheduleSave`, default 1000ms, `YJS_SERVER_SAVE_DEBOUNCE_MS`) into a pluggable `DocumentStore` (`storage.ts`). Implementing a **FolderStore** driver puts the flusher on a proven seam instead of raw Yjs observers.

Also confirmed by the execenv map:

- `execenv/src/live-state-server.ts` is a loopback-only (127.0.0.1:43127) JSON-RPC server **for the sandbox agent** to query/mutate canvas section layout. Agent-specific, built on yDoc-truth polling semantics. **Delete with the agent.**
- The 5 backend REST calls in `api.ts` split cleanly: binary fetch/upload are injected callbacks (trivially stubbable); members/current-user exist only for **audit attribution** (delete for single-user local, along with the metadata retry queue that exists only to retry failed identity lookups); the socket-token fetch is replaced by local minting.
- Cross-platform: npm deps are safe (chokidar 4, ws, yaml, diff3; `e2b` is devDependency-only). Only blockers: hardcoded `/tmp/kanwas-placement` (`sync-manager.ts:51`), `/workspace` default path, the `.ready` sandbox handshake, and bash-only `entrypoint.sh` — all sandbox-specific, all deletable.

### 1.2 The local-mode contract is small: 5 interactions + a seed

Everything the unmodified frontend needs, from load to editable canvas:

| #   | Interaction                                                                          | Notes                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /auth/me` → `{ id, email, name }`                                               | gates ProtectedRoute                                                                                                                                                               |
| 2   | `GET /workspaces` → `Workspace[]` containing the route's workspace id                | membership check in `App.tsx:53`                                                                                                                                                   |
| 3   | `POST /workspaces/:id/yjs-socket-token` → `{ token, expiresAt }`                     | token = `base64url(payload) + "." + HMAC-SHA256(payloadB64, secret)`, payload `{wid, uid, mode:'editable', exp}` (`yjs_socket_token_service.ts:27-43`). ~40 lines to mint locally. |
| 4   | socket.io to yjs-server (`VITE_YJS_SERVER_URL`, default `localhost:1999`)            | verifier (`socket-token-verifier.ts`) checks HMAC with `BACKEND_API_SECRET` — same secret signs and verifies, so a single-process daemon makes this trivial                        |
| 5   | `GET /files/signed-url?path=` → `{ url }` + `POST /workspaces/:id/files` (multipart) | replace with a local static-file route over the folder                                                                                                                             |

**Critical gotcha found:** an unseeded workspace **cannot render** — `room.ts` runs `assertValidWorkspaceRoot` on socket attach and rejects the connection if the root map is empty. A local seeder is mandatory for the empty-folder case. The seed shape is defined by `backend/app/services/workspace_bootstrap_service.ts:104-120` (`createSnapshotBundle`): root canvas map + one `kanwas_md` blockNote node + its note subdoc, wire-shape `{ root: <base64 Y update>, notes: { [nodeId]: <base64> } }`, injectable via `POST /documents/:id/replace` (Bearer = admin secret) or by writing the fs-driver blobs directly.

yjs-server already runs locally with: `BACKEND_API_SECRET=<anything>`, `YJS_SERVER_STORAGE_DRIVER=fs`, `BACKEND_URL` **unset** (cleanly degrades to no-op backend notifier + disabled share links — `config.ts:81-102`).

Secondary surface (workspace CRUD, members/invites/orgs, sharing, user-config, transcribe, summarize) is enumerable and either stubbed harmlessly or hidden in local mode — see §5 Phase 3.

### 1.3 Tolaria validates BlockNote and hands us the playbook

Tolaria is not the Obsidian model. It's **BlockNote 0.46.2 (rich mode) + CodeMirror 6 raw-markdown toggle (Cmd+K)** over plain files — a block-model editor converted to markdown on save, exactly Kanwas's situation. Their fidelity engineering, in the order they built it (all in public ADRs):

1. **Custom direct serializer** replacing `blocksToMarkdownLossy` (`src/utils/blockNoteDirectMarkdown.ts`): exact list markers, escaping, fence handling, returns a **fidelity flag + metrics**; falls back to lossy only for unsupported blocks.
2. **Durable blocks** (ADR-0082/0088/0107): fenced content (math, mermaid, tldraw) is swapped for placeholders before BlockNote parses and serialized back to the _exact stored source_ — passthrough islands the block model can't corrupt.
3. **Frontmatter never enters the editor** — split before parse, prepended on save.
4. **Single serialization owner** (ADR-0116): one module owns all blocks→md conversion after divergence bugs across autosave/tab-switch/raw-mode.
5. **Conflict policy** (ADR-0135/0111): external change + clean note → close/reopen from disk (full remount); external change + **dirty buffer → local buffer wins**, no merge. Tolerable because autosave debounce is 500ms, so the dirty window is tiny.
6. **Watcher**: Rust `notify`, debounced into one refresh; app-owned saves briefly suppressed (their echo suppression); all external-change sources converge on one `refreshPulledVaultState()`.
7. **MCP sidecar**: plain Node process Tauri spawns; **stdio** for Claude Code/Codex/Cursor + WS bridge for UI steering; **auto-registers itself** into `~/.claude/mcp.json` etc.; tools: `search_notes`, `get_note`, `create_note`, `open_note`, `highlight_editor`, `refresh_vault`.

Obsidian contrast: CM6 edits the markdown source string directly with live-preview decorations — zero conversion, byte-perfect by construction. Tolaria chose the block model anyway because block UX (drag handles, slash menus, tables, embedded tldraw) _is_ the product, and contained the lossiness rather than eliminating it. **That is exactly Kanwas's tradeoff — the spatial canvas + block editor is the differentiator, so we take the same route with the same mitigations.**

One gap tolaria doesn't answer: it's a list/graph PKM, not a spatial canvas — it stores UI state in frontmatter `_`-props and inline fenced JSON, never sidecar layout files. Kanwas's positions/edges sidecar (`metadata.yaml`) has no tolaria analog; that decision stays ours (§4, D5).

### 1.4 Confirmed deletions (cloud/agent machinery with no local role)

`live-state-server.ts` + placement-intent sidecar (`/tmp/kanwas-placement`) · audit actor attribution + members/current-user fetch + metadata retry queue · `.ready` marker + `entrypoint.sh` + Dockerfile/E2B toolchain · `clearDirectory` boot wipe · yDoc-wins conflict writebacks + markdown shadow map + 3-way merge (`sync-manager.ts:1072-1286`) · Kanwas.md restore-from-yDoc (`sync-manager.ts:1504,1552`) · cloud binary fetch/upload.

**Keep:** SHA-256 echo suppression (any process that watches and writes the same folder needs it; single process makes it deterministic) · watcher + ignore list (extend) · `FilesystemSyncer`/`converter.ts`/`PathMapper`/`ContentConverter` (the crown jewels, unchanged) · fragment-replacement remount hook in the frontend (this _is_ the external-reload mechanism).

---

## 2. Target architecture: one daemon, folder as the DocumentStore

```
                    ┌──────────────────────── kanwasd (one Node process) ───────────────────────┐
                    │                                                                           │
 Browser / Tauri    │  socket.io Yjs sync core          REST stubs                              │
 ┌──────────────┐   │  (from yjs-server: room,          /auth/me, /workspaces,                  │
 │ React front  │◄──┼─►socket-connection,               /workspaces/:id/yjs-socket-token,      │
 │ end, BlockNote│  │  token verify+MINT)               /files/signed-url → local static,      │
 │ unmodified   │   │        │                          POST files → write into folder         │
 └──────────────┘   │        ▼                                                                  │
                    │   in-memory yDoc (ephemeral edit buffer, per open workspace)              │
                    │        │ debounced save (existing scheduleSave seam)                      │
                    │        ▼                                                                  │
                    │   FolderStore (NEW DocumentStore driver)                                  │
                    │     load  = FilesystemSyncer full scan (autoCreateCanvases:true)          │
                    │     save  = note doc → .md write; root doc → metadata.yaml +              │
                    │             renames/moves reconcile   (suppression-tagged)                │
                    │        ▲                                                                  │
                    │   Watcher (chokidar, from execenv) ── folder→yDoc via syncChange          │
                    └────────┼──────────────────────────────────────────────────────────────────┘
                             ▼
                    📁 user's folder  =  SOURCE OF TRUTH   ◄── Claude Code / Codex / git / IDE
```

Why one process (vs yjs-server sidecar + separate daemon):

- **Single writer to the folder** → echo suppression becomes deterministic (the process knows exactly what it wrote) instead of hash+TTL heuristics across processes.
- Token mint and verify share one in-memory secret (generated at first run) — no cross-process secret plumbing, no verifier bypass patch.
- One port, one process to supervise; maps 1:1 onto the later Tauri sidecar (tolaria runs exactly one Node sidecar).
- yjs-server's `DocumentStore` interface (`storage.ts`) is already the pluggable persistence seam, and `BACKEND_URL`-unset mode already no-ops all cloud callbacks.

**Conflict policy (adopting tolaria's, replacing all merge machinery):** last-writer-wins at file granularity. External change while note open + clean → replace content fragment + remount editor (existing hook). External change while dirty → **editor buffer wins** (its debounced save overwrites; window kept small by ~500–1000ms debounce). No 3-way merge, no shadow base, no yDoc-wins writebacks. Deletes of user files by the daemon go to `.kanwas/trash/` rather than hard-delete, at least until trust is established.

**Persistence semantics:** the yDoc is rebuilt from the folder on workspace open and is disposable. The fs-driver binary blobs can remain as a cache/fast-open optimization, but the folder must always win on divergence (folder mtime/content is authoritative at load).

---

## 3. Decisions (carried + new)

| #        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1       | Local daemon + existing web frontend first; Tauri wrap later                                                                                                                                                                                                                                                                                                                                                                                                                                                          | carried from handover                                                                                                                                                                                                                |
| D2       | Folder is truth; drop live collab; yDoc = ephemeral edit buffer; LWW at file granularity; collab story = git                                                                                                                                                                                                                                                                                                                                                                                                          | carried, now with tolaria's exact clean-remount/dirty-wins policy                                                                                                                                                                    |
| D3       | Keep BlockNote                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **upgraded**: validated by tolaria; adopt their fidelity playbook staged (see §5, Fidelity track) instead of "measure and maybe swap." A CM6 raw-markdown toggle (their Cmd+K) is a cheap future escape hatch worth keeping in mind. |
| D4 (new) | **One daemon process**; folder implements the yjs-server `DocumentStore` interface                                                                                                                                                                                                                                                                                                                                                                                                                                    | proposed here                                                                                                                                                                                                                        |
| D5 (new) | `metadata.yaml` stays as the layout sidecar — cleaned (strip audit/PII, canonical stable serialization, suppression-tagged writes). JSON Canvas (`.canvas`) deferred to a later export/import interop feature, not the internal format                                                                                                                                                                                                                                                                                | **decided** 2026-07-02                                                                                                                                                                                                               |
| D6 (new) | Binary/file bytes live in the folder itself; `storagePath` becomes a workspace-relative path; signed-URL hook resolves to a daemon static route                                                                                                                                                                                                                                                                                                                                                                       | proposed here                                                                                                                                                                                                                        |
| D7 (new) | **Freeze cloud, build on a branch** (user decision 2026-07-02): master stays as-is serving cloud; local-first work happens on a long-lived branch (e.g. `local-first`) where deletions are allowed immediately. Cloud hotfixes on master get merged into the branch promptly (merge master → branch weekly early on, while histories are still close, to cap divergence pain). `/cli` freezes with cloud; deprecated on the branch. Staging auto-deploy is push-to-master, so branch work never deploys accidentally. | **decided**                                                                                                                                                                                                                          |

---

## 4. Phased plan

### Phase 0 — Spike (2–4 days) · de-risk before committing

No product code changes; everything in scripts/scratch + env vars.

1. Run stock yjs-server locally: `BACKEND_API_SECRET=dev`, `YJS_SERVER_STORAGE_DRIVER=fs`, `BACKEND_URL` unset.
2. Write a ~150-line stub server: `/auth/me`, `/workspaces`, `/workspaces/:id/yjs-socket-token` (mirror the HMAC scheme), `/files/signed-url` → serve from folder.
3. Seed script: run `FilesystemSyncer` over a real test folder (as `cli/src/commands/push.ts:79` does, `autoCreateCanvases:true`), POST the `{root, notes}` bundle to `/documents/:id/replace`.
4. Point the unmodified frontend (`VITE_YJS_SERVER_URL`, API URL) at the stubs → canvas must render.
5. External-edit loop: edit a `.md` on disk, re-run syncChange → confirm the open note reloads via fragment remount.
6. **Fidelity measurement:** for a corpus of real notes, run md → blocks → md; diff with and without the new `markdown-normalization.ts`; classify diffs (cosmetic reflow vs content-touching).

**Exit criteria:** real folder renders as canvas in the stock frontend; external edit propagates to an open note; a written fidelity report exists that decides how much of the tolaria serializer playbook we need.

### Phase 1 — Agent removal (~1 wk) · on the `local-first` branch, clean deletion (per D7)

Per handover F1 (deletion, not refactoring): frontend `components/chat|skills`, `providers/chat`, unwrap in `WorkspacePage.tsx` (~30% of frontend); backend `libs/agent`, agent routes/controllers/services/listeners, `CanvasAgent` DI, event regs (~60% of backend); drop Milvus/E2B/Composio/Restate/Codex-binary; relax `backend/start/env.ts` required-vars schema. Also delete execenv's agent-only parts now: `live-state-server.ts`, placement intent. **Keep the rest of execenv.**

**Exit criteria:** cloud app boots, canvas editing + uploads + sharing work, zero agent code, CI green.

### Phase 2 — Daemon core (~4–6 wks) · the heart

New package (e.g. `/local-daemon`, absorbing execenv's sync parts):

- **2a. Process assembly:** embed yjs-server sync core (room, socket-connection, verifier) + HTTP server hosting the REST stubs, local static file route, and token mint (~40 ln). Multi-folder registry in `~/.kanwas/config` → `GET /workspaces` lists registered folders.
- **2b. Adopt, don't wipe:** delete `clearDirectory` hydration; boot = FolderStore load (FilesystemSyncer full scan of the real folder). Empty folder → run local seeder (replicates `createSnapshotBundle`; must pass `assertValidWorkspaceRoot`).
- **2c. The new flusher (yDoc→folder):** hook the debounced `scheduleSave` seam. Note-doc save → `ContentConverter` → `.md` write with suppression tag. Root-doc save → reconcile structure per affected canvas: `metadata.yaml` rewrite, file/dir renames, moves; deletes → `.kanwas/trash/`. _Most novel code in the project — start coarse (re-reconcile whole affected canvas dir) before getting clever._
- **2d. Conflict policy swap:** delete 3-way merge, shadow map, yDoc-wins writebacks; implement clean-remount / dirty-buffer-wins (frontend side rides the existing fragment-replacement hook).
- **2e. Binaries local:** `fileFetcher`/`fileUploader` → folder read/write; `storagePath` → relative path; `useSignedUrl` endpoint returns daemon static URL; canvas uploads write into the canvas directory.
- **2f. Node identity:** preserve UUIDs across editor atomic saves (delete+recreate) and renames — quiescence window + content-hash matching around `filesystem-syncer.ts` create/delete paths.
- **2g. Hygiene:** remove `/tmp/kanwas-placement`, `/workspace` default, `.ready`; `os.tmpdir()` where needed; runs on macOS + Windows.

**Exit criteria:** point daemon at an empty folder _and_ an existing messy folder → both render; edit in UI → file changes on disk within ~1s; edit on disk → UI updates; kill daemon mid-edit, restart → no loss beyond the debounce window; `git checkout` across branches doesn't destroy layout or mint duplicate nodes.

### Phase 3 — Real-folder robustness (~2–3 wks)

- Generic file nodes: `.ts/.py/.json/...` render as read-only text/code nodes (extend the allowlist at `sync-manager.ts:419-429`); easier now that non-md files never round-trip.
- Gitignore-aware watcher ignore strategy (replace the 4 hardcoded entries).
- `metadata.yaml` hygiene per D5: no PII, stable canonical output, byte-identical idempotent regeneration.
- Bulk-event coalescing: quiescence window for git-checkout/branch-switch storms; `refresh` semantics converging on one code path (tolaria's `refreshPulledVaultState` pattern).
- Local-mode frontend trims: hide/neutralize members, invites, orgs, sharing, transcribe/summarize (or stub them harmlessly).
- Offline assets: self-host Google Fonts + FontAwesome (also required for Phase 5).

**Exit criteria:** adopt the kanwas repo itself and a real Obsidian vault without damage; a CLI agent editing 15 files in a burst settles into a correct canvas with stable node identities.

### Phase 4 — CLI-agent integration (~1 wk)

Mostly conventions + verification, since the folder _is_ the interface: template `AGENTS.md`/`CLAUDE.md` explaining canvas conventions (dirs = canvases, `metadata.yaml`, how to place nodes); end-to-end test driving Claude Code against a live daemon; document `.kanwas/` conventions.

**Exit criteria:** demo — Claude Code builds and rearranges a canvas purely via file edits while the UI follows live.

### Phase 5 — Packaging: Tauri wrap + MCP (~2–4 wks)

- Tauri app with kanwasd as the single sidecar (copy tolaria's patterns: stable sidecar extraction path + version marker + process lock, ADR-0120).
- Vite `base: '/'` for the desktop build; BrowserRouter → hash routing or custom protocol.
- MCP server (v1.1, optional): stdio Node process reusing the daemon's HTTP API; tolaria's tool set is the template (`search_notes`, `get_note`, `create_note`, `open_note`, `highlight_editor`, `refresh_vault` — the last two need a daemon→frontend push channel, which the socket.io connection already provides); auto-register into `~/.claude/mcp.json` / `~/.cursor/mcp.json`.

### Fidelity track (parallel, gated by the Phase-0 measurement)

1. **Stage 1 (free):** rely on the already-landed `markdown-normalization.ts` canonicalization.
2. **Stage 2 (if reflow grates):** port tolaria's approach — custom direct serializer with fidelity flag + single-serialization-owner module (their `blocksToMarkdownDirect` / ADR-0116 are public reference implementations).
3. **Stage 3 (targeted):** durable exact-source passthrough for fenced blocks (code, mermaid, math).
4. Keep a CM6 raw-markdown mode toggle on the roadmap as the escape hatch (tolaria's Cmd+K).

---

## 5. Risk register

| Risk                                                                                                      | Severity | Mitigation                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Root-doc flusher (structure → filesystem renames/moves/deletes) is the most novel code                    | High     | Start with coarse per-canvas reconcile; deletes to `.kanwas/trash/`; extensive fixture tests (rename, move, atomic save, git checkout) |
| Node identity across delete+recreate (editor atomic saves, git)                                           | High     | Quiescence window + content-hash matching; carried from handover challenge #4                                                          |
| Reflow fidelity worse than expected on real notes                                                         | Medium   | Phase-0 measurement decides; tolaria playbook is a known-cost fallback (+~2 wks)                                                       |
| yjs-server internals (room.ts) written for cloud — reuse friction                                         | Medium   | Fallback: run yjs-server nearly unmodified with only a FolderStore driver behind the existing `DocumentStore` interface                |
| Note-subdoc lifecycle (create-note-bundle path, `socketio-provider.ts:261-292`) must map to file creation | Medium   | Covered by 2c; spike partially exercises it                                                                                            |
| Hidden frontend cloud dependencies surfacing late                                                         | Low      | Spike exercises the whole render path; secondary REST surface already enumerated                                                       |
| Watching huge folders (node_modules, monorepos)                                                           | Low      | Gitignore-aware ignores in Phase 3; chokidar 4 handles scale                                                                           |

---

## 6. Open decisions

1. ~~**Pivot vs dual-mode.**~~ **Decided 2026-07-02 → D7: freeze cloud on master, build on a long-lived `local-first` branch with deletions.**
2. ~~**Layout sidecar format**~~ **Decided 2026-07-02 → D5: keep `metadata.yaml`** (cleaned, with door-keeping: schema version field, canonical serialization, PII strip). JSON Canvas export/import as a later interop feature. Tradeoff that informed the decision preserved below.

### 6.1 Layout sidecar tradeoff: `metadata.yaml` vs JSON Canvas (`.canvas`)

What the sidecar must hold, whichever format wins: node ids + file mappings, positions/sizes, edges, sections/groups, and the **file-less node types** (sticky notes, text, links — these have no backing file; their content lives entirely in the sidecar). Both formats _can_ hold all of it; the difference is whether Kanwas-specific data rides in first-class fields or in nonstandard extensions.

**Complexity**

- `metadata.yaml`: zero migration. The entire conversion engine — `FilesystemSyncer` (1.9k ln), `converter.ts`, `PathMapper`, `MetadataManager` — reads and writes it today. Phase 2 already performs surgery on exactly this code for the truth-model inversion; changing the file format in the same window doubles the risk in the most subtle code in the repo.
- JSON Canvas: touches every serialization point, plus real schema-mapping decisions: nested canvases (Kanwas: every directory is a canvas) become one `.canvas` file per directory with `file`-nodes pointing at child `.canvas` files; sections → `group` nodes; `xynode.data` (storagePath, mimeType, contentHash, systemNodeKind) → custom fields. Estimate +1.5–2 wks, concentrated in crown-jewel code.

**UX**

- `metadata.yaml`: human-readable, git-diffable once canonicalized; meaningless to every other app.
- JSON Canvas: the killer demo — open your Kanwas folder in Obsidian and canvases _render_. CLI agents also know the format natively (the jsoncanvas.org spec is in training data), vs learning our bespoke YAML schema from docs. **But** interop is shallower than it looks: sticky-note styling, audio nodes, section semantics, and all `xynode.data` ride in nonstandard fields that Obsidian ignores — and if a user rearranges the canvas _in Obsidian_ and saves, unknown fields may be dropped → silent loss of Kanwas-specific state. In practice it's read-mostly interop, not round-trip.

**Deferability — can it be a later step? Yes, and it's genuinely cheaper later:**

- A later **internal migration** happens against a stable folder-as-truth engine covered by golden-fixture folders — a contained format swap instead of a format swap tangled into a truth-model inversion.
- An even cheaper middle path exists first: **JSON Canvas import/export as a pure converter feature** (days of work, zero engine risk) — gets the "opens in Obsidian" demo without committing the internals.
- Only door-keeping is needed now (Phase 3): schema `version:` field, deterministic canonical output, PII strip.

**Extensibility (images, sticky notes, audio, sections, future node types)**

- `metadata.yaml`: our schema — new node types and fields are free forever.
- JSON Canvas: the spec has exactly `text`/`file`/`link`/`group` nodes. Images/files/audio map to `file` nodes fine; sticky notes ≈ `text`+color; but everything beyond that is a nonstandard extension — and the more Kanwas extends, the less the file is really "JSON Canvas," eroding the interop that motivated the switch.

**Recommendation:** keep `metadata.yaml` as the internal format through v1 (with Phase-3 door-keeping); ship **JSON Canvas export/import** as an interop feature after Phase 3; reconsider a full internal migration only if "your Kanwas vault is an Obsidian vault" becomes core positioning rather than a demo.

---

## 7. Pointers

- Prior doc: `plan/local-first-handover.md` (findings/decisions referenced as F1–F5, D1–D3).
- Read first for Phase 2: `yjs-server/src/storage.ts` (DocumentStore seam), `yjs-server/src/room.ts` (scheduleSave, assertValidWorkspaceRoot, replaceDocument), `backend/app/services/workspace_bootstrap_service.ts` (seed shape), `backend/app/services/yjs_socket_token_service.ts` (token mint to mirror), `shared/src/workspace/filesystem-syncer.ts`, `execenv/src/sync-manager.ts`.
- Tolaria references worth reading before Phase 2/5: ADR-0022 (BlockNote), 0105/0111/0135 (correctness + conflict policy), 0116 (single serialization owner), 0082/0088/0107 (durable blocks), 0011/0120 (MCP sidecar), `src/utils/blockNoteDirectMarkdown.ts`, `docs/ARCHITECTURE.md`.
