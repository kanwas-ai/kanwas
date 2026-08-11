# H1 Fix Spec — Yjs WebSocket Authentication

## Goal

Close H1 from SECURITY_ASSESSMENT.md. A known workspace UUID currently grants full socket access to the yDoc. Require a signed, short-lived, workspace-scoped token on every non-shared-link handshake.

## Threat model

In scope:

- Unauthenticated attacker with a leaked/guessed workspace UUID (URL, screenshot, referrer).
- Revoked org members whose Postgres membership was removed — blocked on _next reconnect_ after token expiry.

Out of scope (separate work):

- Mid-session revocation of an already-open socket (requires server-side push-disconnect on membership change).
- Forward secrecy / per-session rotation.

## Token

HMAC-SHA256, stateless, shared-secret verification.

**Format:** `<base64url(payload)>.<base64url(hmac)>`

- `payload` = UTF-8 JSON bytes of `{ wid, uid, mode, exp }`
- `hmac` = `HMAC-SHA256(secret, base64url(payload))` — signed over the base64url of the payload (not the raw JSON), so canonicalization is trivial.
- `base64url` = unpadded (`-`, `_`, no `=`).

**Payload fields:**
| Field | Type | Meaning |
|-------|------|---------|
| `wid` | string (UUID) | workspace id the token grants access to |
| `uid` | string | user id that requested the token (audit only) |
| `mode` | `"editable" \| "read-only"` | access mode applied server-side |
| `exp` | number | Unix seconds; token invalid at `exp` or later |

**TTL:** 60 minutes from mint (`exp = floor(now_s) + 3600`).

**Secret:** existing `API_SECRET` on backend, `BACKEND_API_SECRET` on yjs-server — same shared secret already used for `apiKey` middleware + `BackendNotifier` + `DocumentShareResolver`.

**Verification checks** (in order, all must pass):

1. Structural split on `.` → two parts, both non-empty, base64url-decodable.
2. HMAC recomputed over `payload_b64` matches provided signature (constant-time compare).
3. JSON parses to expected shape.
4. `wid === expectedWorkspaceId` (the handshake-supplied `workspaceId`).
5. `exp > floor(now_s)`.

Any failure → reject handshake, disconnect.

## Backend

### New service: `backend/app/services/yjs_socket_token_service.ts`

```ts
class YjsSocketTokenService {
  mint(args: { workspaceId: string; userId: string; mode: 'editable' | 'read-only' }): {
    token: string
    expiresAt: string
  }
  // verify is not needed server-side (yjs-server verifies); skip unless a test needs it
}
```

Reads `API_SECRET` from `env`. TTL constant = `3600`.

### New route: `POST /workspaces/:id/yjs-socket-token`

- Lives inside the existing `middleware.auth() + middleware.organizationAccess()` group in `start/routes.ts`.
- Handler in new `backend/app/controllers/yjs_socket_tokens_controller.ts`.
- Validates workspace UUID via the existing params validator pattern.
- For now: any org member gets `mode: 'editable'` (matches current de-facto behavior — there is no read-only org member state yet).
- Response: `{ token: string, expiresAt: string }` (ISO 8601).
- Regenerate Tuyau types (`pnpm codegen`) after adding.

### Backend-side connectors

`WorkspaceDocumentService.getWorkspaceDocument()` currently calls `connectToWorkspace({host, workspaceId, ...})`. It must mint a token directly (no HTTP round-trip) and pass via `params.socketToken`.

- Add `YjsSocketTokenService` dependency.
- For backend-internal calls, `userId` should be the actor when available, else a reserved `"backend:system"` identifier. We'll plumb `userId` through existing call sites where available; use a constant sentinel where not.

## Yjs server

### New file: `yjs-server/src/socket-token-verifier.ts`

```ts
export interface SocketTokenClaims {
  wid: string
  uid: string
  mode: 'editable' | 'read-only'
}
export class SocketTokenVerifier {
  constructor(private readonly secret: string) {}
  verify(token: string, expectedWorkspaceId: string, now: number = Date.now()): SocketTokenClaims | null
}
```

- `now` injectable for tests.
- Uses `node:crypto` `timingSafeEqual` after length equalization.
- Returns `null` on any failure (logged one level up). Don't throw — the caller already disconnects.

### Wire-up in `server.ts`

- Instantiate `SocketTokenVerifier(adminSecret)` alongside `documentShareResolver`.
- Pass into `handleSocketConnection(socket, roomManager, documentShareResolver, tokenVerifier, logger)`.

### `socket-connection.ts` changes

In `handleSocketConnection`, after `workspaceId` resolves and _before_ the `longHashId` branch:

```ts
if (!longHashId) {
  const socketToken = resolveHandshakeStringValue(socket, 'socketToken')
  if (!socketToken) { reject 'no socketToken' }
  const claims = tokenVerifier.verify(socketToken, workspaceId)
  if (!claims) { reject 'invalid socketToken' }
  socketCapabilities = { accessMode: claims.mode, isSharedLink: false }
  // log uid for audit
}
```

- Preserve existing `longHashId` branch unchanged.
- Add `socketToken` to `resolveHandshakeStringValue` key union.
- Log structured rejection reasons (for forensics + tests).

## Clients

### Shared provider plumbing

`socketio-provider-base.ts` already supports `params` as `ProviderParams = Record | () => Record`. It flattens via `getAuthParams` into `buildBaseSocketAuth`. Callers pass a **function** for `params` so the token is re-read on each reconnect.

Per-client responsibility: keep a fresh token, return it from the function.

### Frontend (`frontend/src/providers/workspace/WorkspaceProvider.tsx`)

- Add a small `useYjsSocketToken(workspaceId)` hook that:
  - Fetches from the new endpoint via `tuyau`.
  - Caches in a ref with `expiresAt`.
  - On demand (inside the `params` callback), returns the cached token; refetches if missing or within 60s of expiry.
- Pass `params: () => ({ clientKind: 'frontend', correlationId, socketToken: tokenRef.current })` to `WorkspaceSocketProvider`.
- Same treatment for `PublicNoteProvider` → but only when not using a shared link (`longHashId`); shared-link connections remain unchanged.

### CLI (`cli/src/connection.ts`)

- Before `connectToWorkspace`, call backend with the CLI bearer to mint a token.
- Pass `params: { clientKind: 'cli', socketToken }` as an object. CLI is one-shot; no refresh callback needed.

### Execenv (`execenv/src/sync-manager.ts`)

- Before `connectToWorkspace`, fetch `POST /workspaces/:id/yjs-socket-token` with `Authorization: Bearer ${AUTH_TOKEN}`.
- Pass `params: () => ({ clientKind: 'execenv', socketToken })`; refetch on expiry approach same as frontend (execenv can be long-lived).

### Backend internal (`WorkspaceDocumentService`)

- `connectToWorkspace({ ..., params: () => ({ socketToken: tokenService.mint(...).token }) })`.
- Minting is local + cheap, so no caching needed.

## Failure modes & logging

| Condition                                    | Yjs-server action | Log level                                           |
| -------------------------------------------- | ----------------- | --------------------------------------------------- |
| Missing `socketToken` + missing `longHashId` | disconnect        | `warn` with `reason: 'no_auth'`                     |
| Malformed token (no split / bad base64)      | disconnect        | `warn` with `reason: 'malformed_token'`             |
| HMAC mismatch                                | disconnect        | `warn` with `reason: 'invalid_signature'`           |
| `wid` mismatch                               | disconnect        | `warn` with `reason: 'workspace_mismatch'`          |
| Expired                                      | disconnect        | `info` with `reason: 'expired'` (routine, expected) |

Client-side: on `connect_error`, refetch token and let reconnect retry once before surfacing to user.

## Tests

### `backend/tests/unit/services/yjs_socket_token_service.spec.ts`

- Mint produces well-formed token.
- Round-trip through verifier with same secret passes.
- Different secret → rejected.
- Tampered payload → rejected.

### `yjs-server/tests/unit/socket-token-verifier.spec.ts`

- Valid token with correct `wid` + unexpired → claims returned.
- Wrong `wid` → `null`.
- Expired → `null`.
- Tampered payload → `null`.
- Tampered signature → `null`.
- Malformed (no `.`, empty parts, bad base64) → `null` each.
- Constant-time compare: same-length wrong signatures don't early-exit by length (covered by just using `timingSafeEqual` correctly; no separate test).

### `backend/tests/functional/yjs_socket_tokens/store.spec.ts`

- Unauthenticated → 401.
- Authed but non-member → 403 (via `organizationAccess`).
- Authed member → 200 with `{ token, expiresAt }`, token verifies with `API_SECRET`.

### `yjs-server/tests/integration/socketio.spec.ts` additions

- Connect without token or shared link → disconnected.
- Connect with valid token for workspace A, `workspaceId = A` → accepted; `accessMode: 'editable'`.
- Connect with valid token for A but handshake `workspaceId = B` → disconnected.
- Connect with expired token → disconnected.
- Shared-link path (existing) → unchanged.

## Rollout order

1. Token service + verifier + unit tests (backend + yjs-server). Self-contained, no wiring.
2. Backend endpoint + functional test. Also codegen Tuyau.
3. Yjs-server integration: wire verifier into `handleSocketConnection` + integration tests. At this point the server rejects non-shared-link clients without tokens — **breaks all clients**, so we land 1+2+3+4 together.
4. Client wiring: shared provider plumbing (already present) + frontend hook + CLI fetch + execenv fetch + backend internal mint.
5. E2E smoke: run frontend against local yjs-server, open a workspace, confirm connect + reconnect work. Run CLI pull/push.

## Non-goals for this PR

- Mid-session revocation (push-disconnect from backend → yjs-server). Noted as follow-up.
- Differentiating `editable` vs `read-only` at the org-member level. Current model doesn't have this; we plumb `mode` through in anticipation but always mint `editable` today.
- Rotating `API_SECRET`. The existing rotation story applies; TTL doesn't interact.
