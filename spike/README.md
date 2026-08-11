# Local-First Core Build — Step 0 Spike

Proves the local-first loop end-to-end with **zero product-code changes**: a real
folder on disk renders as a canvas in the **stock** Kanwas frontend, an external
`.md` edit propagates live into an open note, and a written fidelity report
decides how much of tolaria's serializer playbook we need.

Everything here is scaffolding (scripts + env + untracked `node_modules`
symlinks). No file under `frontend/ backend/ yjs-server/ shared/ execenv/ cli/`
source was modified.

## Exit-criteria checklist

| #   | Criterion                                                        | Result   | Evidence                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | A real folder renders as a canvas in the STOCK frontend          | **PASS** | `artifacts/a-root-canvas.png` (5 canvas nodes: `expedition-notes`, `readme` + `writing`/`media`/`reference` sub-canvases, with the note's headings/table/blockquote/code-fence rendered); `scripts/render-check.mjs` asserts `.react-flow__node ≥ 3` + seeded text in the DOM and prints `RESULT: PASS` |
| b   | An external `.md` edit propagates into an open note              | **PASS** | `artifacts/b-before.png` → `artifacts/b-after.png` (note gains an "External edit / Marker: …" block live); `scripts/external-edit-test.mjs` prints `RESULT: PASS`. yjs-server log shows `Accepted workspace socket connection` for the non-frontend `execenv` client                                    |
| c   | Written fidelity report classifying md→blocks→md diffs + verdict | **PASS** | `fidelity-report.md` (18 real files): 15/18 cosmetic-reflow, 3 structural (no text lost), 14/14 frontmatter mangled, **zero** heading/code/link/table content loss. Verdict: **Tier 1 + a frontmatter split-guard suffices; no direct serializer or durable blocks required for v1**                    |

## Architecture of the spike

```
 browser (stock frontend, vite :5199, base /app/)
   │  REST (auth/me, workspaces, yjs-socket-token, files/signed-url) → stub :3334
   │  socket.io (yjs) + minted HMAC token                            → yjs-server :1999
   ▼
 yjs-server (stock code, fs driver, BACKEND_URL unset → no-op notifier)
   ▲  seed: FilesystemSyncer full scan of test-folder → {root,notes} bundle
   │        POST /documents/<wsid>/replace  (Bearer dev)
   │  external edit: connectToWorkspace (execenv client) + FilesystemSyncer.syncChange
 test-folder/  (the "vault": 11 .md across nested dirs + 2 images)
```

- **Workspace id:** `4a7c1e9b-2d6f-4b3a-9c1e-000000000001` (URL form `4a7c1e9b2d6f4b3a9c1e000000000001`).
- **Shared secret:** `dev` (yjs-server `BACKEND_API_SECRET`, and the token mint in `spike.config.mjs`).
- All constants live in `spike.config.mjs`.

## Files

| Path                             | What                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `spike.config.mjs`               | shared constants + `mintSocketToken()` (mirrors `backend/app/services/yjs_socket_token_service.ts`)                         |
| `stub-server/index.mjs`          | ~180-line pure-Node REST stub (auth/me, workspaces, yjs-socket-token, files/signed-url + raw serving, permissive catch-all) |
| `scripts/seed.ts`                | folder → yDoc via `FilesystemSyncer` (`autoCreateCanvases:true`) → `{root,notes}` bundle → `POST /documents/:id/replace`    |
| `scripts/external-edit.ts`       | disk edit + live `FilesystemSyncer.syncChange` as a non-frontend (`execenv`) client                                         |
| `scripts/external-edit-test.mjs` | Playwright orchestrator for criterion (b): before-shot → run external-edit → assert DOM updates → after-shot                |
| `scripts/render-check.mjs`       | Playwright render assertion for criterion (a)                                                                               |
| `scripts/fidelity.ts`            | criterion (c): md→blocks→fragment→md round-trip + diff classifier                                                           |
| `fidelity-report.md`             | the fidelity verdict + per-file table + representative diffs                                                                |
| `test-folder/`                   | the sample vault (real repo markdown + 2 images, nested dirs)                                                               |
| `run.sh` / `cleanup.sh`          | bring the stack up / tear it down                                                                                           |
| `artifacts/`                     | screenshots, service logs, `fidelity-summary.json`                                                                          |

## How to run end-to-end

```bash
# from repo root
spike/cleanup.sh            # kill any prior spike services (safe if none)
spike/run.sh                # starts yjs-server:1999, stub:3334, seeds, frontend:5199

# criterion (a): render
( cd frontend && node ../spike/scripts/render-check.mjs )

# criterion (b): external edit propagates live
( cd spike && node scripts/external-edit-test.mjs )

# criterion (c): fidelity report
TSX=node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs
( cd spike && node "../$TSX" scripts/fidelity.ts )

spike/cleanup.sh            # tear down
```

Open the app yourself at `http://localhost:5199/app/w/4a7c1e9b2d6f4b3a9c1e000000000001`
after setting `localStorage['auth_token']` to any non-empty string (the stub
`/auth/me` accepts any bearer).

## Environment caveats (important for the supervisor / Step 1+)

This checkout's `node_modules` was in an **inconsistent, partially-installed state**
(the frontend ran against cloud on :5173, but `yjs-server/node_modules` was _empty_
and `shared/node_modules` was missing several deps; the pnpm store was also missing
frontend editor packages like `@blocknote/mantine`, `streamdown`). To run the stock
services I:

1. Ran **`pnpm install --frozen-lockfile`** — this only writes to (gitignored)
   `node_modules`; `pnpm-lock.yaml` was verified **unchanged** before/after.
2. Added a handful of **`node_modules` symlinks** so the tsx scripts resolve shared
   from `spike/`: `spike/node_modules/{ws,yjs,valtio-y,yaml,diff,@playwright}` and
   `shared/node_modules/valtio-y`. These are additive and reversible; they touch no
   product source or committed config.
3. Installed the Playwright browser matching v1.57 (`chromium_headless_shell-1200`).

**tsx invocation gotcha:** there is no per-package `tsx` bin. Scripts are run with
`node <repo>/node_modules/.pnpm/tsx@4.21.0/.../cli.mjs`. Shared is imported by
**relative dist path** (`../../shared/dist/server.js`), not the bare `shared`
specifier — importing through a `spike/node_modules/shared` symlink makes tsx resolve
shared's _internal_ `@blocknote` deps from the wrong (patched) variant and blows up on
`@handlewithcare/prosemirror-inputrules` "no exports main". Relative-path import fixes
the base location. (Details in the builder's report.)

**Frontend isolation:** the stock frontend is run with `vite --mode spike` reading an
untracked `frontend/.env.spike.local` (API→:3334, YJS→:1999). The user's default-mode
instance on :5173 is untouched. Base is `/app/` in non-dev modes (`vite.config.ts`),
hence the `/app/w/...` URL.
