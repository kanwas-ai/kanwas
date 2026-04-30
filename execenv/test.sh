#!/bin/bash
set -e

echo "=========================================="
echo "Execution Environment Test Script"
echo "=========================================="
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "[1/5] Building shared package..."
pnpm --filter shared build
echo ""

echo "[2/5] Ensuring yjs-server is running..."
docker-compose up -d yjs-server
echo ""

echo "[3/5] Building execenv image..."
docker-compose build execenv
echo ""

echo "[4/5] Running test command in execenv..."
echo "       Note: You need a valid WORKSPACE_ID with data in the Yjs server store"
echo "       Command: ls -la && find . -type f"
echo ""

# Check if EXECENV_WORKSPACE_ID is set
if [ -z "$EXECENV_WORKSPACE_ID" ]; then
  echo "WARNING: EXECENV_WORKSPACE_ID not set, using 'test-workspace'"
  echo "         Make sure this workspace exists in the Yjs server store!"
  echo ""
fi

# Run the execenv container with a test command
docker-compose run --rm execenv bash -c '
  echo "Listing workspace contents..."
  ls -la
  echo ""

  echo "Finding all files..."
  find . -type f
  echo ""

  echo "Creating test.md file..."
  echo "Hello from execenv" > test.md
  sleep 1

  echo "Reading test.md..."
  cat test.md
  sleep 1

  echo "Updating test.md..."
  echo "World" >> test.md
  sleep 1

  echo "Creating another file..."
  echo "Second file" > test2.md
  sleep 1

  echo "Deleting test2.md..."
  rm test2.md
  sleep 1

  echo "Done with test operations"
'

echo ""
echo "=========================================="
echo "[5/5] Test complete!"
echo ""
echo "Expected output:"
echo "  - Workspace should be hydrated from the Yjs server"
echo "  - Should see workspace contents (canvases as !folders, nodes as .md files)"
echo "  - Should see [SYNC] JSON messages for file changes"
echo ""
echo "To test with a specific workspace:"
echo "  EXECENV_WORKSPACE_ID=your-workspace-id ./execenv/test.sh"
echo "=========================================="
