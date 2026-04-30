# Execution Environment

Docker-based execution environment for AI agent with file watching and Yjs server sync.

## Overview

This execution environment:

- Connects to the Yjs server to sync workspace data
- Hydrates the filesystem with workspace documents
- Watches for file system changes using chokidar
- Syncs changes back to the Yjs server in real-time (bidirectional sync)
- Executes bash commands (and potentially other tools)

## Architecture

```
┌─────────────────────────────────────────┐
│     Execution Environment Container     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   SyncManager                     │ │
│  │   - Connects to Yjs server        │ │
│  │   - Hydrates filesystem           │ │
│  │   - Handles bidirectional sync    │ │
│  └───────────────┬───────────────────┘ │
│                  │                      │
│  ┌───────────────▼───────────────────┐ │
│  │   Workspace (/workspace)          │ │
│  │   - !Canvas-Name/                 │ │
│  │     - metadata.yaml               │ │
│  │     - Note.md                     │ │
│  │   - Folder/                       │ │
│  │     - !Another-Canvas/            │ │
│  └───────────────┬───────────────────┘ │
│                  │                      │
│  ┌───────────────▼───────────────────┐ │
│  │   FileWatcher (chokidar)          │ │
│  │   Detects: create, update, delete │ │
│  └───────────────┬───────────────────┘ │
│                  │                      │
│  ┌───────────────▼───────────────────┐ │
│  │   FilesystemSyncer (shared pkg)   │ │
│  │   Syncs changes to Yjs server     │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Components

### 1. src/index.ts (Main Entry Point)

- Loads configuration from environment variables
- Initializes SyncManager and FileWatcher
- Handles graceful shutdown

### 2. src/sync-manager.ts

- Connects to the Yjs server and maintains the WebSocket connection
- Hydrates filesystem from workspace data on startup
- Handles file changes via FilesystemSyncer (from shared package)
- Manages PathMapper for bidirectional mapping

### 3. src/watcher.ts

- FileWatcher class wrapping chokidar
- Watches for file/directory create, update, delete
- Ignores: `.git/`, `node_modules/`, `.DS_Store`, `.ready`
- Debounces rapid changes (500ms stabilityThreshold)

### 4. src/filesystem.ts

- Utilities for writing FSNode trees to disk
- Helper functions for file operations

### 5. Dockerfile

- Base: `ubuntu:22.04`
- Installed: Node.js 20, TypeScript
- Workspace: `/workspace`
- Builds TypeScript at image build time

### 6. entrypoint.sh

- Validates required environment variables
- Starts sync runner in background
- Waits for hydration (`.ready` file)
- Executes provided command

## Usage

### With Docker Compose

The service uses a `testing` profile to avoid auto-starting:

```bash
# Build the image (from project root)
docker-compose build execenv

# Run with a test command
docker-compose run --rm execenv bash -c 'echo "Hello" > test.md && sleep 2'
```

### Environment Variables

- `WORKSPACE_ID` (required): Workspace identifier (Yjs room name)
- `YJS_SERVER_HOST` (required): Yjs server host (e.g., "localhost:1999")
- `WORKSPACE_PATH` (optional): Workspace directory (default: `/workspace`)

## Development

### Local Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm --filter @kanwas/execenv build

# Watch mode
pnpm --filter @kanwas/execenv dev
```

### Testing

Run the test script:

```bash
./execenv/test.sh
```

Or run manual tests:

```bash
docker-compose run --rm execenv bash -c '
  echo "Creating file..."
  echo "Hello World" > test.md
  sleep 2

  echo "Updating file..."
  echo "Line 2" >> test.md
  sleep 2

  echo "Done"
  sleep 2
'
```

Expected output:

```
[watcher] File create: /workspace/test.md
[SyncManager] File create: test.md
[SyncManager] Sync result: created
[watcher] File update: /workspace/test.md
[SyncManager] File update: test.md
[SyncManager] Sync result: updated
```

## Filesystem Structure

The workspace is converted to a filesystem structure:

- **Folders** → Directories (same name, sanitized)
- **Canvases** → Directories with `!` prefix (e.g., `!My-Canvas`)
- **Nodes** → `.md` files inside canvas directories
- **Duplicate names** → Numeric suffixes (`Note.md`, `Note-2.md`)

Each canvas directory contains:

- `metadata.yaml` - Canvas metadata and node positions
- `{node-name}.md` - One file per node with content

## Notes

- File changes require ~500ms to stabilize before being detected
- The sync is bidirectional - changes in the Yjs server update the filesystem and vice versa
- Items are sorted by ID for deterministic suffix assignment
- The `.ready` file signals when hydration is complete
