Never add Claude Code as co-author to commits, it makes the history hard to navigate.

## Resolving Merge Conflicts in pnpm-lock.yaml

**Never use `git checkout --theirs` or `--ours` for pnpm-lock.yaml conflicts.** This takes one version without incorporating changes from both sides.

Instead, resolve lockfile conflicts by regenerating:

```bash
# Accept either version to clear the conflict markers
git checkout --theirs pnpm-lock.yaml
# Then regenerate to include all package.json changes
pnpm install
# Stage the regenerated lockfile
git add pnpm-lock.yaml
```

This ensures the lockfile reflects the merged state of all package.json files.

## Monorepo Structure

- `/backend` - AdonisJS API server, services (the built-in AI agent was removed on the `local-first` branch, Step 1)
- `/frontend` - React app
- `/shared` - Shared types and utilities (WorkspaceDocument types, ContentConverter, path utilities)
- `/cli` - CLI tool (`kanwas init/pull/push`). Auth via browser-based OAuth flow (like GitHub CLI). Frozen with cloud; deprecated on the `local-first` branch.
- `/execenv` - Execution environment (syncs yDoc ↔ filesystem). Formerly ran inside the E2B/Docker agent sandbox; on the `local-first` branch it is daemon material for Step 2.

When looking for types or utilities, check `shared` first - it exports common code used by both backend and frontend.

**Key utility:** `workspaceToFilesystem()` in `shared/src/workspace/converter.ts` is the canonical way to convert a workspace yDoc to a filesystem tree. Used by sandbox hydration - reuse it for any workspace→files conversion.

**Warning**: `shared` exports `ContentConverter` which depends on `@blocknote/server-util` (Node.js-only). Importing runtime utilities from `shared` in frontend code may pull in server-only dependencies. For simple Y.Doc operations in frontend, inline the logic or import types only (`import type`).

When completing a task, suggest to the user: "Would you like to run `/reflect` to capture any learnings from this session?"

## Running Services Locally

**Important:** Never start services automatically. If services are needed for a task (e.g., running tests), detect if they're running and ask the user to start them.

**Docker Compose** - Only for infrastructure services:

```bash
docker-compose up -d postgres redis   # Infrastructure only
```

**Backend, Frontend, Yjs Server** - Run directly with pnpm (not via docker-compose):

```bash
cd backend && pnpm dev      # Backend API server
cd frontend && pnpm dev     # Frontend React app
cd yjs-server && pnpm dev   # Yjs realtime server
```

## CLI Tools

**Railway** - Production backend hosting

```bash
cd backend && railway logs --tail 100    # View backend logs
railway status                           # Deployment status
```

**GitHub CLI** - CI/CD and workflows

```bash
gh run list                              # List recent CI runs
gh run view <id>                         # View specific run details
gh run watch <id>                        # Watch run in progress
gh workflow run <name>                   # Trigger workflow manually
```

## Deployment Pipeline

Two environments: **staging** (auto on push to master) and **production** (manual workflow dispatch).

| Package        | Platform | Staging | Production |
| -------------- | -------- | ------- | ---------- |
| **backend**    | Railway  | Auto    | Manual     |
| **frontend**   | Railway  | Auto    | Manual     |
| **yjs-server** | Railway  | Auto    | Manual     |

**To deploy to production:** GitHub Actions → Select workflow → Run workflow → Choose "production"

(The E2B sandbox template deploy for `shared + execenv` was removed with the built-in agent on the `local-first` branch.)

For detailed infrastructure docs (Railway CLI, Yjs server, secrets, URLs), see `private/agent_docs/infrastructure.md`.

## Execenv Architecture

The `execenv` package handles bidirectional sync between a folder and the yDoc (formerly inside the agent sandbox; now the basis for the local daemon):

```
Filesystem (folder)  ←→  SyncManager  ←→  FilesystemSyncer (shared)  ←→  yDoc (Yjs server)
                           ↑
                      FileWatcher (chokidar)
```

**Key files:**

- `watcher.ts` - Chokidar-based file watcher, emits create/update/delete events
- `sync-manager.ts` - Orchestrates sync, handles auto-metadata for canvases
- `filesystem.ts` - Low-level file operations (read, write, YAML utilities)

**Canvas auto-metadata:** When directories or `.md` files are created on disk (e.g. by an external CLI agent), `sync-manager.ts` automatically manages `metadata.yaml`. The FilesystemSyncer (in shared) then syncs these changes to yDoc.

**Event flow:** File change → watcher → sync-manager (may auto-update metadata.yaml) → FilesystemSyncer → yDoc. Auto-generated files trigger their own events, which is handled gracefully.

## Shared Package Development

**Important:** After modifying files in `shared/src/`, you must rebuild before other packages see the changes:

```bash
pnpm --filter shared build
```

This is especially critical when debugging issues across packages - execenv and backend import from the built `shared/dist/` output, not the source files directly.

## Yjs/BlockNote Gotchas

### Clone loses non-string attributes

`Y.XmlElement.clone()` only copies **string** attributes from the internal `_map`. Numbers and booleans are lost:

- `level: 1` (number) → lost, defaults to 1
- `isToggleable: false` (boolean) → lost
- `textColor: "default"` (string) → preserved

This is why heading levels (h1, h2, h3) get flattened to h1 when using clone().

### BlockNote internal structure

BlockNote stores blocks as nested XmlElements with props in `_map`:

```
noteDoc.getXmlFragment('content')
  └─ YXmlElement<blockGroup>
       └─ YXmlElement<blockContainer> (_map: {id: "..."})
            └─ YXmlElement<heading> (_map: {level: 1, textColor: "default", ...})
                 └─ YXmlText: "Heading text"
```

Use `element.toJSON()` or `element.toString()` to see the full structure including `_map` values (they appear as XML attributes in the output).

### Fragment adoption

Detached Y.XmlFragments (from `blocksToYXmlFragment()`) must be set to a Y.Map/Y.Array before reading their contents. Once set, Yjs "adopts" the fragment into the target doc.

### ContentConverter pattern

When updating BlockNote content, replace the entire `noteDoc.getXmlFragment('content')` fragment rather than cloning children. This preserves all nested attributes. The frontend's note-fragment hook observes the attached note doc and handles fragment replacement by remounting the BlockNote editor.

### Frontend fragment references

BlockNote's `useCreateBlockNote` caches the fragment reference internally. If the backend replaces the fragment (e.g., during sync), the frontend must:

1. Detect the change via Y.Map observer (`useSyncExternalStore`)
2. Remount the editor component (use fragment identity as React `key`)

## Writing Debug Scripts

When investigating complex issues (especially Yjs/BlockNote structure), write one-off TypeScript scripts:

```bash
# Run from within a package directory that has the dependencies
cd /Users/marek/projects/kanwas/shared && npx tsx << 'EOF'
import * as Y from 'yjs'
import { ServerBlockNoteEditor } from '@blocknote/server-util'

// Your debug code here
const editor = ServerBlockNoteEditor.create()
// ...
EOF
```

**Key points:**

- Always run from a package directory (`shared`, `backend`, etc.) that has the needed dependencies in its node_modules
- Use `npx tsx` for TypeScript support with ESM imports
- Use heredoc (`<< 'EOF'`) to inline the script
- Don't try to run from `/tmp` - the dependencies won't be found
- These scripts are invaluable for understanding Yjs internal structure (inspect `_map`, `toJSON()`, etc.)
