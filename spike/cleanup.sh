#!/usr/bin/env bash
# Kill the three spike services (yjs-server, stub, frontend) started by run.sh /
# the builder. Safe to run repeatedly. Does NOT touch the user's own dev server
# on other ports.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ART="$HERE/artifacts"

kill_pidfile() {
  local name="$1" f="$ART/$1.pid"
  if [ -f "$f" ]; then
    local pid; pid="$(cat "$f" 2>/dev/null)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "killed $name (pid $pid)"
    else
      echo "$name not running"
    fi
    rm -f "$f"
  else
    echo "$name: no pidfile"
  fi
}

kill_pidfile yjs-server
kill_pidfile stub-server
kill_pidfile frontend

# Fallback: free the spike + local-daemon ports if anything lingers.
# (Step 2A local-daemon uses yjs=1999, rest=4300, frontend=5273. Never 5173 —
#  that may be the user's own dev server.)
for port in "${SPIKE_YJS_PORT:-1999}" "${SPIKE_STUB_PORT:-3334}" "${SPIKE_FRONTEND_PORT:-5199}" \
            "${KANWAS_PORT:-4300}" "${KANWAS_FRONTEND_PORT:-5273}"; do
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}')"
  for p in $pids; do kill "$p" 2>/dev/null && echo "freed port $port (pid $p)"; done
done

echo "done. (node_modules symlinks under spike/ and shared/ are left in place so the"
echo " scripts can be re-run; frontend/.env.spike.local is left in place. Remove them"
echo " manually if you want a pristine tree.)"
