# kanwasd — whole-task verification sweep

**Date:** 2026-07-03 · **Branch:** `local-first` · **Scope:** re-run the existing
check suites against the current code and map every §4 exit criterion (from
`plan/local-first-core-build.md`) to PASS/FAIL + evidence. This is a _sweep_ of
the shipped suites — no new product code — plus the AGENTS.md seeder wiring and
the real-Claude-Code demo added in this final step.

**How it was run.** One `kanwasd` at a time on `--port 4300 --yjs-port 1999`; the
stock frontend on Vite `--mode localdaemon --port 5273` (the user's own
`:5173` / `:5273` are never touched). Each mutating check got its own fresh copy
of `spike/test-folder` (kept pristine). Screenshots and JSON/console results land
in `spike/artifacts/`; per-package build/test logs in `spike/artifacts/verify-*.log`.

## §4 exit criteria → result

| #   | §4 exit criterion                                                                                | Check(s)                                                                                                                     | Result   | Evidence (`spike/artifacts/…` unless noted)                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Empty folder renders                                                                             | `render-check` on an empty folder (daemon seeds `AGENTS.md`)                                                                 | **PASS** | `verify-empty.png` — 1 node ("Working in a Kanwas folder")                                                                                                                               |
| 1b  | Existing **messy** folder (`.git`, `node_modules/`, `.DS_Store`, dotfiles, stray `.txt`) renders | `render-check` on a `git`-initialised test-folder copy + stray files                                                         | **PASS** | `verify-messy.png` — 6 nodes (media/reference/writing canvases + expedition-notes, readme, `scratch-note.txt`); `.git`/`node_modules`/`.DS_Store`/dotfiles correctly skipped             |
| 1c  | No file ever wiped or lost on adoption                                                           | sha256 of every content file **before vs after** adoption of the messy folder                                                | **PASS** | `scratch logs/messy-before.sha` == `messy-after.sha` ("NON-DESTRUCTIVE: all content-file checksums identical")                                                                           |
| 2a  | Edit in the UI → `.md` on disk updates (debounce window)                                         | `flush-check` #1                                                                                                             | **PASS** | `step2b-1-type.png`, `step2b-flush-results.json` (marker landed on disk)                                                                                                                 |
| 2b  | Frontmatter survives a UI body edit byte-for-byte                                                | `flush-check` #2                                                                                                             | **PASS** | `step2b-frontmatter-before.txt` == `-after.txt` ("fm identical")                                                                                                                         |
| 2c  | Edit on disk → UI updates live (external edit, new file, delete, new nested canvas)              | `live-sync-check` A/B/C/D                                                                                                    | **PASS** | `step2a-live-A-edit.png`, `step2a-live-D-nested.png`, `step2a-live-results.json`                                                                                                         |
| 2d  | Open **clean** note reloads from disk; **dirty** buffer wins (LWW, no dup nodes, no crash)       | `live-sync-check` A (clean remount) + `flush-check` #8 (same-file race)                                                      | **PASS** | `step2b-8-convergence.png` ("nodes 6→6, bothLand=true")                                                                                                                                  |
| 2e  | Rapid UI edits → **bounded** writes, no watcher feedback loop                                    | `flush-check` #7 echo-storm                                                                                                  | **PASS** | 64 keystrokes → 8 writes, quiet-window writes = 0 (`step2b-7-storm.png`)                                                                                                                 |
| 3   | Kill daemon mid-edit (**SIGKILL**), restart → no loss beyond debounce; layout intact             | `restart-check` (PHASE=edit → `kill -9` → restart → PHASE=verify)                                                            | **PASS** | `step2b-9-before-restart.png`, `-after-restart.png`, `step2b-restart-results.json` — typed text renders, created note keeps **same id**, id set identical (7 nodes), positions identical |
| 4   | `git checkout` across branches → no destroyed layout, no duplicated node identities              | `git-storm-check` (alpha↔beta ×4)                                                                                           | **PASS** | `step2c-4-git-storm.png`, `step2c-git-storm-results.json` — converges each checkout, ids/positions stable, 5/5 nodes, dup-free, bounded writes (2/checkout), clean tree                  |
| 5   | A CLI agent (**Claude Code**) editing files → live canvas updates, no Kanwas-specific tooling    | **THE DEMO** — real `claude -p` created `launch/` + 3 notes; canvas followed; reverse UI edit read back by a 2nd `claude -p` | **PASS** | `final-0-seeded-agents.png`, `final-1-launch-canvas.png`, `final-2-checklist.png`, `final-3-ui-edit.png`, `final-demo-results.json`, `final-reverse-results.json`                        |

## Supporting suites (2A/2B/2C coverage beyond the §4 five)

| Area                               | Check                | Result   | Evidence                                                                                                                                                                                 |
| ---------------------------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI create / drag / rename / delete | `ui-ops-check`       | **PASS** | create doc+`.sticky.yaml`+text+link; drag → 1 debounced metadata write; rename → file moved, **id stable**; delete → `.kanwas/trash/` (`step2b-3..6-*.png`, `step2b-uiops-results.json`) |
| Editor atomic-save identity        | `atomic-check`       | **PASS** | delete+recreate (300 ms, 900 ms) and write-tmp+rename all keep id/edge/position, content updates, single node (`step2c-3-atomic.png`, `step2c-atomic-results.json`)                      |
| Media rendering                    | `media-canvas-check` | **PASS** | images served via `/files/raw` static route (`step2a-media-canvas.png`)                                                                                                                  |
| Uploads (image/file/audio)         | `upload-check`       | **PASS** | each upload → exactly one node, bytes on disk, renders (`step2c-1-uploads.png`, `step2c-upload-results.json`)                                                                            |
| Binary node ops                    | `binary-check`       | **PASS** | rename → file moved (bytes preserved, id stable); external replace → contentHash refresh; delete → trash (`step2c-2-binary-ops.png`, `step2c-binary-results.json`)                       |

## Unit tests / typecheck / build (all packages)

Run package-by-package; logs in `spike/artifacts/verify-<pkg>-<step>.log`.

| Package      | Typecheck | Build | Unit tests                | Notes                                                                                              |
| ------------ | --------- | ----- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| shared       | PASS      | PASS  | PASS (326 pass, 12 skip)  | 1 integration suite needs a running backend (`localhost:3333`) → infra-blocked, not a code failure |
| yjs-server   | PASS      | PASS  | PASS (101)                | benign Yjs client-id warnings only                                                                 |
| execenv      | PASS      | PASS  | PASS (37 non-integration) | 11 integration suites blocked by absent backend (`localhost:3333`) → infra                         |
| local-daemon | PASS      | PASS  | PASS (36)                 | adoption, flusher, frontmatter, name-match, multipart                                              |
| backend      | PASS      | PASS  | SKIPPED-NEEDS-INFRA       | boot needs Postgres:5432 / Redis:6379 (Docker intentionally not started)                           |
| frontend     | PASS      | PASS  | PASS (272)                | strict `typecheck:all` also clean                                                                  |

Docker was **not** started (constraint). The only non-passing tests are DB/backend
integration suites blocked purely by absent infra — no code defects.

## Surprise found during the demo (and the doc fix it drove)

Real Claude Code, after creating `launch/checklist.md` with `- [ ]` items, reported
that the daemon reformatted the body bullets `-` → `*` on the first write and
re-wrote the file to restore its syntax. Investigation:

- **UI edits deterministically re-serialize the note body** in BlockNote's
  canonical markdown (bullets `-` → `*`, spacing normalized). Confirmed live: the
  reverse-direction test shows `announcement.md`'s Highlights bullets change from
  `-` to `*` after a canvas edit, while **frontmatter stays byte-identical**.
- **External creates/edits are normally echo-suppressed** (no re-serialization):
  four controlled repros (root bullet list, root task list, new-subdir task list,
  a tight 4-file burst into a new dir) all round-tripped `-` bullets untouched.
  The `-` → `*` Claude hit on _create_ was a **rare race** during a rapid
  multi-file create-burst into a brand-new canvas (coarse whole-canvas reconcile
  firing before the disk-content suppression registered), not the common path.

This contradicted the first draft of `templates/AGENTS.md`, which implied bodies
were left alone. **Fixed:** AGENTS.md now states frontmatter is byte-preserved but
the note _body_ may be cosmetically normalized on a UI edit, and advises agents to
prefer semantic checks over exact-byte comparison of note bodies.

## Reproduce

```bash
# build (shared → yjs-server → local-daemon)
pnpm --filter shared build && pnpm --filter kanwas-yjs-server build && pnpm --filter local-daemon build
# unit tests
pnpm --filter local-daemon test
# a browser check (daemon on 4300/1999, stock frontend on 5273):
node local-daemon/dist/index.js --folder <copy-of-spike/test-folder> --port 4300 --yjs-port 1999 &
( cd frontend && ./node_modules/.bin/vite --mode localdaemon --port 5273 --strictPort & )
WS_URL_ID=$(node -e "console.log(require('<folder>/.kanwas/workspace.json'.replace(/^/,''))...)")  # = workspaceId without hyphens
FE_PORT=5273 WS_URL_ID=<id> WS_DIR=<folder> ARTIFACTS=spike/artifacts \
  node local-daemon/scripts/flush-check.mjs   # (or live-sync/ui-ops/restart/git-storm/atomic/upload/binary)
```
