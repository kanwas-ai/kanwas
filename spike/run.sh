#!/usr/bin/env bash
# Bring up the full local-first Step 0 stack: stock yjs-server + REST stub +
# seed + stock frontend. Then run the render + external-edit + fidelity checks
# separately (see README). Idempotent-ish: run cleanup.sh first if re-running.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPIKE="$REPO/spike"
ART="$SPIKE/artifacts"
mkdir -p "$ART" "$SPIKE/.yjs-data"

# tsx runner (no per-package tsx bin exists; use the workspace store copy)
TSX="$REPO/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs"

YJS_PORT="${SPIKE_YJS_PORT:-1999}"
STUB_PORT="${SPIKE_STUB_PORT:-3334}"
FE_PORT="${SPIKE_FRONTEND_PORT:-5199}"

echo "==> ports: yjs=$YJS_PORT stub=$STUB_PORT frontend=$FE_PORT"

# 1) yjs-server (stock code; fs driver; BACKEND_URL unset -> no-op notifier)
echo "==> starting yjs-server"
( cd "$REPO/yjs-server" && \
  BACKEND_API_SECRET=dev \
  YJS_SERVER_STORAGE_DRIVER=fs \
  YJS_SERVER_STORE_DIR="$SPIKE/.yjs-data" \
  PORT="$YJS_PORT" HOST=127.0.0.1 YJS_SERVER_LOG_LEVEL=info \
  node "$TSX" src/index.ts > "$ART/yjs-server.log" 2>&1 & echo $! > "$ART/yjs-server.pid" )

# 2) REST stub
echo "==> starting stub server"
SPIKE_STUB_PORT="$STUB_PORT" node "$SPIKE/stub-server/index.mjs" > "$ART/stub-server.log" 2>&1 &
echo $! > "$ART/stub-server.pid"

# wait for yjs health
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$YJS_PORT/health" >/dev/null 2>&1 && break; sleep 0.3; done

# 3) seed the workspace yDoc from the test folder
echo "==> seeding workspace"
( cd "$SPIKE" && SPIKE_SECRET=dev node "$TSX" scripts/seed.ts )

# 4) stock frontend (isolated spike mode -> base /app/, env from .env.spike.local)
echo "==> starting frontend (mode=spike, port $FE_PORT)"
( cd "$REPO/frontend" && ./node_modules/.bin/vite --mode spike --port "$FE_PORT" --strictPort \
  > "$ART/frontend.log" 2>&1 & echo $! > "$ART/frontend.pid" )
for i in $(seq 1 40); do curl -sf "http://localhost:$FE_PORT/" >/dev/null 2>&1 && break; sleep 0.4; done

echo
echo "STACK UP."
echo "  Open:  http://localhost:$FE_PORT/app/w/4a7c1e9b2d6f4b3a9c1e000000000001"
echo "  (inject localStorage['auth_token']='anything' first — see scripts/render-check.mjs)"
echo
echo "Checks:"
echo "  (a) render:        (cd $REPO/frontend && node $SPIKE/scripts/render-check.mjs)"
echo "  (b) external edit: (cd $SPIKE && node scripts/external-edit-test.mjs)"
echo "  (c) fidelity:      (cd $SPIKE && node \"$TSX\" scripts/fidelity.ts)"
echo
echo "Tear down: $SPIKE/cleanup.sh"
