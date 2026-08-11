# Execenv - Sandbox Execution Environment

> **Changed (local-first Step 1):** the built-in agent is gone. The agent-only
> parts of execenv were deleted (`live-state-server.ts` loopback API, the
> `/tmp/kanwas-placement` placement-intent sidecar, the E2B template files
> `e2b.Dockerfile`/`e2b.*.toml`, and the vendored `apply_patch` binary). The
> rest of execenv is kept as the basis for the Step 2 local daemon. E2B/sandbox
> framing below is historical.

The `execenv` package runs **inside** the sandbox (E2B or Docker) and provides bidirectional sync between the filesystem and yDoc (via the Yjs server).

## Purpose

When an agent runs in a sandbox, it manipulates files on disk. The execenv package:

1. **Hydrates** the filesystem from yDoc on startup
2. **Watches** for file changes using chokidar
3. **Syncs** changes back to yDoc in real-time
4. **Auto-manages** canvas metadata (creates/updates `metadata.yaml` automatically)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SANDBOX                                  │
│                                                                  │
│   /workspace/           FileWatcher          SyncManager         │
│   ├── c-Canvas/    ──▶  (chokidar)    ──▶   (orchestrator)      │
│   │   ├── metadata.yaml                          │               │
│   │   └── note.md                                ▼               │
│   └── folder/                            FilesystemSyncer        │
│                                            (from shared)         │
│                                                  │               │
└──────────────────────────────────────────────────┼───────────────┘
                                                   │
                                                   ▼
                                            Yjs server/yDoc
```

## Key Files

| File                  | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `src/index.ts`        | Entry point - orchestrates startup, watcher, and shutdown    |
| `src/sync-manager.ts` | Main coordinator - handles init, file changes, auto-metadata |
| `src/watcher.ts`      | Chokidar wrapper - emits create/update/delete events         |
| `src/filesystem.ts`   | Low-level utilities - read/write files, YAML, ready marker   |

## Sync Flow

### Startup (yDoc → Filesystem)

1. Connect to the Yjs server workspace
2. Convert yDoc to filesystem tree (`workspaceToFilesystem`)
3. Write tree to `/workspace/`
4. Build PathMapper for reverse lookups
5. Write `.ready` marker (signals agent can start)

### Runtime (Filesystem → yDoc)

1. FileWatcher detects change
2. SyncManager processes event:
   - Auto-creates `metadata.yaml` for new `c-*` directories
   - Auto-updates `metadata.yaml` when `.md` files are added/removed
3. FilesystemSyncer applies change to yDoc
4. The Yjs server syncs to other clients

## Auto-Metadata Management

When the agent uses standard file operations, SyncManager automatically manages `metadata.yaml`:

- `mkdir c-Canvas/` → creates `metadata.yaml` with UUID
- `echo > c-Canvas/note.md` → adds node entry with horizontal positioning
- `rm c-Canvas/note.md` → removes node entry and cleans up edges

## Testing

Tests are in `tests/bidirectional-sync.spec.ts` - **integration tests** that require running services.

### Prerequisites

```bash
# Infrastructure (docker-compose)
docker-compose up -d postgres redis

# Backend and Yjs server (run in separate terminals)
cd backend && pnpm dev
cd yjs-server && pnpm dev
```

### Run Tests

```bash
pnpm test                              # All tests
pnpm test -- --grep "Auto-Metadata"    # Just auto-metadata tests
```

### Known Warnings

The warning `Invalid access: Add Yjs type to a document before reading data` appears during tests - this is a benign BlockNote/Yjs quirk and doesn't affect functionality.

### Test Structure

- Tests create a real workspace via the backend API
- Connect to the Yjs server for real yDoc sync
- Use temp directories for filesystem operations
- Clean up connections and directories after each test

## Important Patterns

### Ready Marker

The `.ready` file signals hydration is complete. It's:

- Written after filesystem is fully hydrated
- Ignored by the watcher (in DEFAULT_IGNORED)
- Used by the agent to know when it can start file operations

### Canvas Prefix

Directories starting with `c-` are canvases. This convention is used by:

- `SyncManager.isCanvasDirectory()` - for auto-metadata
- `FilesystemSyncer` - for sync routing
- `PathMapper` - for path resolution

### Chokidar Settings

```typescript
awaitWriteFinish: {
  stabilityThreshold: 500,  // Wait 500ms after last write
  pollInterval: 100,
}
```

This prevents partial file events during writes.

## Dependencies

- **shared** - `FilesystemSyncer`, `PathMapper`, `ContentConverter`, types
- **chokidar** - File watching
- **yaml** - Parse/stringify metadata.yaml
- **ws** - WebSocket for Yjs server connection

## Sync Code Split

The sync logic is split between two packages:

| Package     | Class              | Responsibility                                                   |
| ----------- | ------------------ | ---------------------------------------------------------------- |
| **execenv** | `SyncManager`      | Orchestration, auto-metadata for `c-*` dirs, watcher integration |
| **shared**  | `FilesystemSyncer` | Core yDoc mutations, path resolution, folder/canvas/node CRUD    |

When debugging sync issues, check both locations. `SyncManager` handles the filesystem side (auto-metadata), `FilesystemSyncer` handles the yDoc side (structure updates).

## Nested Folder + Canvas

When `mkdir -p folder/c-canvas` creates nested directories:

- `FilesystemSyncer.ensureParentFolders()` auto-creates missing parent folders in yDoc
- This handles the race condition where canvas is created before its parent folder syncs

## Deploying Changes to Production Sandboxes

**Important:** When you fix bugs in `shared` or `execenv`, those fixes won't reach production sandboxes until the E2B template is rebuilt:

```bash
e2b template build
```

The deployment pipeline:

- **Backend** → Railway (auto-deploys on push)
- **Frontend** → Vercel (auto-deploys on push)
- **Sandbox (execenv + shared)** → E2B template (manual rebuild required)

The E2B template bundles `shared/dist/` into the Docker image. If `shared` is updated (e.g., `ContentConverter` fixes), you must rebuild the template for production sandboxes to get those changes.

**Gotcha:** `e2b template list` shows "Created at" date (when template was first created), not the last build date. The build logs confirm when the latest version was deployed.
