#!/bin/bash
# Kill all development processes for the Kanwas project
# Usage: ./dev-kill.sh

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🛑 Stopping Kanwas development environment..."
echo ""

# Function to kill processes by pattern
kill_processes() {
    local pattern=$1
    local description=$2

    pids=$(pgrep -f "$pattern" 2>/dev/null || true)

    if [ -n "$pids" ]; then
        echo "🔸 Killing $description..."
        echo "   PIDs: $pids"
        echo "$pids" | xargs kill -TERM 2>/dev/null || true

        # Wait a bit and force kill if still running
        sleep 1
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "   Force killing remaining processes..."
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    else
        echo "✓ No $description running"
    fi
}

# Kill pnpm dev processes for each service
kill_processes "pnpm.*dev.*backend" "backend dev server"
kill_processes "pnpm.*dev.*frontend" "frontend dev server"
kill_processes "pnpm.*dev.*yjs-server" "yjs-server dev server"

# Kill any node processes running from these directories
kill_processes "$SCRIPT_DIR/backend.*node" "backend node processes"
kill_processes "$SCRIPT_DIR/frontend.*node" "frontend node processes"
kill_processes "$SCRIPT_DIR/yjs-server.*node" "yjs-server node processes"

# Kill any Vite dev servers (frontend typically uses Vite)
kill_processes "vite.*kanwas" "Vite dev servers"

# Kill any AdonisJS servers (backend uses AdonisJS)
kill_processes "node.*ace.*serve" "AdonisJS servers"

echo ""
echo "🐳 Stopping Docker containers..."

# Run docker-compose down
cd "$SCRIPT_DIR"
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
    docker-compose down 2>/dev/null || docker compose down 2>/dev/null || echo "   Could not run docker-compose down (maybe not running?)"
else
    echo "   No docker-compose.yml found, skipping..."
fi

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Tip: You can verify nothing is running with:"
echo "  ps aux | grep -E 'pnpm|node|vite' | grep kanwas"
