# Kanwas: Comprehensive Functional Architecture

## What this system does

Kanwas is a collaborative project operating system for teams working with ideas, documents, and code-like artifacts.

It combines:

- a multiplayer canvas for planning and structuring work,
- rich collaborative documents,
- and an AI agent that can reason and execute actions.

In practice, it enables a full loop: plan visually, execute with AI, and inspect results in real time.

---

## One-line architecture

Kanwas uses a collaborative CRDT workspace as the canonical state, then continuously projects that state to the UI, backend workflows, and an isolated agent filesystem while preserving consistency and observability.

---

## Functional pillars

## 1) Multiplayer collaboration

- Multiple users can edit the same workspace concurrently.
- Changes are conflict-resilient because the model is CRDT-based.
- Canvas structure, document content, and metadata all participate in one shared state graph.
- Presence and shared context are first-class: users see coherent workspace updates as they happen.

## 2) Agent-driven execution

- Users can invoke an AI assistant from inside the workspace.
- The assistant can reason, call tools, run commands in a sandbox, and create or modify artifacts.
- Agent execution is streamed as timeline events so users can observe progress and intent, not just final output.

## 3) Research and integrations

- Long-running research tasks can run externally with streamed progress.
- External tool ecosystems can be connected through integration providers.
- Skill layers provide reusable behavior and guidance for agent operations.

---

## How the system is organized conceptually

```text
Experience Layer
  - Canvas, docs, chat, history

Coordination Layer
  - Real-time collaboration rooms
  - Invocation streams and event fanout

Control Layer
  - Authentication, authorization, orgs
  - Agent orchestration and workflow services

Execution Layer
  - Isolated sandboxes for tool execution
  - Bi-directional filesystem sync

Knowledge Layer
  - Snapshots and version history
```

This layering lets Kanwas behave like a single product while keeping responsibilities clean.

---

## End-to-end functional flows

## Flow A: Human edits shared content

1. A user edits canvas or document content.
2. The change is applied to collaborative state locally.
3. Real-time infrastructure propagates updates to all participants.
4. The UI re-renders affected surfaces with low latency.
5. Background listeners can trigger downstream processing.

Result: one shared reality across all users, with minimal merge friction.

## Flow B: User invokes the AI agent

1. User submits an instruction in chat.
2. Invocation context is assembled (workspace state, relevant settings, skills, prior timeline).
3. Agent enters a reasoning/tool loop.
4. Tool calls execute in isolation and emit structured events.
5. Timeline updates stream back live to the UI.
6. Produced artifacts flow back into workspace state.

Result: AI work is transparent, inspectable, and merged into the same collaborative graph.

## Flow C: Agent modifies files in sandbox

1. Agent writes files in its sandbox filesystem.
2. Filesystem watcher detects create/update/delete events.
3. Sync manager translates filesystem changes into workspace updates.
4. Workspace updates propagate to users in real time.
5. Reverse sync applies non-sandbox updates back to filesystem when needed.

Result: agent can use normal file operations while humans keep a live, structured workspace view.

## Data and state model (functional view)

Kanwas effectively manages several interlinked state classes:

## Collaborative state

- The canonical shared workspace graph (nodes, documents, structure, metadata).
- Optimized for concurrent edits and conflict-free merges.

## Operational state

- Invocation lifecycle, tool call progress, streaming status, and execution metadata.
- Exists to make AI behavior visible and controllable.

## Workspace navigation state

- Active canvas, selected nodes, and other UI context.
- Exists to help users and the agent stay oriented within large workspaces.

## Identity and access state

- Organizations, memberships, invites, and permissions.
- Exists to enforce tenant boundaries and sharing semantics.

These state classes evolve independently but are connected by events.

---

## Collaboration model in depth

The collaboration model is more than socket broadcast:

- It relies on CRDT semantics for conflict tolerance.
- It groups related mutations into transactions for coherent undo behavior.
- It differentiates user-intent changes from system-generated sync changes.
- It supports fragment replacement patterns when data structures require identity refresh.
- It uses room semantics so each workspace is an isolated collaboration domain.

This is why collaborative editing remains stable even with high update velocity.

---

## Agent model in depth

Kanwas treats the agent as an eventful runtime, not a single API call.

## Invocation lifecycle stages

1. Intake and validation.
2. Context loading and prompt assembly.
3. Tool-capable reasoning loop.
4. Streaming event publication.
5. Completion/failure finalization and persistence.

## Capabilities exposed to the agent

- Shell-style execution in sandbox.
- Structured text/file editing operations.
- Subagent delegation for specialized tasks.
- Integration-backed actions when external tools are authorized.

## Why this matters

- Users can see what happened, not just that something happened.
- Platform can apply policy and limits around execution.
- System can preserve a reliable timeline for auditing and debugging.

---

## Sandboxed execution model

The sandbox is intentionally isolated and disposable, but synchronized.

## Design goals

- Safety: autonomous actions do not run directly on production hosts.
- Fidelity: agent gets a real filesystem and command execution environment.
- Continuity: changes are reflected back into collaborative workspace state.

## Sync responsibilities

- Detect local filesystem mutations.
- Map them into workspace-native structures.
- Handle generated metadata updates automatically.
- Accept inbound workspace changes and materialize them back to files.

This bridge is a key differentiator because it supports both visual collaboration and code-like automation.

---

## Event-driven orchestration

Kanwas uses events/listeners/background workers to keep interactive paths fast.

Typical event outcomes:

- coordinate follow-up automation after content changes,
- stream invocation progress to subscribed clients.

Benefits:

- decoupled services,
- lower UI latency,
- easier operational scaling and failure isolation.

---

## Workspace context and retrieval

Kanwas keeps current workspace state and agent-visible context connected:

- active collaboration state stays available in real time,
- agent context assembly pulls the relevant workspace structure into each run.

Practical value:

- agent runs stay grounded in the current workspace structure,
- teams can navigate complex projects through shared context.

---

## Deep research function

For broader internet-scale tasks, Kanwas can orchestrate long-running research executions:

- submit external research job,
- stream intermediate status,
- deliver structured outputs back into workspace artifacts.

This extends the agent from local edits to strategic analysis workflows.

---

## Security and multi-tenant access

Security is integrated into functional boundaries:

- org-scoped data ownership,
- role/membership-based authorization,
- invite-based onboarding flows,
- isolated execution environments for tool runs,
- controlled integration authorization for external systems.

The goal is collaborative openness inside a workspace with strict tenant isolation across workspaces.

---

## Reliability and recovery patterns

Kanwas favors graceful recovery over brittle assumptions:

- stream state so failures are visible,
- decouple heavy processing from interactive edits.

This makes the system more resilient under both human and agent mistakes.

---

## Performance strategy

Performance is addressed at multiple layers:

- UI rerender control for large canvases,
- transaction-based collaborative updates,
- background processing for expensive tasks,
- selective event fanout by workspace rooms,
- asynchronous orchestration for background pipelines.

It is designed to feel responsive while still doing complex distributed work.

---

## Extensibility model

Kanwas is built to grow through composable capability layers:

- shared type/contracts to reduce drift,
- skill system to shape assistant behavior,
- subagent model for specialization,
- integration providers for external actions,
- event hooks for adding new automation workflows.

This allows incremental expansion without re-architecting the core collaboration loop.

---

## What is most technically unique

## 1) CRDT-first + filesystem mirror

Most systems are either document-collaboration-first or code-execution-first. Kanwas combines both by keeping CRDT state canonical while maintaining a live filesystem mirror for agent tooling.

## 2) Human and agent on one shared timeline

The agent does not operate in a hidden background silo. Its actions are streamed as user-visible events and merged into the same workspace graph.

## 3) Product-native observability

Execution visibility is part of UX, not an operator-only feature. Users can understand progress, diagnose stuck states, and make informed interventions.

## 4) Unified workspace memory

Live state and execution context are connected. Teams can move fluidly between editing and inspecting.

---

## Example scenarios this architecture enables

## Scenario 1: Brainstorm to implementation

- Team maps ideas on the canvas.
- Agent turns selected nodes into draft artifacts.
- Artifacts appear immediately for collaborative review.
- Team iterates collaboratively.

## Scenario 2: Knowledge-heavy project onboarding

- Existing workspace structure captures prior decisions.
- New member or agent inspects current artifacts and recent changes.
- Shared context accelerates ramp-up and reduces duplicate work.

## Scenario 3: Research-backed planning

- Team runs long-form research tasks externally.
- Progress streams into workspace.
- Findings become structured inputs to subsequent agent tasks.

---

## Design tradeoffs (intentional)

- CRDT-centric systems are powerful but add complexity in serialization, identity, and undo semantics.
- Bi-directional filesystem sync unlocks agent tooling but requires careful conflict handling.
- Event-driven background workflows improve UX responsiveness but require robust operational monitoring.
- Rich observability increases transparency but raises implementation complexity in timeline/state management.

These tradeoffs are deliberate and aligned with the product goal: safe, collaborative, AI-augmented project execution.

---

## Practical contributor mental model

When adding a feature, reason through these questions:

1. What collaborative state changes are primary?
2. What projections of that state are required (UI, execution, indexing)?
3. Which changes are user-undoable vs system-maintenance?
4. What safety boundary is required (validation, isolation)?
5. What events should be emitted for downstream workflows?

If a change is coherent across those dimensions, it will usually integrate cleanly.

---

## Bottom line

Kanwas is best understood as a collaborative execution substrate:

- live shared state for people,
- autonomous tool use for agents,
- event-driven orchestration for system intelligence,
- and durable memory for trust and continuity.

That combination is what makes it both technically distinctive and practically useful for real team workflows.

---

## Repository layout

Kanwas is a pnpm monorepo.

| Package       | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `frontend/`   | React + TypeScript + Vite app — canvas, docs, chat                          |
| `backend/`    | AdonisJS API server — auth, orgs, agent orchestration, workflow services    |
| `yjs-server/` | Real-time collaboration server (Yjs rooms, WebSockets)                      |
| `shared/`     | Shared types and utilities (workspace types, content converter, path utils) |
| `execenv/`    | Runs inside the sandbox; bi-directional sync between filesystem and yDoc    |
| `cli/`        | `kanwas init/pull/push` — CLI with browser-based OAuth                      |

## Tech stack

- **Frontend:** React, TypeScript, Vite, TanStack Router, BlockNote, Yjs
- **Backend:** AdonisJS, Lucid ORM
- **Realtime:** Yjs + WebSockets
- **Storage:** PostgreSQL, Redis
- **Sandbox:** E2B (cloud) / Docker (local)
- **Agent:** Claude, with tool-use loop and streaming events

---

## Development

The Quickstart in the [README](../README.md) runs the full stack via Docker Compose. For day-to-day development, hot reload is much faster if you run the service you're changing locally and keep everything else in containers.

### Prerequisites

- Node.js 20+, pnpm 9+
- Docker + Docker Compose

### Hybrid mode (recommended for development)

Run infrastructure and the services you're not editing in Docker; run the service you're editing locally with `pnpm dev`.

```bash
pnpm install

# Env files (one-time)
cp backend/.env.example backend/.env          # add ANTHROPIC_API_KEY, APP_KEY, etc.
cp yjs-server/.env.example yjs-server/.env
cp frontend/.env.example frontend/.env

# Example: developing the backend — run everything else in Docker
docker-compose --profile backend up -d
cd backend && pnpm run migrate && pnpm dev    # http://localhost:3333
```

The `backend`, `frontend`, and `yjs-server` profiles each start the dependencies for that service. Swap which service runs locally by stopping its container (`docker-compose stop backend`) and running `pnpm dev` in its directory.

Other services and ports:

- `cd yjs-server && pnpm dev` — `ws://localhost:1999`
- `cd frontend && pnpm dev` — `http://localhost:5173`

### Shared package

After editing `shared/src/`, rebuild before other packages pick up the changes:

```bash
pnpm --filter shared build
```

This is especially important for `execenv` and `backend`, which import the built `shared/dist/` output.

### Tests

```bash
cd backend && pnpm test
cd frontend && pnpm test
```
