@agents.md

# Backend Development Guide for Claude

> **Removed (local-first Step 1):** the built-in AI agent was deleted on the
> `local-first` branch — `libs/agent/`, the `CanvasAgent` DI binding, agent
> controllers/services/listeners/models (invocations, tasks, skills,
> connections/Composio, sandbox/E2B, Milvus, Restate, LLM config), their routes,
> and the `agent` test suite. Sections below that describe the agent, sandbox,
> prompts, or agent tests are stale — kept for reference until this doc is
> rewritten.

## Pre-commit Checklist

**IMPORTANT: Always run these commands before committing and pushing code:**

### 1. Regenerate Shared Types (if API changed)

If you modified routes, controllers, or validators, regenerate the Tuyau types:

```bash
pnpm codegen
```

This runs `node ace tuyau:generate` and automatically formats the output with Prettier.

**Important:** Always use `pnpm codegen` instead of `node ace tuyau:generate` directly to ensure consistent formatting with CI.

### 2. Start Required Services

Tests require postgres and redis to be running:

```bash
# From project root
docker-compose up -d postgres redis
```

### 3. Run Tests

```bash
pnpm test
```

Never run backend tests in parallel. The test bootstrap runs database migrations, so multiple runners against the same test database can block on migration locks. See `@agents.md` for focused test commands and filters.

This ensures:

- All unit and functional tests pass
- No runtime errors in the code
- Business logic works as expected
- Database migrations are correct

### 4. Run Live Agent Tests (optional, requires real API keys)

```bash
source .env && ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" OPENAI_API_KEY="$OPENAI_API_KEY" pnpm test:agent
```

These tests hit real Anthropic and OpenAI APIs to verify:

- Streaming text generation works end-to-end
- Non-streaming LLM calls (TaskTitleService, NodeSummary) work
- Tool calling with ToolLoopAgent (instructions, prepareStep, formatMessages)
- Phase annotations (commentary/final_answer) accepted by the provider
- Provider system prompt sections don't cause API rejection
- Prompt caching options accepted

**Why the `source .env` prefix?** `.env.test` overrides API keys with dummy values (`test-openai-key`). Tests auto-skip when keys aren't real. The `source` command loads real keys from `.env` and passes them as env vars so they take precedence.

### 5. Build Production Bundle

```bash
pnpm build
```

This ensures:

- No TypeScript compilation errors
- Strict type checks pass
- Production build will succeed in CI/CD
- No missing type definitions

## Recommended Workflow

```bash
# Start services (if not already running)
cd .. && docker-compose up -d postgres redis && cd backend

# After making changes to API (routes, controllers, validators)
pnpm codegen       # Regenerate Tuyau types with proper formatting

# Before committing
pnpm test          # Verify tests pass
pnpm build         # Verify build succeeds
git add .
git commit -m "..."
git push
```

## Local Dev Troubleshooting

**Agent "thinking forever" or unexpected errors?** Run pending migrations first:

```bash
node ace migration:run
```

Local dev often fails silently when DB schema is out of sync with code (e.g., missing columns, constraint violations).

## Architecture

### Data Flow & Source of Truth

```
  WORKSPACE (Yjs/Yjs Server)        SANDBOX (Docker/E2B)
  ──────────────────────            ────────────────────
  yDoc (source of truth)  ──sync──▶ /workspace/ filesystem
                                    (mirror for agent file ops)
```

**Key principle:** yDoc is the source of truth. The sandbox filesystem is a mirror for agent file manipulation. When reading configuration/data, read from yDoc directly.

### Key Concepts

- **WorkspaceDocument** - Tree structure with canvases, folders, and nodes (see `shared/src/types.ts`)
- **Node types** - `blockNote` notes plus the binary/link/canvas nodes defined in `shared/src/types.ts`
- **Node content storage** - note bodies live in note subdocs attached under `yDoc.getMap('notes')`:
  - `blockNote` → `noteDoc.getXmlFragment('content')`
- **Prompt loading** - agent/system prompts come from `libs/agent/prompt_manager.ts`; workspaces no longer carry editable prompt docs or a dedicated system canvas.
- **ContentConverter** - Converts between markdown and BlockNote Y.XmlFragment (`shared`)

### Adding a New Node Type

1. `shared/src/types.ts` - Add `FooNodeData` and `FooNode` types, update `XyNode` union
2. `shared/src/workspace/foo-contents.ts` - Storage utilities (follow the note-doc / content-store pattern)
3. `shared/src/index.ts` - Export new types and utilities
4. `shared/src/workspace/converter.ts` - Add case in `parseNodeContent()`
5. `frontend/src/components/canvas/nodes/FooNode.tsx` - React component
6. `frontend/src/components/canvas/CanvasFlow.tsx` - Register in `nodeTypes`
7. Update `WorkspaceDocumentService.createDocument()` if nodes are auto-created
8. Update `agent.ts` if agent needs to read the content

### Logging

Never use `console.log/error` or import global `logger` directly. Inject `ContextualLoggerContract` in services, or use `ContextualLogger.createFallback({ component: 'Name' })` for event listeners and background tasks.

### Error Handling

Prefer standard exception-chain flow. Inner services should usually throw or wrap errors, not `catch + logger.error + throw`. Log and capture once at ownership boundaries such as controllers, Ace commands, event listeners, queue workers, and the global exception handler.

Use `warn` for degraded, recoverable, or intentionally swallowed failures. Use `error` when the operation actually failed and an exception is being surfaced.

When logging unknown errors, always attach a real `Error` object:

```ts
logger.error({ err: toError(error), workspaceId }, 'Failed to sync workspace')
logger.warn({ err: toError(error), workspaceId }, 'Failed to clean up temp directory')
```

Do not log raw `error` values, stringified objects, or message-only fields unless the logger API only accepts strings. Use helpers from `app/services/error_utils.ts`:

- `toError(error)` for logging and wrapping
- `getErrorMessage(error)` or `toError(error).message` for user-facing text or string-only logger APIs

When rethrowing from an inner layer, wrap with `cause` so stack traces and Sentry issues preserve the original exception:

```ts
throw new Error(`Failed to create git commit for workspace ${workspaceId}`, {
  cause: toError(error),
})
```

Do not add extra manual Sentry capture in inner layers just because an error passed through there. Let request/job/listener boundaries capture real exceptions once.

Do not add detached event-dispatch wrappers just to capture dispatch errors. Normal detached dispatch should remain unchanged unless there is a specific failing path that needs different handling.

### Key Services

| Service                    | Purpose                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| `WorkspaceDocumentService` | Create/read/save workspace yDoc                                               |
| `SandboxManager`           | Manage Docker/E2B sandbox for agent file ops                                  |
| `PromptManager`            | Load agent prompts from `libs/agent/prompts/*.md` for runtime prompt assembly |

### Prompt Architecture

**Data flow:**

1. **Prompt load** → `libs/agent/prompt_manager.ts` reads prompt templates from `libs/agent/prompts/*.md`
2. **Agent execution** → `backend/libs/agent/agent.ts` assembles base prompts from disk-backed templates plus runtime context

**Key files:**

- `libs/agent/prompts/default_*.md` - Base prompt templates loaded from disk
- `libs/agent/prompt_manager.ts` - Resolves prompt files and template variables
- `libs/agent/agent.ts:buildSystemPrompts()` - Assembles prompt sections for the main agent and subagents
- `libs/agent/agent.ts:buildContextSection()` - Builds UI context (active canvas, selected nodes) and workspace tree for agent visibility

Workspaces no longer expose editable prompt documents or a special system canvas.

### Sandbox Architecture

- **DockerSandbox** (`libs/agent/sandbox/docker.ts`) - Local dev, uses `docker exec`
- **E2BSandbox** (`libs/agent/sandbox/e2b.ts`) - Production, uses E2B cloud sandboxes
- **E2B SDK gotcha**: `commands.run()` throws `CommandExitError` for non-zero exit codes instead of returning a result. Must catch this exception to get stdout/stderr/exitCode for failed commands.

### Composio Integration

- Composio tools are loaded via MCP in `libs/agent/llm.ts` → `getRouterTools()`
- Tools are merged in `agent.ts:412`: `{ ...tools, ...mcpTools, ...textEditorTools, ...bashTools }`
- **Tool conflict gotcha**: Composio provides its own bash/shell tools that run in their remote sandbox. These must be filtered out in `llm.ts` so the agent uses our E2B sandbox bash (which has yDoc sync).

### Modifying AgentConfig

When adding a new service to the agent, update these files:

1. `libs/agent/types.d.ts` - Add to `AgentConfig` interface
2. `providers/app_provider.ts` - Inject and pass to `new CanvasAgent()`
3. `tests/mocks/canvas_agent.ts` - Add mock to constructor
4. Any test files creating `TestableCanvasAgent`

### Local Agent Logs

In dev mode, all backend logs (including agent execution) are written to `backend/logs/agent.log` as newline-delimited JSON (pino format).

```bash
# Tail agent logs (pretty-printed)
tail -f logs/agent.log | npx pino-pretty

# Search for errors
grep '"level":50' logs/agent.log | npx pino-pretty
```

The `logs/` directory is gitignored (only `logs/.gitignore` is tracked).

### Production Debugging

**Railway CLI** (backend logs):

```bash
cd backend && railway logs --tail 100
```

Useful for: API errors, request patterns, crashes

**E2B CLI** (sandbox logs):

```bash
e2b sandbox list                           # List active sandboxes
e2b sandbox logs <sandboxID> --follow      # Stream logs from sandbox
```

Useful for: Debugging commands inside sandbox, sync runner issues, file system state. Requires an active sandbox.

### Docker Database Access

The postgres container uses user `kanwas` (not `postgres`):

```bash
docker exec kanwas-postgres psql -U kanwas -d kanwas -c "SELECT ..."
```

### Adding Data to Agent Context

To pass new data from frontend to agent (e.g., UI state, selections):

1. `app/validators/agent_invocation.ts` - Add to `invokeValidator` schema
2. `libs/agent/types.d.ts` - Add to `Context` interface
3. `libs/agent/state.ts` - Add to default context in constructor and `clear()`
4. `app/models/invocation.ts` - Add property (with `@column()` for persisted, without for ephemeral)
5. `app/controllers/agent_invocations_controller.ts` - Pass from request to invocation
6. `app/listeners/start_agent.ts` - Include in context object passed to agent
7. `libs/agent/agent.ts` - Use in `buildContextSection()` or elsewhere
8. `frontend/src/providers/chat/hooks.ts` - Send in API call
9. Run `pnpm codegen` to regenerate Tuyau types

### Adding a New Timeline Item Type

To add a new item type to the agent timeline (e.g., skill_created, new_tool_result):

1. `libs/agent/types.d.ts` - Add `FooItem` interface and add to `ConversationItem` union
2. `libs/agent/types.d.ts` - Add event type string to `AgentEventType` union (e.g., `'foo_created'`)
3. `libs/agent/state.ts` - Import `FooItem` and add `Omit<FooItem, 'id'>` to `addTimelineItem` union
4. `frontend/src/components/chat/FooEvent.tsx` - Create React component to render the item
5. `frontend/src/components/chat/Chat.tsx` - Add case in timeline render switch
