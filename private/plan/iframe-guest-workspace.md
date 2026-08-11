# Iframe Guest Workspace Bootstrap

## Goal and scope

- Allow the app to be loaded inside an iframe without user registration.
- Add a special frontend entry route `/embed` (deployed under the app base path; e.g. `/app/embed` in production) that:
  - calls a backend bootstrap API to create a user + workspace with no user input
  - optionally clones from a template workspace provided via query string
  - redirects in-app to the created workspace (`/w/:workspaceId`).
- Add backend test coverage for the bootstrap + template cloning behavior.

## Current understanding (repo + decisions)

- Backend (AdonisJS):
  - Auth uses bearer access tokens (`Authorization: Bearer <token>`).
  - Workspace creation is centralized in `WorkspaceService.createWorkspaceForUser()` and stores the Yjs binary in `workspaces.document`.
  - Workspace duplication already works by copying the Yjs binary (`workspace.document = sourceWorkspace.document`).
- Frontend (React):
  - Auth token is stored in `localStorage` under `auth_token` and mirrored into the API client via `setAuthToken()`.
  - Routes under `ProtectedRoute` require `state.isAuthenticated`.
  - In non-dev builds the SPA is served under `/app/` (Vite `base`); React Router sets `basename` from `import.meta.env.BASE_URL`.

Decisions from user:

- Frontend iframe entry route path: `/embed`.
- Templates: query param will pass a template _workspace UUID_ directly (no slug mapping).
- Embedding restrictions/headers: out of scope for now (embed environment is isolated).
- Backwards compatibility: high (additive changes; do not break existing auth/workspace flows).
- Token storage collision risk: make the auth token localStorage key configurable via a frontend env var.

## Constraints and assumptions

- Guest users must still have a unique `users.email` (DB constraint). We can set a random password value (it is not user-facing).
- Embed frontend/backend run in a separate environment/deployment, but we still support a configurable token key to avoid collisions in local dev or shared-origin setups.
- Template cloning means copying `workspaces.document` bytes from a pre-created template workspace into the new workspace.
- Embed security hardening (CSP/XFO, Origin allowlists, rate limiting) is intentionally deferred because this runs in a separate environment.

## Non-goals / out of scope

- Partner/third-party embeds with per-origin allowlists beyond same-origin.
- A full “template registry” UI/admin table (unless we later choose DB-backed templates).
- Guest account upgrade/merge flows.

## Options and recommendation

- Option A: Single backend bootstrap endpoint that creates user + workspace and returns token + workspace (recommended).
  - Pros: one roundtrip, simple FE flow, minimal touch to existing auth.
  - Cons: introduces an unauthenticated token-minting endpoint; acceptable for the isolated embed environment.
- Option B: FE generates creds and calls existing `/auth/register` (not recommended).
  - Cons: awkward, couples embed to email/password validators, and still needs workspace template support.

Recommendation: implement Option A with a dedicated backend route (e.g. `POST /embed/bootstrap`) and a dedicated FE page at `/embed`.

## Step-by-step plan (high-level)

### Backend

1. Add a new unauthenticated route (additive)

- Add `POST /embed/bootstrap` outside the authenticated routes group.
- Response should include:
  - token fields at top-level for consistency with existing auth endpoints: `{ type: 'bearer', value: string, workspaceId: string }`.
  - Optionally also include `workspace` (id, name, timestamps) if the frontend wants it.
- After adding the route, regenerate Tuyau types (`pnpm codegen`) so `frontend/src/api/client.ts` can call it.

2. Implement bootstrap controller logic

- Create a new controller (e.g. `EmbedsController.bootstrap`).
- Validate request payload (e.g. `{ templateId?: string }`).
- In a DB transaction:
  - Create a new “guest” user with a random unique email and a random password.
  - Create workspace:
    - Always create the workspace via `WorkspaceService.createWorkspaceForUser(user.id, <name>, trx)` to ensure membership/ownership wiring stays consistent.
    - If `templateId` is present: load template workspace by id and overwrite the newly created workspace's `document` with the template `document` bytes (within the same transaction).
- After the transaction commits, mint a bearer token via `User.accessTokens.create(user)`.
- (Optional hardening) Accept both hyphenated UUID and 32-char URL UUID for `templateId` by normalizing server-side.

3. Backend tests

- Add functional tests that:
  - No template: calling `POST /embed/bootstrap` returns a token and a workspace; using the token can call `GET /workspaces` and see the created workspace.
  - Template: create a template workspace in test DB; call bootstrap with `templateId`; assert the created workspace `document` bytes equal the template’s `document`.
  - Template not found: requesting an unknown `templateId` returns 404.

### Frontend

1. Add a public route `/embed`

- In `frontend/src/App.tsx`, add a route for `/embed` that is NOT wrapped in `ProtectedRoute`.
- Note: in production the external URL will be under the app base path (e.g. `/app/embed`), but the route path stays `/embed` inside the router basename.

2. Implement `EmbedBootstrap` page

- Parse query param `template`.
- Normalize template UUID:
  - If it’s a 32-char “URL UUID” without hyphens, convert to DB UUID format before sending to backend.
- Call backend `POST /embed/bootstrap`.
- On success:
  - Use the new auth helper from `AuthProvider` to set the token (updates in-memory auth state + persists under the configured localStorage key + updates the API auth header).
  - Redirect with `navigate(`/w/${toUrlUuid(workspace.id)}`, { replace: true })`.
- Show a simple loading + error state.

3. Make the auth token storage key configurable

- Add a Vite env var (e.g. `VITE_AUTH_TOKEN_KEY`) with default `auth_token`.
- Update `AuthProvider` to use this key for load/save/remove.
- Add a small shared helper in `AuthProvider` (or context method) for “set token programmatically” so `/embed` can authenticate without duplicating auth logic.

## Risks and edge cases

- Embed security hardening is deferred; if this environment becomes public or shared, revisit CORS/Origin checks and rate limiting.
- Template ID leakage: if templates live in a shared environment with real user workspaces, accepting arbitrary workspace IDs can become a data leak; revisit if this stops being isolated.
- UUID formatting mismatch (hyphenated DB UUID vs URL UUID): normalize on FE and/or BE.
- React StrictMode double-invokes effects in dev: guard bootstrap call to avoid duplicate creation.
- LocalStorage key collisions across deployments: mitigated via `VITE_AUTH_TOKEN_KEY` (works well when embed is deployed separately; if both modes ship in one build, consider route-based namespacing instead).

## Open questions

- Workspace naming: should the created workspace name be fixed (e.g. “Embedded”), derived from template name, or passed in?

## Validation and acceptance criteria

- Loading `/embed` with no query params creates a new user + workspace and lands in the workspace UI without visiting login/register.
- Loading `/embed?template=<templateWorkspaceId>` creates a new workspace whose Yjs binary matches the template workspace’s stored `document`.
- Backend functional tests cover both paths (blank + template) and failure cases.
- Iframe embed works in the intended embed environment.
- Refreshing after bootstrap stays authenticated (token persisted under `VITE_AUTH_TOKEN_KEY`).
- In dev (React StrictMode), the embed bootstrap page does not create multiple workspaces due to double-invoked effects.

## Plan status

- Ready

## Change log

- 2026-01-30: Initial plan drafted (repo exploration + user decisions captured).
- 2026-01-30: Incorporated edge/reflection feedback (prod base path note, Origin/CORS enforcement, safer template defaults).
- 2026-01-30: Simplified for isolated embed env (defer security headers/origin/rate limits; remove template allowlist).
- 2026-01-30: Added missing glue details (Tuyau codegen, response shape, auth-state setter usage, template clone via WorkspaceService then overwrite).

## Execution log

- 2026-01-30: Completed B1 "Add a new unauthenticated route (additive)", B2 "Implement bootstrap controller logic", B3 "Backend tests"; Completed todos: W1; Remaining todos: W2.
- 2026-01-30: Completed F1 "Add a public route /embed", F2 "Implement EmbedBootstrap page", F3 "Make auth token storage key configurable"; Completed todos: W2; Remaining todos: none.
- 2026-01-30: Reflection complete; Completed steps: B1,B2,B3,F1,F2,F3; Completed todos: W1,W2; Remaining todos: none; Notes: backend tests + frontend/manual embed validation pending.
