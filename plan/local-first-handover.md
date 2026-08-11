# Handover: Kanwas → Local-First, Agent-Free, Folder-as-Truth

**Date:** 2026-07-02. Produced from a deep architectural assessment (7 parallel code-exploration passes over this repo) at commit `7347be8e`, then updated after pulling master to `88208fbd` (2026-05-11). The 238 pulled commits landed heavily in the sync engine (`sync-manager.ts` +810 ln, `filesystem-syncer.ts` +791, `watcher.ts` +235, `room.ts` +472; new: `execenv/src/live-state-server.ts`, `shared/src/workspace/{markdown-normalization,metadata-sanitizer,canvas-tree,filesystem-paths}.ts`). **Core findings re-verified at `88208fbd` and still hold except where flagged ⚠️ below; fine-grained line numbers inside F2 are stale — re-verify before implementing.**

---

## 1. The Goal

Transform Kanwas (cloud collaborative canvas app) into a **simpler, local-first tool**:

1. **Remove the built-in AI agent** entirely.
2. **Run locally on top of any local folder** — the folder's structure renders as canvases, files as nodes. **The folder is the source of truth** (Obsidian-like), not the cloud yDoc.
3. **Replace the removed agent with the user's own local Claude Code / Codex CLI**, driving the app via the filesystem (and optionally MCP).

Reference product proving this exact shape works: **[tolaria](https://github.com/refactoringhq/tolaria)** — Tauri + React + TS, plain markdown + YAML frontmatter, every vault is a git repo, no CRDT/collab, bundled MCP server, supports Claude Code/Codex/Gemini CLI. Tolaria = goals 1–3 shipped, minus the canvas. **Kanwas's differentiator to preserve = the spatial canvas layer.**

Strategic rationale (from usage research): retention concentrates in ~25 loyalists who build a persistent "brain" + integrations. A local folder they own, driven by their own CLI agent, fits that better than an ephemeral cloud canvas.

---

## 2. Current Architecture (what exists)

Monorepo: `/backend` (AdonisJS API + agent), `/frontend` (React/Vite/ReactFlow), `/yjs-server` (Yjs sync + persistence, port 1999), `/shared` (the conversion engine — key package), `/execenv` (in-sandbox folder↔yDoc sync), `/cli` (`kanwas init/pull/push`), `/gitserver`, `/admin`, `/website`.

### Data model (`shared/src/types.ts`)

- `WorkspaceDocument` = `{ root: CanvasItem }`. `CanvasItem` is recursive (canvases nest). `NodeItem` wraps an `xynode` whose `type` ∈ `blockNote` (.md rich text), `image`/`file`/`audio` (binary w/ `storagePath`), `link`, `text`, `stickyNote`.
- **Every directory is a canvas** (old `c-` prefix is gone; some CLAUDE.md docs are stale on this). `.md` → BlockNote node; `metadata.yaml` per canvas dir holds positions/edges/node ids/groups/audit.
- yDoc is two-tier: root doc `getMap('state')` (structure) + `notes` map of subdocs (each note = `meta` map + `content` XmlFragment, BlockNote/ProseMirror).

### Where things live at runtime

- **yjs-server is the content store** (not Postgres). Pluggable `DocumentStore`: R2 or **local fs driver already exists** (`YJS_SERVER_STORAGE_DRIVER=fs`, `yjs-server/src/storage.ts`, `config.ts:110-140`).
- Postgres = auth/orgs/workspace _metadata_ only. Redis = required at boot but background-only in practice. Milvus = agent RAG only.
- Frontend renders purely from an in-browser Y.Doc synced over websocket (`frontend/src/providers/workspace/WorkspaceProvider.tsx:37`, `VITE_YJS_SERVER_URL`, default `localhost:1999`). Canvas render gates only on the Yjs `synced` event — **no REST needed to render**; REST is needed only to pass the auth/membership gate.

### The conversion engine (the crown jewels — network-agnostic, reusable as-is)

All in `shared/src/workspace/`, operate on a plain `Y.Doc` with injected IO callbacks:

- `converter.ts` (485 ln) — `workspaceToFilesystem()` (yDoc→folder)
- `filesystem-syncer.ts` (1928 ln) — `syncChange()` per-file folder→yDoc (what `cli push` uses; `autoCreateCanvases` option)
- `path-mapper.ts` (322), `content-converter.ts` (190), `workspace-content-store.ts`, `note-doc.ts`
- `execenv/` (~2.3k ln) is a thin orchestrator around this engine: `sync-manager.ts`, `watcher.ts` (chokidar), `filesystem.ts`, `metadata-manager.ts`, `markdown-merge.ts`. Plain Node, no Linux/container deps, portable to host/Electron-main/Tauri-sidecar. Its 4 backend REST calls (`execenv/src/api.ts`: binary fetch/upload, identity x2) are all injected callbacks — stubbable.

---

## 3. Key Findings (grounded, file:line)

### F1. Agent removal is deletion, not refactoring — LOW effort (~1 wk)

- Dependency direction is strictly agent→core. Core never imports agent.
- Frontend: canvas code has zero agent imports. Delete `components/chat/` (~6.9k ln), `components/skills/`, `providers/chat/`, agent api/hooks; unwrap `<ChatProvider>`/`<Chat>` in **one file** (`WorkspacePage.tsx` ~403-423). ~30% of frontend.
- Backend: delete `libs/agent/` (~8.3k ln), agent controllers/services/listeners/models; remove agent routes in `start/routes.ts`, `CanvasAgent` DI binding in `providers/app_provider.ts` (44-70), listener regs in `start/events.ts`. ~60% of backend.
- Drops entirely: Milvus, E2B, Composio, Codex binary, Restate.
- **Friction:** `backend/start/env.ts` marks cloud vars non-optional (`PARALLEL_API_KEY`, `COMPOSIO_API_KEY`, `RESTATE_INGRESS_URL`, `REDIS_*`, git server vars…) — must relax schema or backend won't boot.
- **Don't delete `execenv`** — it gets repurposed for local sync.

### F2. The live-sync engine assumes "yDoc is truth, folder is a disposable single-writer mirror" — this is THE core problem

Everything below is fine for an agent sandbox, fatal on a real user folder:

- **Wipes folder on startup:** `clearDirectory` at `execenv/src/sync-manager.ts:671` as of `88208fbd` (`fs.rm` recursive on every entry incl. `.git`, ignoring the watcher ignore-list), then rehydrates from yDoc. No adopt/merge path exists. ✅ re-verified after pull.
- **yDoc always wins:** on markdown divergence, user's on-disk edit silently overwritten (`sync-manager.ts:601-637`).
- **In-memory merge base** (`markdownShadowByNodeId`, `sync-manager.ts:118,674`) assumes sole writer; external edits (IDE, git, prettier) silently invalidate it.
- **Delete-then-recreate** (editor atomic saves, `git checkout`) mints a new node UUID, drops edges/content (`filesystem-syncer.ts:381, 643-680`).
- **`metadata.yaml`**: no write-tag suppression (loop safety relies on byte-identical regeneration, `filesystem.ts:114-124`); would be committed to git with volatile floats + audit emails (PII); any external reformat breaks idempotency.
- **`autoCreateCanvases:false`** default → new file in unknown dir throws "Cannot determine parent canvas" (`filesystem-syncer.ts:249`).
- Echo suppression for `.md` writes = SHA-256 hash tag w/ 15s TTL (`sync-manager.ts:770-851`); startup hydration is loop-safe only because the watcher starts _after_ hydration (`index.ts:127→150`, `ignoreInitial:true`).

### F3. Markdown round-trip is lossy BY DESIGN

- yDoc→md ends in `editor.blocksToMarkdownLossy` (`shared/src/workspace/blocknote-conversion.ts:39-40` at `88208fbd`). BlockNote normalizes bullets/escapes/blank lines. ✅ re-verified after pull.
- **New since assessment:** `shared/src/workspace/markdown-normalization.ts` (remark-based canonicalization, e.g. tight-list handling) landed upstream — the team is already mitigating round-trip diffs. Good sign for the tier-1 (keep BlockNote) editor decision; factor it into the fidelity spike.
- Consequence under collab model: line-level diffs → **false conflicts** → user edits reverted (data loss). Under folder-as-truth/no-collab model: degrades to **cosmetic reflow on save** (acceptable-ish; grates on humans who hand-tune md, irrelevant to agents).
- Lossiness is a property of the **block-model editor**, not of folder-as-truth. Obsidian has zero loss because its editor (CodeMirror 6) edits the markdown string directly — no second model exists.

### F4. Frontend↔backend coupling is thin (good news)

- To _enter_ a workspace: exactly `GET /auth/me` + `GET /workspaces` must succeed (`AuthProvider.tsx`, `App.tsx:38` WorkspacePageWrapper). Both shallow, easily stubbed.
- ⚠️ **CHANGED since assessment (branch `yjs-socket-auth` merged):** the yjs websocket **now requires an HMAC-signed socket token**. Verification is mandatory — `yjs-server/src/socket-token-verifier.ts` (HMAC-SHA256, throws without a secret), enforced at `socket-connection.ts:176`, secret = `BACKEND_API_SECRET` (required at yjs-server boot, `config.ts:46-47`); frontend fetches the token via `frontend/src/providers/workspace/useYjsSocketToken.ts` (a backend endpoint). **Local mode must mint tokens locally** (trivial: share a local secret between the local daemon and yjs-server and sign the same claims) **or add a dev/local bypass to the verifier.** Small extra work item vs. the original finding.
- Binary nodes resolve via one hook: `hooks/useSignedUrl.ts` → `GET /files/signed-url?path=<storagePath>`. `storagePath` is a backend Drive key (`files/{ws}/{canvas}/{name}`), not a path. Local mode: run backend Drive `fs` driver, or reimplement the hook to a local resolver.
- Auth = bearer token in header (no HttpOnly cookies), no service worker. Friendly to custom protocols.
- Electron/Tauri complications: `BrowserRouter` + base `/app/'` in prod (`vite.config.ts`) breaks on `file://` → need HashRouter or custom protocol; FontAwesome kit + Google Fonts load from CDN in `index.html` → self-host for offline.
- Empty workspace id → yjs-server creates empty doc (`room.ts:107-113`); root canvas normally seeded by backend `WorkspaceDocumentService.createDocument()` — local mode needs its own seed.

### F5. CLI / MCP / Codex reality check

- `/cli` (`kanwas init/pull/push`) = production-grade folder↔workspace sync w/ device-code OAuth, 3-way hash diff (`.kanwas.json` snapshot). Always dials remote yjs-server — no offline path.
- **No MCP server exists.** `@modelcontextprotocol/sdk` in `backend/package.json` is unused/vestigial. "MCP" in code = Composio's inbound tool router.
- "Codex CLI integration" = only a vendored `apply_patch` Rust binary in the sandbox image (`e2b.Dockerfile:10`). The agent owns its own loop (Vercel AI SDK `ToolLoopAgent`); no delegation-to-external-agent machinery exists. Sandbox abstraction `BaseSandbox` (`backend/libs/agent/sandbox/base.ts`) is clean but is an _exec_ seam, not an agent seam.
- **Goal #3 is trivial once folder is truth:** local Claude Code/Codex just edits files; the watcher pipeline turns edits into canvas updates. That's literally what the sandbox agent does today. But note: a local agent + human editing simultaneously = the multi-writer case → **goal #3 is gated on fixing F2**, not on any shell/MCP work.

---

## 4. Decisions Made in Discussion

### D1. Shell: (a) local daemon + existing web frontend BEFORE (b) Electron/Tauri

(b) is essentially (a) + a native wrapper: the frontend is inseparable from the Yjs websocket, so even a desktop app would bundle yjs-server as a sidecar. ~80% of work is shared; shell is the last ~15% (+2-4 wks, ongoing maintenance). **Build (a) first; wrap in Tauri later** (Tauri favored: small sidecar, bearer-token/no-cookie setup avoids usual friction). Tolaria validates Tauri choice.

### D2. Truth model: FOLDER IS TRUTH, and we accept dropping live collaboration to get it cheaply

User confirmed folder-as-truth is important and live collab is expendable. This is the key unlock: the CRDT-as-authority exists _only_ to serve real-time multi-user merge. Dropping collab **deletes** the hardest machinery instead of rebuilding it:

- **Demote the yDoc to an ephemeral in-memory edit buffer** (don't rip Yjs out — frontend editor bindings/undo are built on it). Build buffer from folder on open; flush to folder on edit; reload from folder on external change.
- Contract = Obsidian/VS Code: load-on-open, save-on-edit, reload-on-external-change, **last-writer-wins at file granularity**. No merge engine.
- Delete: clearDirectory rehydrate, yDoc-wins policy, merge base, 3-way merge at boundary, TTL/hash suppression (single process → deterministic watcher pause), yjs-server cloud persistence, backend content storage/signed URLs.
- Keep/accept: lose live co-editing/presence; same-file simultaneous edits clobber (fine). **Collab story becomes git** (fits dev/agent audience better anyway). Reversible: collab can be layered back later for a subset.
- Existing hook that makes reload viable: the frontend already handles **fragment replacement by remounting the BlockNote editor** (note-fragment hook, documented in CLAUDE.md "ContentConverter pattern" / "Frontend fragment references") — exactly the "file changed on disk → reload node" mechanism.

### D3. Editor: keep BlockNote for now (cheap tier), expect possible later swap

Three tiers assessed:

1. **Cheap (chosen for prototype):** keep BlockNote; prose→`.md`, structure→`metadata.yaml` sidecar. Loss becomes cosmetic reflow only. Kanwas already has the Obsidian-style prose/structure split — the sidecar is `metadata.yaml` (Obsidian's analog = JSON Canvas `.canvas` files; consider aligning for interop).
2. **Middle:** Milkdown / Tiptap-markdown (markdown-canonical ProseMirror) — near-zero loss, keeps WYSIWYG.
3. **Clean (Obsidian/tolaria):** markdown-native CodeMirror 6 — zero loss, no conversion exists; different feel (md source + live preview vs Notion blocks).
   Decision: prototype at tier 1, **measure** normalization annoyance, graduate only if it grates. Treat BlockNote as the component most likely to be replaced eventually.

---

## 5. What Remains Hard (open challenges)

1. **Non-destructive folder adoption** — replace `clearDirectory`+rehydrate with build-buffer-from-disk. Must handle pre-existing messy folders (`.git`, `node_modules`, symlinks). Watcher ignore-list is 4 hardcoded entries (`watcher.ts:29-34`) — needs real ignore strategy (gitignore-aware?).
2. **Generic file-type coverage** — today only `.md`/`.yaml`/known-binaries become nodes (`sync-manager.ts:419-429`); `.ts/.py/.json/.txt` are skipped. Need generic text/code node (read-only or CodeMirror), which is _easier_ without round-trip requirements.
3. **`metadata.yaml` hygiene** — auto-gitignore or move out of tree? strip audit PII; write-tagging if it stays watched; decide whether to align with JSON Canvas format.
4. **Rename/atomic-save/bulk coalescing** — preserve node UUIDs across delete+recreate; quiescence window for `git checkout` storms. (Simpler under last-writer-wins, but identity preservation still matters for edges/positions.)
5. **BlockNote reflow measurement** — quantify `blocksToMarkdownLossy` normalization on real notes; drives the tier-1 vs tier-3 editor decision.
6. **Local binary story** — `storagePath` semantics change to local paths; replace `useSignedUrl` with local resolver (static server or custom protocol).
7. **Workspace seed + auth stubs** — local mode needs root-canvas seeding (backend's `WorkspaceDocumentService.createDocument()` logic) and stubs for `syncCurrentUser`/`listWorkspaces`.
8. **MCP server (optional, later)** — greenfield if wanted; folder-as-interface makes it non-essential for v1.

---

## 6. Recommended Sequence & Estimates

| Phase | What                                                                                                                                                                                                                                                                     | Est.     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1     | **Spike (de-risk):** open existing folder → build yDoc buffer via `FilesystemSyncer` (`autoCreateCanvases:true`, as `cli/src/commands/push.ts:79` does) → render in unmodified frontend → edit `.md` externally → node reloads. Include round-trip fidelity measurement. | days     |
| 2     | **Remove agent** (F1). Keep execenv. Relax `env.ts`.                                                                                                                                                                                                                     | ~1 wk    |
| 3     | **Local daemon (option a):** repackaged execenv on host (drop clearDirectory, stub api.ts callbacks, local identity) + folder-as-truth buffer model (D2) + generic file nodes + local binary resolver + auth stubs + seed.                                               | ~4–8 wks |
| 4     | **Point Claude Code/Codex at the folder** (works via watcher pipeline; docs/README + maybe `.kanwas/` conventions).                                                                                                                                                      | ~1 wk    |
| 5     | **Tauri wrap (option b)** + optional MCP server for canvas-native ops.                                                                                                                                                                                                   | ~2–4 wks |

Biggest schedule risk: item 5 in §5 outcome (editor swap) and folder-adoption edge cases. Total realistic: **~2–3 months** to a shippable local-first v1.

---

## 7. Pointers for the Next Agent

- Read first: `shared/src/workspace/filesystem-syncer.ts`, `converter.ts`, `execenv/src/sync-manager.ts`, `frontend/src/providers/workspace/WorkspaceProvider.tsx`, `yjs-server/src/storage.ts`, `cli/src/commands/push.ts`.
- Trust-but-verify: repo CLAUDE.md files contain stale docs (`c-*` prefix removed; `getRouterTools()` no longer exists). Local checkout is now current with origin (`88208fbd`); core findings re-verified, but fine-grained F2 line numbers (beyond `clearDirectory` at `sync-manager.ts:671` and `autoCreateCanvases ?? false` at `filesystem-syncer.ts:271`) should be re-checked before implementation.
- Post-pull repo drift worth knowing: root CLAUDE.md no longer lists `gitserver` in docker-compose/deploy table (possibly decommissioned — check before planning around it); `agent_docs/` moved to `private/agent_docs/`; execenv gained a `live-state-server.ts` (349 ln — investigate, may affect the daemon design).
- Yjs gotchas documented in root CLAUDE.md matter for the buffer work: `Y.XmlElement.clone()` drops non-string attrs; replace whole `content` fragment + remount editor (React key = fragment identity); rebuild `shared` (`pnpm --filter shared build`) before other packages see changes.
- Tolaria (github.com/refactoringhq/tolaria) is the closest prior art — worth a repo teardown for its MCP server wiring, git integration, and Tauri sidecar patterns.
