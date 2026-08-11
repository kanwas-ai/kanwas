# Content-plane re-architecture: files own note content, the editor is the only writer

2026-08-10. Supersedes the patch-oriented `normalizer-defects-fix-plan.md` (deleted). Responds to the 2026-08-10 defect report (angle-bracket data loss, unsolicited write-back churn, exponential `\` growth, ghost sidecar after `git mv`) with an architecture change instead of guards, modeled on Tolaria (refactoringhq/tolaria): filesystem is the source of truth; the app writes a note file **only** on a user edit, from the editing surface, through one fidelity pipeline. **Patterns from Tolaria are fair game; its code is AGPL-3.0 — do NOT copy code from that repo. Implement from the specs below.**

## Verified root causes being eliminated (summary)

1. BlockNote's markdown **parse** drops inline HTML (`<topic>` deleted) and turns one hard break into TWO `\n` chars in block text; export writes each `\n` as a trailing-`\` line → doubling per round trip (measured 1→2→4→8). `normalizeBlockNoteMarkdown` (remark pass) is innocent — verified byte-stable.
2. The daemon's `FolderFlusher` re-serializes whole notes to disk on yDoc dirtiness that has no provenance (its own ingest, frontend mount normalization) — files the user never touched get rewritten; combined with (1), files grow unboundedly.
3. Suppression misses (non-atomic writes + `awaitWriteFinish:false` partial reads, `reingest` path) let the daemon re-parse its own output, closing the loop.
4. `writeMetadataYaml` mkdirs, and `ensureParentCanvas` mints fresh canvases from stale/racy event paths → `git mv` ghost sidecars.

## Target architecture (end of this plan)

```
DISK (source of truth)
  ▲ writes: ONLY (a) frontend user-edit autosave via PUT (atomic, suppressed, gated)
  │          (b) daemon structural ops: sidecars, byte-exact moves, trash, initial file
  │              for a UI-created node (empty content) — all byte-safe
  │ reads:  watcher → ingest md → fragment (live view in canvas; fidelity-preprocessed)
  ▼
yDoc = live in-session transport ONLY (canvas structure + live note view).
       Never a persistence source for existing note content.
```

- Frontend BlockNote stays fragment-bound for editing UX (collab provider, undo). What changes: on **local-origin** edits it serializes markdown through the fidelity pipeline and PUTs the body to the daemon; the daemon composes the file (frontmatter/sticky yaml), writes atomically, suppresses its own echo.
- The flusher **never rewrites an existing note file**. `markExternalContent`/`reingest` machinery is deleted, not fixed.
- Documented future step (out of scope): remove the fragment content plane entirely — frontend parses raw markdown per note, yjs keeps only canvas structure. This plan is a strict subset of that path.

Known accepted trade-offs: an in-flight debounce (~600 ms) window where disk lags the editor (Tolaria accepts the same); a first in-canvas edit of a file normalizes its formatting to our conventions (`-` bullets, `---`, tight lists) — untouched files keep exact bytes forever.

## Execution constraints (all missions)

- Branch `local-first`. **Never run `git commit`/`push`/`checkout`** — the user owns git. Read-only git (status/diff/log) is fine. End your report with suggested commit message(s).
- After editing `shared/src`, run `pnpm --filter shared build` before daemon/frontend typechecks or tests — they import `shared/dist`.
- Never start dev servers/services. Tests must be self-contained (vitest, temp dirs; `local-daemon/tests/folder-flusher.test.ts` shows the harness pattern).
- Verification commands: `cd local-daemon && pnpm typecheck && pnpm test` · `cd shared && pnpm build && pnpm test` · `cd frontend && pnpm typecheck` (frontend has vitest configured but no suite; don't build a test harness from scratch).
- Match surrounding code style; comments only for non-obvious constraints.

---

## Mission A1 — daemon: note-content save API (atomic, suppressed, conflict-guarded)

**Files:** `local-daemon/src/rest-server.ts`, `local-daemon/src/sync-orchestrator.ts` (+ small helpers; tests in `local-daemon/tests/`).

New endpoint `PUT /workspaces/:id/notes/:nodeId/content`, JSON body `{ body: string, baseHash?: string, force?: boolean }`. Wire it exactly like the existing upload route (`filesMatch` POST → mount's orchestrator; follow that auth/lookup pattern).

New `SyncOrchestrator.handleNoteSave({nodeId, body, baseHash, force})`, running on `this.enqueue(...)` (serialized with watcher events, like `handleUpload`):

1. Resolve `rel = this.pathMapper.getPathForNode(nodeId)`; unknown id → 404-shaped error result. Only `.md` and `.sticky.yaml` targets are valid; anything else → 422-shaped error.
2. Compose full file bytes from the body:
   - `.md`: `joinFrontmatter(this.frontmatter.get(nodeId), body)` (registry may be empty for UI-created nodes — body alone then).
   - `.sticky.yaml`: `yaml.stringify({ content: body, ...color/fontFamily })` with color/fontFamily read from the node's `xynode.data` in the live tree (same shape `FolderFlusher.buildContent` uses today — extract/share that composition logic rather than duplicating).
3. Conflict guard: read current disk bytes (ENOENT → treat as create). If `baseHash` is provided and differs from `sha256(diskBytes)` and `force` is not set → return conflict `{ status: 409, diskHash }`. No `baseHash` → write proceeds.
4. If composed bytes === disk bytes → no-op success (return current hash, no write, no suppression entry).
5. Atomic write: write to a temp file under `<folder>/.kanwas/tmp/` (create dir; `.kanwas` is already watcher-ignored) then `fs.rename` over the target. Call `this.suppression.registerWrite(rel, bytes)` BEFORE the rename. Update `this.fileHashes.set(rel, sha256(bytes))`.
6. Respond `{ hash, relPath }`.

Tests (temp-dir orchestrator harness): save writes file with frontmatter preserved from a prior ingest; sticky composition includes color; 409 on stale `baseHash`, `force:true` overrides; byte-identical save is a no-op; the write's watcher echo is consumed by suppression (assert via `suppression.consumeWrite` semantics or by asserting no sync events fire in a short settle window).

## Mission A2 — shared: markdown fidelity module (browser-safe) + import hardening

**Files:** new `shared/src/workspace/markdown-fidelity.ts` (+ export from the right index), edits to `shared/src/workspace/blocknote-conversion.ts` and `shared/src/workspace/markdown-normalization.ts`; tests + fixtures under `shared/src/workspace/`.

Hard requirement: the new module must be importable from the frontend — **pure functions over strings/JSON only; no `@blocknote/server-util`, no Node built-ins** (see the CLAUDE.md warning about shared→frontend imports). remark deps are fine (already browser-safe).

1. `escapeInlineHtmlForImport(md: string): string` — escape `<` as `\<` when followed by `[A-Za-z/!?]`, ONLY outside fenced code blocks and inline code spans (track fence state line-by-line and backtick spans in-line; never touch code). Idempotent: an already-escaped `\<` must not gain another backslash.
2. `collapseHardBreakRunsInBlocks(blocks: unknown[]): unknown[]` — walk BlockNote block JSON recursively; in inline `text` nodes, replace `/\n{2,}/g` with `'\n'`. Skip `codeBlock`-type blocks entirely (their text legitimately contains newlines).
3. `postProcessExportedMarkdown(md: string): string` — line-based post-pass over serializer output (clean-room implementation, spec only):
   - outside fenced code blocks: normalize `*`/`+` bullet markers to `-` (preserve indentation and ordered lists); normalize `***`/`___`/`* * *` thematic breaks to `---`; delete lines matching `/^\\+$/` (stray hard-break-only lines); collapse runs of 3+ blank lines to one; strip trailing blank lines; ensure exactly one trailing `\n`;
   - inside fences: bytes untouched.
4. Wire the import side in `markdownToInterlinkedBlocks` (blocknote-conversion.ts): apply `escapeInlineHtmlForImport` before `tryParseMarkdownToBlocks`, and `collapseHardBreakRunsInBlocks` on the parsed blocks before interlink conversion. Change `normalizeBlockNoteMarkdown`'s stringify options to `bullet: '-'` and add `rule: '-'` (update its early-return guard if needed).
5. Tests (shared vitest; server editor IS allowed in tests): unit tests per function (escape skips code spans/fences; collapse skips codeBlock; compact pass is idempotent), plus round-trip property tests using `createServerBlockNoteEditor` over fixtures that include the defect-report file shapes (`# /recall <query>`, `thinking/<topic>/<date>` prose, soft-wrapped paragraph, trailing-`\` hard break, `-` bullets, `---`, tables, nested lists, fenced code containing `<tags>` and `\`-lines):
   - `canonical(x) = postProcessExportedMarkdown(blocksToMarkdownLossy(parse(x)))` reaches a fixed point in one step: `canonical(canonical(x)) === canonical(x)`;
   - count of `/^\\$/m` lines never grows across 5 iterated passes;
   - `<query>`/`<topic>` survive a full round trip (as `\<query>` escaped form is acceptable);
   - code fence contents byte-identical.

## Mission A3 — frontend: user-edit autosave through the fidelity pipeline

**Files:** `frontend/src/components/canvas/nodes/BlockNoteNode.tsx`, `frontend/src/components/canvas/nodes/StickyNoteNode.tsx`, likely `frontend/src/lib/blocknote-collaboration.ts` (to expose the provider's remote-update origin), plus a new hook (e.g. `frontend/src/hooks/useNoteFileAutosave.ts`). Depends on A1 (endpoint) + A2 (shared exports; rebuild shared first).

Behavior spec:

1. **Local-edit detection.** Remote updates are applied with the provider's `docOrigin` (`shared/src/workspace/note-socketio-provider.ts:100`). Subscribe to the note doc: `doc.on('update', (u, origin) => ...)`; an update whose origin is NOT the provider's remote origin (and not any provider-internal bootstrap origin — inspect and log origins in dev to confirm) counts as local. UndoManager origins count as local.
2. **Arming.** The hook starts DISARMED. It arms on the first genuine user input inside the editor surface (keydown/beforeinput/paste/cut/drop, composition). Mount-time BlockNote normalization must never trigger a save — this preserves the "zero writes on render" invariant. Disarm again on unmount.
3. **Debounce.** Local edit while armed → schedule save at 600 ms trailing debounce, 3 s max-wait. Flush pending save on unmount and on editor blur.
4. **Serialize.** `blocks = editor.document` → `convertWorkspaceInterlinksToLinksInBlocks(blocks)` (already in `shared/workspace-interlink`) → `await editor.blocksToMarkdownLossy(...)` → `postProcessExportedMarkdown(...)` from A2.
5. **PUT** to `/workspaces/:wsId/notes/:nodeId/content` with `{ body, baseHash: lastKnownHash }` using the frontend's existing API client pattern (find how upload/flush endpoints are called). Store returned `hash` as `lastKnownHash` (per node id, in the hook).
6. **Conflict rule (simple v1).** On 409: if the editor currently has focus, retry once with `force: true` (active user wins); otherwise drop the save (disk wins; the daemon's ingest will refresh the fragment).
7. Sticky notes: same hook against the sticky fragment; body is the serialized markdown content (daemon composes the yaml).
8. Keep the change minimal and localized — do not refactor the editor components beyond wiring the hook. `cd frontend && pnpm typecheck` must pass; add a vitest unit test for the debounce/arming logic only if it needs no new harness infrastructure.

## Mission A4 — daemon: retire the content flusher; fix rename ghosts

**Files:** `local-daemon/src/folder-flusher.ts`, `local-daemon/src/sync-orchestrator.ts`, `local-daemon/src/metadata-manager.ts`, `local-daemon/src/filesystem.ts`, `shared/src/workspace/filesystem-syncer.ts`; tests `local-daemon/tests/folder-flusher.test.ts` + a new rename integration test. Run after A1/A2 land (same files as A1 in sync-orchestrator).

### A4.1 Flusher: never rewrite an existing note file

In `reconcileNodeFile`:

- **New node** (`existingRel === undefined`): keep the current create path (serialize initial content — a just-created note's fragment is empty/trivial; this keeps `adopt.ts`'s prune-nodes-without-files boot invariant safe). Route the initial write through the same atomic tmp+rename pattern as A1.
- **Existing node**: never write content. Keep only the byte-exact move (`moveByteExact`) when the path changed. Delete the `dirtyContent` serialization branch.
- Delete now-dead machinery: `markExternalContent`/`externalContentNotes` (and its call site in `sync-orchestrator.ts` `applyChange`), `writeGuardedNodeContent`'s divergence/`reingest` logic (`FlusherSource.reingest` goes away; keep `lastSyncedHash`/`recordSyncedHash` only where moves/uploads need them), `fragmentRetryCounts` except for the new-node initial write.
- `noteChanged` stays as a signal but existing-node content dirtiness no longer causes writes.
- Update `folder-flusher.test.ts` to the new contract; add: a note that receives fragment updates (simulating ingest/frontend normalization) is NEVER rewritten on disk (`fileWriteCount` stays 0); a UI rename of a note with unsaved-on-disk external bytes moves the file byte-exactly.

### A4.2 Rename/ghost fixes (defect 4)

- `writeMetadataYaml` (`local-daemon/src/filesystem.ts`): add a `createDir` option, default **false**: when the directory is missing, skip the write and return a "skipped" signal. `MetadataManager.refreshCanvasMetadata` uses the no-mkdir path (skip + warn). The flusher's structural reconcile (step 1) and boot `materializeMissing` pass `createDir: true` — those are the only places allowed to create directories.
- `FilesystemSyncerOptions` (shared): add optional `directoryExists?: (relPath: string) => boolean`. In `ensureParentCanvas` and `syncCanvas`'s create arm: when provided and the directory is absent on disk, return `no_op` with a warn instead of `createCanvas`. Daemon supplies an `fs.existsSync`-based impl. Rebuild shared.
- Integration test (real fs, temp dir): populate `thinking/` with `.md` files + sidecar; boot the orchestrator; `fs.rename('thinking' → 'workbench')`; settle ≥ 2 s; assert old path absent on disk, `workbench/metadata.yaml` keeps the ORIGINAL canvas id, exactly one canvas with that name in the tree, node ids preserved.

## Mission A5 — end-to-end regression suite (after A1–A4)

New `local-daemon/tests/content-plane.test.ts` (or extend existing):

1. **Idle soak:** mount a fixture folder containing every defect trigger (see A2 fixture list); simulate ingest + repeated fragment churn (mount-normalization-like updates via remote-origin transactions) across multiple flush/save cycles; assert ZERO writes to any `.md` (byte-compare the whole tree before/after).
2. **Round-trip growth:** ingest a file with a trailing-`\` hard break, simulate a user-edit save via `handleNoteSave` with the A2 pipeline output, re-ingest, repeat ×5 → `grep -c '^\\$'` never grows; `<topic>` tokens still present.
3. **External-edit-wins:** while a save with a stale `baseHash` is attempted without focus-force, disk bytes survive.
4. **git-mv ghost** (from A4.2 if not already there).

## Acceptance criteria (vs. the defect report)

- Opening/rendering a folder produces zero `.md` writes; the soak test proves it.
- `serialize∘parse` is a one-step fixed point on our own output; `^\\$` counts never grow (property tests).
- `<topic>` prose survives untouched files byte-identically (never written) and survives edited files content-identically (may gain `\<` escape).
- An externally-modified file is never overwritten by a stale editor buffer (409 + focus rule).
- `git mv` leaves no artifact at the old path; canvas node id preserved.
- Formatting convention on files the user edits: `-` bullets, `---` rules, tight lists, no trailing-`\` lines, no entity junk — Obsidian-compatible.
