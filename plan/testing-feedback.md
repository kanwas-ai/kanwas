# Local-first user-testing feedback log

Running log of issues/papercuts found during live user testing of kanwasd. Feeds the post-v1 fix queue. Started 2026-07-03.

| #   | Found      | What                                                                                                                                                                                                                        | Severity                     | Status                              | Fix idea                                                                                                                                                                                                                                       |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-07-03 | Manual `localStorage.setItem('auth_token', …)` onboarding step is hostile: Chrome paste-protection blocks it for real users ("allow pasting"), and it's undiscoverable.                                                     | UX blocker for anyone but us | **FIXED** (2026-07-03, `kanwas up`) | Local mode should need no console: e.g. daemon prints a URL like `/app/local-login?token=…` that sets localStorage and redirects; or frontend `localdaemon` mode auto-seeds a token when `VITE_LOCAL_MODE=1`. Small frontend change, worth it. |
| 2   | 2026-07-03 | Frontend attempts a socket.io connection to the REST port (`ws://127.0.0.1:4300/socket.io/`) that the daemon doesn't serve → endless red console errors + reconnect spam. Benign but alarming, and wasted reconnect cycles. | Cosmetic/noise               | **FIXED** (2026-07-03, `kanwas up`) | Either stub a no-op socket.io endpoint in the daemon, or (better) find the frontend feature behind it (post-agent-removal leftover — backend notifications socket, `backend/socketio.ts` constants survived Step 1) and gate/remove it.        |

## Resolutions

### #1 — no-console login (FIXED, 2026-07-03)

The daemon now **serves the production frontend bundle itself** (same-origin on
`:4300`, via `vite build --mode kanwasup` → `local-daemon/web-dist`, served under
`/app/`). Because the app and its `localStorage` now live on the daemon's own
origin, the daemon serves **`GET /local-login`** — a tiny HTML page that sets
`localStorage['auth_token']` and redirects to `/app/w/<workspaceId>`. The
`kanwas up` launcher opens that URL (and `GET /` redirects to it too). No console,
no paste, no devtools. Verified headlessly: a **clean** browser context (no
pre-seeded token) hitting `/local-login` ends up authenticated on the rendered
canvas (`spike/artifacts/kanwasup-1.png`, `kanwasup-3-claude.png`).

### #2 — quiet the dead app-channel socket (FIXED, 2026-07-03)

`frontend/src/api/client.ts` opens an unused `socket.io` connection to the API
origin with default `reconnection: true`. It is **websocket-first**
(`transports: ['websocket','polling']`) and — confirmed empirically — never falls
back to polling; it just retries websocket forever (red console error every ~5s).
Since we can't edit the tracked frontend and `socket.io` isn't a daemon dep, the
daemon now answers the **websocket** Engine.IO/Socket.IO handshake with a minimal
self-contained stub (`local-daemon/src/socketio-stub.ts`, built on the `ws` dep):
OPEN → CONNECT-ack → periodic ping. The client connects once and stays quiet.
Verified: **0 console errors** over a 20s window (was ~6+ and climbing);
`spike/artifacts/kanwasup-1.png.console.log` is empty. An HTTP long-poll path is
also implemented as a fallback but isn't exercised in practice.
