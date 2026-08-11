#!/usr/bin/env bash
# Stop the live user-testing stack.
#
# SUPERSEDED (2026-07-03): the live stack is now started by the `kanwas up`
# launcher and tracked in ~/.kanwas/daemon.json, so the canonical way to stop it
# is `kanwas down`. This script now delegates to that, then still processes the
# legacy spike/artifacts/live-services.pid as a fallback for any older, manually
# started processes. NEVER touches the user's own dev server on :5173.
set -u

KANWAS="/Users/johancutych/Documents/kanwas/local-daemon/bin/kanwas"
PIDFILE="/Users/johancutych/Documents/kanwas/spike/artifacts/live-services.pid"

# 1. Canonical stop for the launcher-managed daemon.
if [[ -x "$KANWAS" ]]; then
  echo "Stopping launcher-managed Kanwas (kanwas down)…"
  "$KANWAS" down || true
fi

# 2. Legacy fallback: kill any PIDs recorded by the old operator flow.
if [[ -f "$PIDFILE" ]]; then
  while read -r label pid; do
    [[ -z "${pid:-}" || "$label" == \#* ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping legacy $label (PID $pid)…"
      kill "$pid" 2>/dev/null
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$pid" 2>/dev/null || break
        perl -e 'select(undef,undef,undef,0.3)'
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "  $label stopped."
    fi
  done < "$PIDFILE"
fi

echo "Done. (User dev server on :5173 was never touched.)"
