# Kanwas Local-First — Core Build

> **STATUS: COMPLETE — 2026-07-03.** All §4 exit criteria PASS, evidence table in `local-daemon/VERIFICATION.md` (screenshots/JSONs in `spike/artifacts/`). Built across 5 verified missions (spike → agent removal → daemon core 2A/2B/2C → Claude Code demo) on the `local-first` branch, uncommitted. Remaining v1 gaps listed at the end of `local-daemon/README.md` and in VERIFICATION context.

**Date:** 2026-07-02 · **Scope:** the main task only — getting from today's cloud app to a working local-first core (spike → agent removal → local daemon). Later work (folder-robustness hardening, Tauri wrap, MCP server, JSON Canvas export) is intentionally _not_ in this doc; see `plan/local-first-plan.md` for the full roadmap and `plan/local-first-handover.md` for the underlying architectural findings.

**All work happens on a long-lived `local-first` branch. Master is frozen for cloud** (staging deploys are push-to-master, so branch work never deploys; cloud hotfixes get merged into the branch promptly).

---

## 1. The product after this task

Kanwas becomes a **local app on top of any folder you own**:

- You point Kanwas at a folder on disk. The folder renders as a **spatial canvas**: every directory is a canvas (nested dirs = nested canvases), `.md` files are rich-text nodes (BlockNote, same editor as today), images/audio/files are media nodes. Sticky notes, text snippets, and links have no backing file — they live in the canvas's `metadata.yaml` sidecar, alongside positions, edges, and groups.
- **The folder is the source of truth** (Obsidian model). Everything is plain files: portable, git-friendly, readable by any editor or tool. Delete Kanwas and your data is still just a folder of markdown.
- **No built-in AI agent, no accounts, no cloud.** Users bring their own CLI agent — Claude Code, Codex — pointed at the folder. Agent file edits appear on the canvas live, via the same watcher pipeline the cloud sandbox agent uses today.
- **Editing model:** edit a node in the canvas → the `.md` file on disk updates within ~1 second. Edit the file externally (agent, git, IDE) → the open node reloads. Conflict policy is deliberately simple: **last-writer-wins at file granularity**; if you have unsaved edits in an open note, your buffer wins (the tight autosave debounce keeps that window tiny). No merge engine.
- **No live multiplayer.** Collaboration = git (branch, commit, PR — which fits the dev/agent audience the retention data points at).
- Ships as a **local daemon + the existing web frontend in a browser**. Desktop packaging (Tauri) comes later and wraps this unchanged.

What is dropped, permanently or deferred: cloud accounts/orgs/members/invites/share links, live co-editing & presence, the built-in agent + chat + skills UI, all agent infra (Milvus, E2B, Composio, Restate), and the `kanwas` CLI (`init/pull/push` is redundant when the folder _is_ the workspace).

---

## 2. Target architecture

One Node process, **`kanwasd`**:

```
                    ┌──────────────────────── kanwasd (one Node process) ───────────────────────┐
                    │                                                                           │
 Browser            │  socket.io Yjs sync core          REST stubs                              │
 ┌──────────────┐   │  (from yjs-server: room,          /auth/me, /workspaces,                  │
 │ React front  │◄──┼─►socket-connection,               /workspaces/:id/yjs-socket-token,      │
 │ end, BlockNote│  │  token verify + MINT)             /files/signed-url → local static,      │
 │ ~unmodified  │   │        │                          POST files → write into folder         │
 └──────────────┘   │        ▼                                                                  │
                    │   in-memory yDoc (ephemeral edit buffer, rebuilt from folder on open)     │
                    │        │ debounced save (existing scheduleSave seam, ~500–1000ms)         │
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

**Two sync loops:**

1. **UI → disk:** canvas edit → yDoc (websocket, as today) → room's debounced `scheduleSave` → FolderStore writes the `.md` / `metadata.yaml` / binary, tagging the write so the watcher ignores its own echo.
2. **Disk → UI:** file change → chokidar watcher → `FilesystemSyncer.syncChange` → yDoc → frontend updates live. Open clean notes reload via the existing fragment-replacement remount hook; open dirty notes keep the local buffer.

**Component provenance** (build-vs-reuse is the point of the whole design):

| Component                                                          | Source                                                                                                     | Status                                                                                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yjs sync core (rooms, sockets, subdocs, token verify)              | `yjs-server/src/` (`room.ts`, `socket-connection.ts`, `socket-token-verifier.ts`)                          | **Reuse** (light refactor to embed)                                                                                                                             |
| Conversion engine (folder↔yDoc, md↔blocks, paths)                | `shared/src/workspace/` (`filesystem-syncer.ts`, `converter.ts`, `content-converter.ts`, `path-mapper.ts`) | **Reuse unchanged** — the crown jewels are already network-agnostic with injected IO                                                                            |
| File watcher + suppression mechanics                               | `execenv/src/` (`watcher.ts`, suppression from `sync-manager.ts`)                                          | **Reuse, trimmed**                                                                                                                                              |
| FolderStore (yDoc→folder flusher behind `DocumentStore` interface) | —                                                                                                          | **NEW — the core novel work.** Nothing like it exists: execenv is a one-way pump (no yDoc observers anywhere; yDoc→folder today happens only at boot hydration) |
| REST stubs + local token mint + static file route + seeder         | mirror `yjs_socket_token_service.ts:27-43` (~40 ln) and `workspace_bootstrap_service.ts:104-120`           | **NEW, small**                                                                                                                                                  |
| Frontend                                                           | `frontend/`                                                                                                | **~Unmodified** in this task (env vars point at kanwasd; agent UI deleted; dirty-buffer reload rule added)                                                      |

---

## 3. Tech decisions (for review)

| #   | Decision                                                                                                                                                                                                                                                                     | Rationale / evidence                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Folder is truth; yDoc demoted to an ephemeral in-memory edit buffer.** Rebuilt from folder on open; disposable. Yjs is NOT ripped out — frontend editor bindings and undo are built on it.                                                                                 | Ripping Yjs out would mean rewriting the editor integration for zero user benefit. Demoting it deletes the hard machinery (see #2) while keeping the plumbing.                                                                                                                                                                                                                        |
| 2   | **Drop live collaboration.** Last-writer-wins at file granularity; dirty editor buffer wins over external change; clean open notes remount from disk. Delete the entire merge apparatus: `clearDirectory` boot wipe, yDoc-wins writebacks, markdown shadow map, 3-way merge. | CRDT-as-authority exists only to serve realtime multi-user merge. The conflict policy is copied from tolaria (ADR-0135/0111), proven at ~18k★ scale. Collab story becomes git. Reversible later for a subset.                                                                                                                                                                         |
| 3   | **Keep BlockNote.**                                                                                                                                                                                                                                                          | Tolaria — the closest prior art — uses BlockNote over plain `.md` folders too, and its ADRs are a public playbook for fidelity (custom direct serializer w/ fidelity flag, durable exact-source blocks, single serialization owner). Kanwas's own `markdown-normalization.ts` already mitigates round-trip diffs. Fidelity is measured in the spike; playbook adopted only if needed. |
| 4   | **One daemon process; the folder implements yjs-server's existing `DocumentStore` interface.**                                                                                                                                                                               | Single writer → deterministic echo suppression (process knows its own writes). Token mint+verify share one in-memory secret. The debounced `scheduleSave` seam already exists (`room.ts`), so the new flusher sits on proven infrastructure instead of raw Yjs observers. Maps 1:1 to a future Tauri sidecar.                                                                         |
| 5   | **`metadata.yaml` stays as the layout sidecar** — cleaned: strip audit/PII, canonical deterministic serialization, schema `version:` field. JSON Canvas becomes a later export/import feature, not the internal format.                                                      | The whole conversion engine already speaks it; swapping formats during the truth-model inversion doubles risk in the most subtle code. JSON Canvas's 4 node types can't hold Kanwas semantics (sticky notes, audio, sections, node data) without nonstandard fields Obsidian drops on save anyway. Door-keeping keeps a later switch cheap.                                           |
| 6   | **Binaries live in the folder.** `storagePath` becomes a workspace-relative path; `useSignedUrl` resolves against a kanwasd static route; uploads write into the canvas directory.                                                                                           | The folder is the byte store — no Drive, no signed URLs, no cloud storage.                                                                                                                                                                                                                                                                                                            |
| 7   | **Keep the socket-token auth path, mint locally.** kanwasd signs the same HMAC claims (`{wid, uid, mode, exp}`) with a locally generated secret and verifies them itself.                                                                                                    | ~40 lines, and the frontend stays untouched — no bypass patches to the verifier.                                                                                                                                                                                                                                                                                                      |
| 8   | **Frontend stays as close to unmodified as possible in this task.** Only: agent/chat/skills deletion, env-based API/yjs URLs, the dirty-buffer reload rule. Members/orgs/sharing UI is stubbed harmlessly, trimmed later.                                                    | Every frontend change is a regression risk multiplier; the local-mode contract is deliberately shaped so stock frontend works (verified: exactly 3 REST calls + socket token + seed gate rendering).                                                                                                                                                                                  |

**Known gotchas the implementation must respect** (from verification passes — details in the handover doc):

- An unseeded workspace **cannot connect**: `room.ts` runs `assertValidWorkspaceRoot` on socket attach and rejects empty docs → the local seeder (replicating `createSnapshotBundle`: root canvas + one `kanwas_md` note + its subdoc) is mandatory for the empty-folder case.
- `Y.XmlElement.clone()` drops non-string attributes — always replace the whole `content` fragment and remount the editor (React key = fragment identity). The frontend hook for this already exists.
- Note bodies are Yjs **subdocs**; new-note creation flows through the provider's `create-note-bundle` path (`socketio-provider.ts:261-292`) — the FolderStore must map this to file creation.
- Rebuild `shared` (`pnpm --filter shared build`) before other packages see changes.

---

## 4. Work breakdown

### Step 0 — Spike (2–4 days) · de-risk before committing

No product code changes; scripts + env vars only.

1. Run stock yjs-server locally: `BACKEND_API_SECRET=dev`, `YJS_SERVER_STORAGE_DRIVER=fs`, `BACKEND_URL` unset (cleanly degrades to no-op notifier).
2. ~150-line stub server: `GET /auth/me`, `GET /workspaces`, `POST /workspaces/:id/yjs-socket-token` (mirror the HMAC scheme), `GET /files/signed-url` → serve from folder.
3. Seed script: `FilesystemSyncer` full scan over a real test folder (`autoCreateCanvases:true`, exactly as `cli/src/commands/push.ts:79` does) → POST `{root, notes}` bundle to yjs-server's `/documents/:id/replace` (Bearer = the secret).
4. Point the unmodified frontend at the stubs (`VITE_YJS_SERVER_URL` + API URL) → canvas must render.
5. External-edit loop: change a `.md` on disk → re-run `syncChange` → open note reloads via fragment remount.
6. **Fidelity measurement:** corpus of real notes through md → blocks → md; diff with/without `markdown-normalization.ts`; classify cosmetic reflow vs content-touching changes.

**Exit:** a real folder renders in the stock frontend; an external edit propagates into an open note; a written fidelity report decides how much of tolaria's serializer playbook we need (none / direct serializer / durable blocks).

### Step 1 — Agent removal (~1 wk) · clean deletion on the branch

- Frontend: delete `components/chat/` (~6.9k ln), `components/skills/`, `providers/chat/`, agent api/hooks; unwrap `<ChatProvider>`/`<Chat>` in `WorkspacePage.tsx` (~403-423). ~30% of frontend.
- Backend: delete `libs/agent/` (~8.3k ln), agent controllers/services/listeners/models, agent routes in `start/routes.ts`, `CanvasAgent` DI binding (`providers/app_provider.ts:44-70`), listener regs in `start/events.ts`. ~60% of backend.
- Relax `backend/start/env.ts` (cloud vars currently non-optional — backend won't boot otherwise).
- Drop deps/infra: Milvus, E2B, Composio, Restate, Codex binary.
- execenv: delete the agent-only parts now — `live-state-server.ts` (loopback layout API for the sandbox agent), placement-intent sidecar (`/tmp/kanwas-placement`, `sync-manager.ts:51`). **Keep the rest of execenv** — it becomes daemon material in Step 2.

**Exit:** app boots and canvas editing/uploads work with zero agent code; CI green on the branch.

### Step 2 — Daemon core (~4–6 wks) · the heart

New package (e.g. `/local-daemon`), absorbing execenv's sync parts:

| Item                                                | Work                                                                                                                                                                                                                                                                                                                                                     | Key references                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 2a. Process assembly                                | Embed yjs-server sync core + HTTP server hosting REST stubs, static file route, token mint. Multi-folder registry in `~/.kanwas/config` backs `GET /workspaces`.                                                                                                                                                                                         | `yjs-server/src/{room,socket-connection,socket-token-verifier}.ts`; mint mirrors `yjs_socket_token_service.ts:27-43` |
| 2b. Adopt, don't wipe                               | Delete `clearDirectory` hydration (`sync-manager.ts:663-677`). Boot = FolderStore load: FilesystemSyncer full scan of the real folder. Empty folder → local seeder (must pass `assertValidWorkspaceRoot`).                                                                                                                                               | `workspace_bootstrap_service.ts:104-120`                                                                             |
| 2c. **The flusher (yDoc→folder) — most novel code** | Hook the debounced `scheduleSave` seam. Note-doc save → `ContentConverter` → `.md` write w/ suppression tag. Root-doc save → reconcile structure per affected canvas: `metadata.yaml` rewrite, file/dir renames & moves; deletes go to `.kanwas/trash/`, never hard-delete. Start coarse (re-reconcile the whole affected canvas dir) before optimizing. | `room.ts` scheduleSave; `content-converter.ts`; suppression from `sync-manager.ts:1418-1500`                         |
| 2d. Conflict policy swap                            | Delete 3-way merge, shadow map, yDoc-wins writebacks (`sync-manager.ts:1072-1286`), Kanwas-restore-from-yDoc. Implement clean-remount / dirty-buffer-wins (frontend rides the existing fragment-replacement hook).                                                                                                                                       | tolaria ADR-0135 as the reference policy                                                                             |
| 2e. Binaries local                                  | `fileFetcher`/`fileUploader` (already injected callbacks) → folder read/write. `storagePath` → relative path. Signed-url stub returns daemon static URL. Uploads write into the canvas dir.                                                                                                                                                              | `execenv/src/api.ts:32,67`; `useSignedUrl.ts`                                                                        |
| 2f. Node identity                                   | Preserve UUIDs across editor atomic saves (delete+recreate) and renames: quiescence window + content-hash matching around the syncer's create/delete paths.                                                                                                                                                                                              | `filesystem-syncer.ts:381, 643-680`                                                                                  |
| 2g. Cross-platform hygiene                          | Remove `/workspace` default and `.ready` marker; `os.tmpdir()` where needed; delete audit attribution + metadata retry queue (cloud-identity only). Runs on macOS + Windows.                                                                                                                                                                             | `execenv/src/index.ts:24`, `sync-manager.ts:1673-1820`                                                               |

**Exit criteria for the whole task:**

- Point kanwasd at an **empty folder** and at an **existing messy folder** (with `.git`, stray files) → both render; no file is ever wiped or lost on adoption.
- Edit in the UI → file on disk updates within ~1s. Edit on disk → UI updates live; open clean note remounts; open dirty note keeps the buffer.
- Kill the daemon mid-edit, restart → no loss beyond the debounce window; layout intact.
- `git checkout` across branches → no destroyed layout, no duplicated node identities.
- A CLI agent (Claude Code) editing files produces live canvas updates — no Kanwas-specific tooling needed.

---

## 5. Risks (this task only)

| Risk                                                                                                           | Severity | Mitigation                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Root-doc flusher: structure changes → filesystem renames/moves/deletes. Most novel code, no prior art in repo. | **High** | Coarse per-canvas reconcile first; deletes to `.kanwas/trash/`; fixture tests for rename / move / atomic-save / git-checkout sequences |
| Node identity across delete+recreate (editor atomic saves, git)                                                | **High** | Quiescence window + content-hash matching; the known-hard problem, budgeted in 2f                                                      |
| Reflow fidelity worse than expected on real notes                                                              | Medium   | Spike measures it _before_ commitment; tolaria's serializer playbook is the known-cost fallback (+~2 wks)                              |
| `room.ts` reuse friction (written for cloud)                                                                   | Medium   | Fallback: run yjs-server nearly unmodified with only a FolderStore behind the existing `DocumentStore` interface                       |
| Note-subdoc lifecycle (create-note-bundle) mapping to file creation                                            | Medium   | Explicit 2c work item; partially exercised in the spike                                                                                |
| Hidden frontend cloud dependencies                                                                             | Low      | Spike exercises the full render path; the secondary REST surface is already enumerated                                                 |
