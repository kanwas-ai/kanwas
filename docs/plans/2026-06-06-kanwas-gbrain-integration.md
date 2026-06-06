# Kanwas ↔ GBrain Integration Handoff Plan

> **For Hermes:** Use this document as the fresh-session context pack for starting the Kanwas ↔ GBrain integration. If executing, load the appropriate DS/gbrain/code skills, inspect the live repo state first, and keep external/root/push actions approval-gated.

**Date:** 2026-06-06
**Repo:** `/srv/hermes/users/ds/apps/kanwas/upstream`
**Current branch state when written:** `master...origin/master [ahead 2]`
**Goal:** Make self-hosted Kanwas usable as a visual workbench for DS GBrain while keeping GBrain as the canonical source of truth.

---

## 1. Executive recommendation

Implement this as a **decoupled integration**, not as direct GBrain repo sync.

- **GBrain role:** canonical, reviewed, provenance-preserving knowledge base.
- **Kanwas role:** exploratory visual workspace for search, import, synthesis, and draft restructuring.
- **Write boundary:** Kanwas must not directly write to GBrain. Any write-intent should become a **Promotion Packet** routed to `ds-brain`/GBrain tooling for review.
- **MVP:** Read-only GBrain search/read/import into Kanwas, plus metadata that records canonical path/provenance/status.
- **Defer:** Bidirectional filesystem sync and automatic canonical writeback until read-only workflow is useful and stable.

This preserves DS knowledge quality while still making Kanwas valuable as a visual thinking layer.

---

## 2. Evidence from prior repo inspection

Useful existing integration points:

- `backend/start/routes.ts`
  - Authenticated, workspace-scoped route groups already exist.
  - New GBrain routes should live under the authenticated workspace group and reuse `middleware.organizationAccess()`.
- `backend/app/services/workspace_document_service.ts`
  - Existing backend service pattern for reading/updating workspace documents.
- `backend/libs/agent/flows/main_agent_base.ts`
  - Agent tools are assembled centrally; later phase can add read-only GBrain tools.
- `shared/src/workspace/content-converter.ts` and `shared/src/workspace/converter.ts`
  - Markdown ↔ workspace/BlockNote conversion primitives already exist and are a good basis for importing GBrain Markdown pages.
- `frontend/src/lib/blocknote-import.ts`
  - Frontend already parses imported Markdown/HTML/text into BlockNote blocks.
- `frontend/src/api/client.ts`
  - Frontend uses Tuyau-generated typed API client against backend routes.
- `frontend/src/components/search/SearchModal.tsx`
  - Existing UX pattern for search results; likely reusable for a GBrain search/import modal.
- `execenv/src/sync-manager.ts`
  - Kanwas has filesystem sync logic, but this should be treated as a later/controlled phase, not the MVP path.

Known operational caveat:

- In the ds-default runtime, direct `gbrain-shared search "Kanwas"` was not configured for this profile. Treat GBrain access as a boundary to be solved via a controlled backend adapter, `ds-brain` service/API, or explicitly configured read-only CLI lane — not via browser/client direct repo access.

---

## 3. Architecture

### Phase 1 — Read-only GBrain Lens (MVP)

Build a backend adapter that exposes read-only GBrain search/read to Kanwas.

Proposed API surface:

- `GET /workspaces/:id/gbrain/search?q=...&limit=...`
  - Returns `path`, `title`, `snippet`, optional `updatedAt`, `sourceType`, `score`.
- `GET /workspaces/:id/gbrain/pages/*path` or `POST /workspaces/:id/gbrain/page`
  - Reads one canonical Markdown page by path.
  - Use POST if wildcard/path encoding is awkward.
- Optional MVP endpoint: `POST /workspaces/:id/gbrain/import`
  - Reads page + returns a Kanwas-ready import payload, or performs workspace insertion only if it cleanly fits existing workspace APIs.

Backend implementation approach:

- Create a service such as `backend/app/services/gbrain_service.ts`.
- Create a controller such as `backend/app/controllers/gbrain_controller.ts`.
- Create validators in `backend/app/validators/gbrain.ts`.
- Prefer a provider interface so local dev can use a fixture/mock while DS self-host can use `ds-brain`/GBrain CLI/API.
- Do not expose raw repo paths, private filesystem paths, or write credentials to the frontend.

Suggested result types:

```ts
type GbrainSearchResult = {
  path: string
  title: string
  snippet: string
  score?: number
  sourceType?: 'shared' | 'private' | 'unknown'
  updatedAt?: string
}

type GbrainPage = {
  path: string
  title: string
  markdown: string
  sourceType?: 'shared' | 'private' | 'unknown'
  updatedAt?: string
}
```

### Phase 2 — Import into Kanwas workspace

Add UI to search GBrain and import selected pages into the current canvas/workspace.

Minimal UX:

- Reuse search modal patterns from `frontend/src/components/search/SearchModal.tsx`.
- Add a dedicated “GBrain Import” entry point via command/search UI, sidebar action, or chat slash command — choose the smallest integration surface after inspecting current UI conventions.
- Imported nodes should include provenance/status metadata, for example:
  - `gbrain.path`
  - `gbrain.sourceType`
  - `gbrain.status = imported | draft | promotion_pending | promoted | stale`
  - `gbrain.importedAt`
- Parse Markdown into BlockNote blocks using `frontend/src/lib/blocknote-import.ts` or shared conversion utilities.
- Preserve canonical page path visibly enough that users can trace the source.

### Phase 3 — Promotion Packet (write-intent, not direct write)

When a Kanwas node or canvas synthesis should become GBrain knowledge, generate a review packet rather than writing to GBrain directly.

Packet shape:

```json
{
  "version": "kanwas-gbrain-promotion/v1",
  "workspaceId": "...",
  "canvasId": "...",
  "sourceNodes": [{ "nodeId": "...", "gbrainPath": "concepts/example.md", "status": "imported" }],
  "targetPathSuggestion": "concepts/example.md",
  "proposedMarkdown": "...",
  "rationale": "Why this should become or update canonical GBrain knowledge",
  "provenance": ["canonical paths / source URLs / node IDs"],
  "createdAt": "ISO-8601"
}
```

MVP can stop at generating/exporting the packet locally or showing it in UI. Actual submission to `ds-brain` requires an approved adapter/API and review workflow.

### Phase 4 — Agent tools and controlled sync

After Phase 1/2 is stable:

- Add read-only agent tools in `backend/libs/agent/...`:
  - `gbrain_search`
  - `gbrain_read_page`
  - `gbrain_make_promotion_packet`
- Only then consider controlled filesystem sync from `execenv/src/sync-manager.ts` patterns.
- Bidirectional canonical sync remains deferred until explicit DS approval.

---

## 4. Implementation tasks for a fresh session

### Task 0 — Baseline and branch hygiene

**Objective:** Start from a known repo state without losing prior local work.

**Steps:**

1. Run `git status --short --branch` in `/srv/hermes/users/ds/apps/kanwas/upstream`.
2. If there are uncommitted changes, inspect them before editing.
3. Work on a feature branch such as `ds/gbrain-lens-mvp` unless the user explicitly wants to stay on `master`.
4. Do not push to remote without user approval.

**Verify:** transcript includes branch/status before edits.

### Task 1 — Add backend read-only GBrain adapter

**Objective:** Create a testable service boundary for read-only GBrain search/page read.

**Likely files:**

- Create: `backend/app/services/gbrain_service.ts`
- Create: `backend/app/validators/gbrain.ts`
- Create: `backend/tests/functional/gbrain_controller.spec.ts` or nearest matching test location

**Implementation notes:**

- Define a small provider interface: search and readPage.
- Use environment/config for provider mode if appropriate, but keep MVP simple.
- Provide a fixture/mock provider for tests and local development if live GBrain access is unavailable.
- Sanitize queries and page paths; avoid shell interpolation with user input unless safely escaped.
- Return stable JSON shape; do not leak local filesystem paths.

**Verify:** backend tests or at minimum service-level tests prove search/read success and invalid path/query handling.

### Task 2 — Add authenticated workspace routes

**Objective:** Expose GBrain search/read under authenticated workspace scope.

**Likely files:**

- Modify: `backend/start/routes.ts`
- Create: `backend/app/controllers/gbrain_controller.ts`
- Modify or generate API types if the project requires `pnpm --filter backend run codegen`

**Route placement:** inside the authenticated `/workspaces/:id/...` group protected by `middleware.organizationAccess()`.

**Verify:** run route/controller tests and surface command output.

### Task 3 — Add frontend GBrain search/import client and UI

**Objective:** Let a user search GBrain from the current workspace and import a page into Kanwas.

**Likely files to inspect/modify:**

- `frontend/src/api/client.ts`
- `frontend/src/components/search/SearchModal.tsx`
- `frontend/src/components/chat/commands.ts` or nearby command-entry files
- `frontend/src/providers/workspace/*`
- `frontend/src/lib/blocknote-import.ts`
- Existing canvas/node creation helpers discovered during inspection

**Implementation notes:**

- Use Tuyau routes if codegen supports the new backend routes; otherwise add a narrow typed fetch wrapper consistent with existing client patterns.
- Keep UI minimal: search, preview snippet/path, import button.
- On import, convert Markdown to blocks and add a note/node to the active canvas using existing workspace insertion conventions.
- Store GBrain provenance/status metadata on the imported item in the least invasive way supported by current workspace types.

**Verify:** frontend test/typecheck/lint where feasible; if UI e2e is too heavy, perform a manual local smoke through the dev server and report exactly what was/was not verified.

### Task 4 — Add Promotion Packet skeleton only if Phase 1/2 is stable

**Objective:** Prepare safe write-intent without canonical writeback.

**Likely files:**

- Add frontend/backend helper for `kanwas-gbrain-promotion/v1` packet shape.
- Add UI action only if it can be implemented without scope explosion.

**Constraints:**

- Do not call `ds-brain` write APIs unless explicitly approved and API contract is confirmed.
- Do not write directly to `/srv/hermes/gbrain/...` from Kanwas.

**Verify:** unit test packet construction and provenance fields.

### Task 5 — Agent tools only after user-facing MVP works

**Objective:** Allow Kanwas agent to search/read GBrain safely.

**Likely files:**

- `backend/libs/agent/flows/main_agent_base.ts`
- `backend/libs/agent/tools/*` or nearest matching tool registry

**Constraints:**

- Read-only tools first.
- Promotion tool should only create packet/draft, not canonical writes.

---

## 5. Acceptance criteria

MVP is done when:

1. Authenticated workspace users can search configured GBrain content from Kanwas.
2. Users can read/preview a selected canonical page.
3. Users can import a selected page into the active Kanwas workspace/canvas as editable content.
4. Imported content carries visible or inspectable provenance: canonical path, status, import timestamp.
5. Browser/client never receives GBrain repo write credentials or raw server filesystem details.
6. Tests/typecheck/lint relevant to changed backend/frontend/shared code pass, or skipped checks are explicitly justified.
7. Final report states changed files, verification evidence, remaining risks, and whether remote push/restart/live deployment was not performed.

---

## 6. Stop / approval rules

Stop and ask before:

- Directly writing to GBrain canonical repos.
- Pushing to remote, opening upstream PRs, or deploying/restarting services.
- Performing root/systemd/nginx changes.
- Adding broad dependencies or changing auth/session architecture.
- Expanding scope into full bidirectional sync.
- Handling private GBrain content in a way that could expose it to an unintended workspace/user.

---

## 7. Verification commands to discover/run

Start with these, adjusting if the repo reveals a better command:

```bash
pnpm --filter backend run typecheck
pnpm --filter backend run test
pnpm --filter frontend run typecheck
pnpm --filter frontend run test
pnpm --filter frontend run lint
pnpm --filter shared run build
```

If dependencies are missing or tests are expensive/flaky, record the blocker and run the narrowest meaningful alternative.

---

## 8. Copy-paste `/goal` prompt for a fresh session

```text
/goal
GOAL: Implement the Phase 1/2 Kanwas ↔ GBrain MVP from `docs/plans/2026-06-06-kanwas-gbrain-integration.md`: read-only GBrain search/read plus import into the current Kanwas workspace/canvas with provenance metadata, without direct canonical GBrain writes.

CONTEXT:
- Repo: `/srv/hermes/users/ds/apps/kanwas/upstream`.
- Start by reading `docs/plans/2026-06-06-kanwas-gbrain-integration.md` and inspecting the live repo state.
- Prior recommendation: GBrain remains source of truth; Kanwas is a visual workbench. Writes must become Promotion Packets for ds-brain review, not direct repo writes.
- Relevant likely files: `backend/start/routes.ts`, `backend/app/services/workspace_document_service.ts`, `backend/libs/agent/flows/main_agent_base.ts`, `shared/src/workspace/content-converter.ts`, `shared/src/workspace/converter.ts`, `frontend/src/lib/blocknote-import.ts`, `frontend/src/api/client.ts`, `frontend/src/components/search/SearchModal.tsx`.
- Known caveat: ds-default may not have direct GBrain CLI configured; use a backend adapter boundary and a fixture/mock provider if live GBrain access is unavailable.

CONSTRAINTS:
- Do not write directly to GBrain canonical repos.
- Do not push, deploy, restart services, change root/system config, or perform external/upstream actions without explicit user approval.
- Keep upstream Kanwas changes surgical and no-fork friendly.
- Browser/client must not receive GBrain write credentials or raw server filesystem paths.
- Prefer read-only search/read/import first; Promotion Packet and agent tools are secondary only if MVP remains low-risk.

PLAN:
- Run `git status --short --branch`; preserve existing local work and create/use a local feature branch if safe.
- Implement a backend GBrain service/controller/validator with read-only `search` and `readPage` behavior, using a provider interface and safe mock/fixture fallback if needed.
- Add authenticated workspace-scoped routes under the existing `middleware.organizationAccess()` group.
- Add frontend search/import path using existing API/client/UI conventions and Markdown → BlockNote conversion helpers.
- Attach provenance/status metadata to imported content with the least invasive schema change.
- Add tests or narrow verification around service/controller/import behavior.

DONE WHEN:
- A user can search GBrain, preview/read a page, and import it into Kanwas as editable workspace/canvas content in the local self-host app or a clearly documented local/test path.
- Imported content preserves canonical path/source/status/import timestamp metadata.
- The implementation avoids direct GBrain writes and avoids exposing privileged paths/credentials.
- Relevant tests/typecheck/lint have been run, or any skipped verification is explicitly explained.

VERIFY:
- Surface actual command outputs in the transcript for the checks run, prioritizing: `pnpm --filter backend run typecheck`, backend tests for new routes/services, `pnpm --filter frontend run typecheck`, frontend tests/lint, and `pnpm --filter shared run build` if shared code changes.
- If running the app, provide the exact local URL/smoke path and observed result.
- Include final `git status --short --branch` and changed file list.

STOP RULES:
- Stop before direct canonical GBrain writes, bidirectional sync, push/deploy/restart/root action, auth architecture changes, or broad dependency additions.
- Stop if GBrain API/CLI access is unavailable and a mock would no longer prove the user-facing path.
- Stop after 20 autonomous turns or when the MVP is verified; do not expand into Phase 3/4 unless explicitly approved.

OUTPUT:
- Concise Korean final report with: status, changed files, verification evidence, skipped/deferred checks, remaining risks, and the single highest-value next action.
```

---

## 9. Suggested first implementation cut

If time is limited, do not start with agent tools. Start with:

1. Backend service/controller/routes with mockable read-only provider.
2. Frontend GBrain search/import UI using existing import conversion helpers.
3. Metadata/provenance on imported nodes.
4. Tests/typechecks.

This cut is most likely to produce visible user value without compromising GBrain canonical quality.
