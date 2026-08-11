# PostHog LLM Tracing Migration

## Goal and scope

- Replace Langfuse tracing in `backend/libs/agent/` and `backend/app/listeners/start_agent.ts` with PostHog-based LLM tracing.
- Preserve and improve current observability coverage: root agent execution, subagent execution (`explore` and `external`), LLM generations, tool costs, and sandbox costs.
- Attach user/session/workspace/organization context to each trace path, with PostHog-native grouping and properties.
- Perform a hard cutover (remove Langfuse runtime wiring and dependencies used by this flow).
- Reuse the existing `backend/app/services/posthog_service.ts` singleton for all agent tracing (no separate PostHog client rollout).

## Current understanding (from explore/general/docs)

- Current tracing is split between explicit Langfuse observations (`runWithAgentTrace`, `runWithSubagentTrace`, `withCostTracking`) and Vercel AI `experimental_telemetry` spans exported through OTel Langfuse exporter.
- Current tracing already includes subagent paths (`subagent/explore.ts`, `subagent/external.ts`) and must keep that parity after migration.
- Agent context currently includes `invocationId` and `langfuseSessionId` (root invocation id), but not `organizationId`.
- `StartAgent` can derive root invocation ID and already has `workspaceId` and `userId`; `organizationId` is available from workspace or HTTP context pipeline.
- Existing PostHog client lifecycle is already centralized via `PostHogService` singleton + app shutdown hook, and should be reused.
- PostHog LLM analytics supports:
  - automatic model instrumentation using `@posthog/ai` wrappers (`withTracing`) for Vercel AI model calls,
  - manual AI events (`$ai_generation`, `$ai_span`, `$ai_trace`) with linked IDs,
  - user linkage (`distinct_id`), AI sessions (`$ai_session_id`), and group analytics (`organization`, `workspace`) plus custom properties.
- Docs caveat: `withTracing` binds options at wrap-time, so dynamic invocation/subagent linkage requires wrapping models per invocation/subagent execution (not once in constructor).
- Manual capture docs define required fields per event type, which we should use as the canonical schema for manual fallback paths.

## Constraints and assumptions

- User decisions:
  - Backwards compatibility priority: **PostHog-native redesign** (not strict Langfuse parity).
  - Migration mode: **hard cutover**.
  - Privacy mode: **capture content** (input/output enabled).
  - No new PostHog env rollout in this migration; reuse existing PostHogService configuration.
  - PostHog project scope: **same project** for existing backend analytics and new LLM tracing.
- Trace identity: use **`invocationId` as `$ai_trace_id`**.
- Cost shape: represent non-LLM costs as **AI span events** linked to the same trace.
- Group handling: use **strict PostHog groups** (`organization`, `workspace`) and include these IDs on all events.
- Trace threading assumption: continue using root invocation id as the conversation-level AI session id.
- Runtime behavior assumption: observability is fail-open (agent execution must not fail because PostHog emit fails).
- Organization context assumption: `organizationId` is always available for agent invocations.
- Canonical organization source in async listener path: resolve from `Workspace` via `invocation.workspaceId` (with event context only as optional shortcut).
- If `organizationId` is unexpectedly missing at runtime, skip trace emission for that invocation, log/metric it, and continue execution.

## Non-goals / out of scope

- Reworking non-agent analytics event taxonomy beyond what is required to support this migration.
- Frontend replay linkage (`$session_id`) unless already present in request context.
- Historical dashboard/data migration in PostHog for old Langfuse events.
- Refactoring existing PostHogService credential/config style as part of this migration.

## Options and recommendation

- Option A: PostHog wrapper-only (`withTracing`) and no explicit custom spans.
  - Pros: simplest LLM call coverage.
  - Cons: weaker parity for current root/subagent/tool-cost lifecycle spans.
- Option B: Full manual capture only (`posthog-node capture`) for everything.
  - Pros: maximum control.
  - Cons: more code, harder token/cost parity for model calls.
- Option C (recommended): Hybrid PostHog-native approach.
  - Use `@posthog/ai` `withTracing` for LLM generation capture.
  - Use explicit trace/span/cost events for agent/subagent/tool/sandbox lifecycle where needed.

Recommendation: implement Option C.

## Step-by-step plan (high-level, no exact code)

1. Reuse PostHogService as the single tracing client (no new client path)

- Expand `backend/app/services/posthog_service.ts` with generic AI capture methods so agent code can emit trace/span/generation events via the existing singleton.
- Keep `trackWorkspaceViewed` behavior intact while adding reusable methods for agent observability.
- Add a service-owned tracing facade API (for example: `wrapModelWithTracing(...)`, `captureAiTrace(...)`, `captureAiSpan(...)`, `captureAiGeneration(...)`) so agent code does not instantiate or own additional PostHog clients.
- Inject `PostHogService` into `CanvasAgent` through `AgentConfig` + `AppProvider` (same dependency threading pattern as other services).
- Update test scaffolding that directly constructs/mocks `CanvasAgent` to include the new dependency.

2. Define an explicit docs-backed trace hierarchy contract

- Invocation identity:
  - `$ai_trace_id` = `invocationId`.
  - `$ai_session_id` = root invocation id.
  - `distinct_id` = `userId`.
  - `groups` = `{ workspace: workspaceId, organization: organizationId }` on every emitted event.
- Main/subagent hierarchy:
  - main run emits a unique main span (`$ai_span_id`, `$ai_span_name: "main-agent"`, parent = trace).
  - each subagent run emits its own span (`$ai_span_name: "subagent-explore"` / `"subagent-external"`, parent = main span).
  - generations are linked to the active span via `$ai_parent_id`.
- Add an explicit runtime `TraceContext` carrier (stored in tool/agent execution context) with at least:
  - `traceId`, `sessionId`, `mainSpanId`, `activeParentSpanId`, `subagentId`, `toolCallId`.
  - This context is propagated through `start_task -> llm.runSubagent -> runExploreAgent/runExternalAgent -> tool executes` so parent linkage is deterministic.
- Manual schema baseline (from docs) for fallback paths:
  - `$ai_generation`: include all documented required fields.
  - `$ai_span`: include all documented required fields.
  - `$ai_trace`: include all documented required fields.

3. Implement main-agent LLM tracing with invocation-scoped wrappers

- Replace Langfuse agent wrapper with PostHog trace/span lifecycle wrapper.
- Wrap model per invocation using `withTracing(model, posthogClient, options)` so dynamic options are correct each run.
- Set wrapper options with strict groups and linkage properties (`posthogDistinctId`, `posthogTraceId`, `posthogGroups`, `posthogProperties` including `$ai_session_id` and `$ai_parent_id`).
- Cover both ToolLoopAgent path and direct `generateText` path (`LLM.complete`) with the same linkage model.
- If wrapper output is insufficient for strict group/linking guarantees on a path, emit manual `$ai_generation` for that path.
- Deduplication rule: disable/replace existing `experimental_telemetry` path for migrated calls to avoid double generation events.

4. Add SDK compatibility preflight gate before hard cutover

- Add `@posthog/ai` and verify compatibility against current backend `ai` SDK usage before removing Langfuse paths.
- Validate required generation metadata/linkage/cost fields from wrapper output on representative main + subagent runs.
- If wrapper compatibility is insufficient, keep manual `$ai_generation` fallback as the primary path for affected calls and continue cutover.

5. Implement subagent linkage concretely (explore + external)

- Replace `runWithSubagentTrace` with PostHog subagent span lifecycle (start, success/failure, latency, input/output).
- Before each subagent run, create `subagentSpanId` and pass it into the subagent model wrapper options as `$ai_parent_id`.
- Ensure `runExploreAgent` and `runExternalAgent` each wrap their model instance per subagent run (not globally), with trace/session/groups copied from current invocation context.
- On subagent failures, set `$ai_is_error`/`$ai_error` on terminal subagent span; for user-cancelled paths capture explicit cancellation status property.

6. Migrate tool and sandbox cost tracking to linked AI spans

- Replace Langfuse `withCostTracking` behavior with PostHog `$ai_span` cost events.
- Emit cost spans for `web_search`, `web_fetch`, and sandbox session using:
  - `$ai_trace_id`, `$ai_session_id`, `$ai_span_id`, `$ai_parent_id`, `$ai_span_name`,
  - custom cost properties (`cost_usd`, `cost_source`, and relevant provider metadata).
- Replace static module-load cost wrappers with runtime cost emitters that read the active `TraceContext`, so costs inherit correct parent span in concurrent runs.
- Ensure cost spans attach to the active parent span (main or subagent), never as orphan events.

7. Expand execution context for strict groups and session linkage

- Update `StartAgent` execution context to include `organizationId` alongside existing IDs.
- Rename and migrate `langfuseSessionId` context to PostHog-neutral `aiSessionId` across agent types/state/call sites.
- Keep root invocation traversal for conversation session grouping.

8. Hard cutover cleanup (Langfuse removal, no new PostHog env rollout)

- Remove Langfuse imports/usages from target agent paths and subagent paths.
- Remove Langfuse OTel exporter bootstrap/dependencies if unused after migration.
- Remove Langfuse-required env validation/startup requirements.
- Audit and remove residual Langfuse runtime artifacts (for example `backend/libs/langfuse_client.ts`) if not used by any remaining runtime path.
- Keep a dependency/config audit so no partial dual-stack remnants remain.

9. Update scripts and compatibility call sites

- Update local scripts/commands that build agent context for renamed session field and added organization/group context.
- Keep naming coherent by removing `langfuse*` terms from active runtime flow.

10. Validate and verify behavior

- Run typecheck/build to catch dependency/context regressions.
- Validate one main-agent run and both subagent types (`explore`, `external`) in PostHog UI:
  - generations present,
  - trace/session linkage present,
  - strict groups present (`organization`, `workspace`),
  - custom IDs (`invocation_id`, `correlation_id`) present,
  - tool + sandbox cost spans present.
- Validate subagent spans are nested under the same invocation trace.
- Validate no duplicate generation events from overlapping instrumentation.
- Validate cancel/error paths emit terminal spans and tracing failures remain fail-open for execution.
- Validate PostHog singleton shutdown still flushes queued events.
- Add automated assertions for trace-context propagation (`$ai_trace_id`, `$ai_session_id`, `$ai_parent_id`, groups) on main + subagent flows.
- Add automated assertion that migrated paths do not double-emit generations.
- Add monitoring check for missing-organization tracing skips (target: zero under normal production behavior).

## Risks and edge cases

- Duplicate telemetry if Vercel `experimental_telemetry` and PostHog wrapper both emit overlapping LLM events.
- Missing `organizationId` in async listener context if not consistently propagated/derived.
- Ingestion schema drift if required `$ai_*` fields are omitted on manual capture events.
- Sensitive content visibility due to capture-content default; may need targeted redaction later.
- Async flush reliability on process shutdown if PostHog client lifecycle is not consistently closed.
- Wrapper compatibility risk between current `ai` package version and `@posthog/ai` adapter.
- Group propagation risk for auto-captured wrapper events under strict group requirements.
- `withTracing` wrap-time option semantics can mis-link spans if models are reused across invocations without per-run wrapping.

## Open questions

- None currently blocking.

## Validation and acceptance criteria

- No active Langfuse imports/usages remain in the targeted agent execution path.
- Agent execution and subagent runs appear in PostHog LLM analytics with linked traces/sessions.
- Both subagent types (`explore`, `external`) are captured with trace linkage and required group context.
- Each trace path includes user linkage (`distinct_id`), `workspace_id`, and `organization_id`.
- Subagent events include stable correlation fields (`subagent_id`, and tool-call correlation where available) for timeline ↔ trace debugging.
- Tool and sandbox costs are captured and queryable.
- Backend boot works without required Langfuse env vars while continuing to use the existing PostHogService configuration.
- Automated checks verify required trace/link/group fields for main + subagent paths and verify no duplicate generation emission on migrated paths.
- Missing-organization tracing skip metric remains at zero in normal operation (or is explicitly investigated when non-zero).

## Docs references

- https://posthog.com/docs/llm-analytics/start-here
- https://posthog.com/docs/llm-analytics/generations
- https://posthog.com/docs/llm-analytics/traces
- https://posthog.com/docs/llm-analytics/spans
- https://posthog.com/docs/llm-analytics/sessions
- https://posthog.com/docs/llm-analytics/custom-properties
- https://posthog.com/docs/llm-analytics/calculating-costs
- https://posthog.com/docs/llm-analytics/privacy-mode
- https://posthog.com/docs/llm-analytics/errors
- https://posthog.com/docs/llm-analytics/installation/vercel-ai
- https://posthog.com/docs/llm-analytics/manual-capture
- https://posthog.com/docs/llm-analytics/installation/manual-capture
- https://posthog.com/docs/references/posthog-node
- https://posthog.com/docs/product-analytics/group-analytics
- https://posthog.com/docs/api/capture

## Plan status

- Ready

## Change log

- 2026-02-17: Initial plan created from repo exploration + deep PostHog docs crawl + user intake decisions.
- 2026-02-17: Incorporated edge/reflection feedback and locked decisions for trace IDs, cost event shape, and strict groups.
- 2026-02-17: Clarified implementation should reuse existing `PostHogService` client (no separate tracing client).
- 2026-02-17: Added explicit PostHog documentation reference list used for migration design.
- 2026-02-17: Expanded subagent parity requirements (explore/external coverage, trace linkage, strict-group fallback strategy).
- 2026-02-17: Added concrete docs-backed implementation design for PostHogService reuse, per-subagent parent/child linkage, and invocation-scoped `withTracing` wrapping.
- 2026-02-17: Added explicit tracing facade contract on PostHogService, TraceContext propagation plan, deduplication rule, and runtime cost-parent linkage details.
- 2026-02-17: Added compatibility preflight gate for `@posthog/ai`, explicit organization source policy, and automated validation/monitoring requirements.
