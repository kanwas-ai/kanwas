#!/bin/bash
set -e

echo "=========================================="
echo "Kanwas Execution Environment"
echo "=========================================="

# Required environment variables
WORKSPACE_ID="${WORKSPACE_ID:-}"
YJS_SERVER_HOST="${YJS_SERVER_HOST:-}"
YJS_SERVER_PROTOCOL="${YJS_SERVER_PROTOCOL:-ws}"
WORKSPACE_PATH="${WORKSPACE_PATH:-/workspace}"

# Validate required variables
if [ -z "$WORKSPACE_ID" ]; then
  echo "ERROR: WORKSPACE_ID environment variable is required"
  exit 1
fi

if [ -z "$YJS_SERVER_HOST" ]; then
  echo "ERROR: YJS_SERVER_HOST environment variable is required"
  exit 1
fi

echo "Workspace ID: $WORKSPACE_ID"
echo "Yjs Server Host: $YJS_SERVER_HOST"
echo "Yjs Server Protocol: $YJS_SERVER_PROTOCOL"
echo "Workspace Path: $WORKSPACE_PATH"
echo ""

# Export variables for Node.js scripts
export WORKSPACE_ID
export YJS_SERVER_HOST
export YJS_SERVER_PROTOCOL
export WORKSPACE_PATH

# Configure AssemblyAI CLI if API key is provided
if [ -n "$ASSEMBLYAI_API_KEY" ]; then
  echo "[setup] Configuring AssemblyAI CLI in background..."
  (assemblyai config "$ASSEMBLYAI_API_KEY" </dev/null >/tmp/assemblyai-config.log 2>&1 || true) &
fi

# Start the sync runner in background
# This: connects to the Yjs server, hydrates filesystem, starts file watcher, keeps connection alive
echo "[runner] Starting sync runner in background..."
node /app/execenv/dist/index.js &
RUNNER_PID=$!
echo "[runner] Sync runner started with PID: $RUNNER_PID"

# Wait for hydration to complete (runner creates .ready file when done)
echo "[runner] Waiting for hydration..."
while [ ! -f "$WORKSPACE_PATH/.ready" ]; do
  sleep 0.1
done
echo "[runner] Hydration complete!"
echo ""

# Change to workspace directory
cd "$WORKSPACE_PATH"
echo "[workspace] Changed to workspace directory: $(pwd)"
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "[cleanup] Shutting down..."
  if [ ! -z "$RUNNER_PID" ]; then
    echo "[cleanup] Stopping sync runner (PID: $RUNNER_PID)..."
    kill $RUNNER_PID 2>/dev/null || true
  fi
  echo "[cleanup] Done"
}

# Trap exit signals
trap cleanup EXIT INT TERM

# Execute the provided command
if [ "$#" -eq 0 ]; then
  echo "[exec] No command provided, running interactive bash..."
  exec bash
else
  echo "[exec] Executing command: $@"
  echo "=========================================="
  echo ""

  # Execute the command
  "$@"
  EXIT_CODE=$?

  echo ""
  echo "=========================================="
  echo "[exec] Command completed with exit code: $EXIT_CODE"

  # Keep container running to allow file watcher to process any final changes
  echo "[exec] Waiting 2 seconds for file watcher to process changes..."
  sleep 2

  exit $EXIT_CODE
fi
