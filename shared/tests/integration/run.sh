#!/bin/bash
# Integration Test Runner
# Runs integration tests with proper environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "Yjs Client Integration Tests"
echo "=========================================="
echo ""

# Check if services are available
BACKEND_URL="${BACKEND_URL:-http://localhost:3333}"
YJS_SERVER_HOST="${YJS_SERVER_HOST:-localhost:1999}"

echo "Checking services..."

# Check backend
if ! curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo "ERROR: Backend not available at $BACKEND_URL"
  echo "Please run: cd backend && pnpm dev"
  exit 1
fi

if ! curl -s "http://$YJS_SERVER_HOST/health" > /dev/null 2>&1; then
  echo "ERROR: Yjs server not available at $YJS_SERVER_HOST"
  echo "Please run: cd yjs-server && pnpm dev"
  exit 1
fi
echo "  Backend: OK ($BACKEND_URL)"
echo "  Yjs server: $YJS_SERVER_HOST"
echo ""

# Export for tests
export BACKEND_URL
export YJS_SERVER_HOST

# Run tests (setup happens in beforeAll via setup.ts)
echo "Running integration tests..."
echo "=========================================="
echo ""

cd "$SHARED_DIR"
pnpm vitest run tests/integration/ --reporter=verbose

echo ""
echo "=========================================="
echo "Integration tests complete!"
echo "=========================================="
