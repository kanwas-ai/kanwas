# Replace onboarding `complete_onboarding` with schema-driven inline `suggest_next_tasks`

## Goal and scope

- Remove the onboarding-only `complete_onboarding` tool.
- Add an onboarding-only `suggest_next_tasks` tool.
- Make `suggest_next_tasks` accept suggested tasks directly from the main agent through the tool-call schema.
- Do not make any extra internal model call inside `suggest_next_tasks`.
- Validate and normalize those tasks server-side into the same structure used by existing suggested tasks.
- Show those tasks in a dedicated chat timeline item.
- Keep click behavior identical to current suggested tasks: clicking starts a fresh task.
- If the tool is called with `scope = global`, persist the normalized tasks into the existing workspace suggested-task backend state so they also appear in the Tasks panel.
- Keep the old suggested-task generation flow/infrastructure in the repo, but remove active onboarding call paths to it.

## Current understanding (from explore/general/docs)

- `complete_onboarding` is currently a no-op signal tool exposed only in the onboarding flow.
- The onboarding prompt currently tells the model to call `complete_onboarding` once enough context exists.
- `StartAgent` currently watches tool results for `complete_onboarding` and then triggers background suggested-task generation.
- Agent tools in this repo already use schema-validated structured inputs (`tool({ inputSchema: z.object(...) })`), so the main agent can supply final task data directly in the tool call.
- The old suggested-task generation path is separate from the main invocation:
  - it spins up a dedicated agent flow,
  - uses a dedicated prompt,
  - returns structured tasks,
  - normalizes them,
  - and persists them through `WorkspaceSuggestedTaskService`.
- The existing suggested-task shape is already what we want to reuse after normalization/persistence:
  - `id`
  - `emoji`
  - `headline`
  - `description`
  - `prompt`
  - optional `source`
- Existing normalization logic in the old generator is worth reusing or extracting because it already handles:
  - max task count,
  - text length limits,
  - whitespace cleanup,
  - stable IDs,
  - dedupe behavior.
- The current normalizer expects model-facing task IDs, so the new path needs an extracted draft-input normalizer that derives deterministic IDs server-side from normalized task content rather than reusing raw IDs.
- Existing suggested-task persistence is workspace-wide and replace-oriented:
  - `beginGeneration()` marks loading and clears current tasks
  - `completeGeneration()` stores final tasks
  - `failGeneration()` stores an error and clears tasks
- `beginGeneration()` returns `already_generated` once `generatedAt` is set, so repeated global generation is not currently supported.
- That current loading lifecycle is slightly awkward for the new synchronous tool path because it clears the seeded onboarding card before the final replacement succeeds.
- The Tasks panel already knows how to render these task objects and how to start a fresh task from them.
- There is no existing `suggested_tasks` conversation/timeline item type yet.
- The currently live old onboarding trigger is in `StartAgent`; the later `GenerateSuggestedTasksAfterOnboarding` listener appears to be present but not registered in runtime events.

## Constraints and assumptions

- User decisions:
  - `suggest_next_tasks` is onboarding-only for now.
  - backwards compatibility importance is low; a clean break is preferred.
  - the old suggested-task generation code should stay in the repo but should not be called by the new onboarding path.
  - `suggest_next_tasks` should not do any extra internal model call.
  - the main agent should supply suggested tasks directly through the tool-call schema.
  - the normalized returned tasks should match the existing suggested-task structure/types.
  - if `scope = global`, store those tasks directly into the existing suggested-task backend state.
  - generated tasks should omit `source` so clicks start the normal post-onboarding flow rather than re-entering onboarding.
  - onboarding should keep an explicit `scope` input and prefer `global` by default.
  - the tool-facing schema should let the backend derive IDs server-side rather than asking the model to invent them.
- Planning assumptions for this iteration:
  - `scope = local` means inline timeline-only display with no DB persistence.
  - for `local`, keep the seeded onboarding suggestion in the Tasks panel; only `global` mutates suggested-task backend state.
  - local inline cards may remain clickable after use; no special consumed-state behavior is required in v1.
  - for `global`, keep the current delete-on-start behavior for the persisted Tasks-panel copy after a suggestion is used; the inline timeline item remains as historical record.
  - reuse existing suggested-task storage/state rather than inventing a new store.
- because the current service blocks regeneration after completion, onboarding should instruct the model to call `suggest_next_tasks` at most once and the tool should reject duplicate global generation attempts.
- within a single onboarding invocation, any completed `suggest_next_tasks` call should block all later repeat calls regardless of scope; failed attempts may still be retried.
- if normalized tasks cannot be persisted for `global`, the inline item should also fail so the timeline and Tasks panel stay consistent.
- only successful `global` generation should lock out future global generation; a failed attempt may still be retried.
- because there is no dedicated inner prompt anymore, the onboarding prompt plus tool descriptions must carry the task-quality rubric.
- Keep the old background generation services/flows/listeners available in code, but remove or bypass the onboarding path that reaches them.
- Avoid reviving the previous hidden-subagent design.
- Avoid redesigning the whole Tasks panel or suggested-task storage model.

## Non-goals / out of scope

- A new hidden/internal suggested-task subagent.
- Any `llm.complete(...)` call inside `suggest_next_tasks`.
- Transcript serialization for a second model pass.
- Partial streaming of individual task objects.
- Reworking the old detached suggested-task generator beyond making onboarding stop calling it.
- A new suggested-task DB table or broad storage redesign.
- Broad exposure of `suggest_next_tasks` outside onboarding.

## Options and recommendation

- Option A (recommended): replace `complete_onboarding` with an onboarding-only `suggest_next_tasks` tool whose schema accepts `scope` plus task drafts from the main agent, then server-side validate/normalize them, write a dedicated `suggested_tasks` timeline item, and optionally persist to the existing suggested-task store when `scope = global`.
  - Pros: matches the latest requested architecture, removes the extra model hop, improves speed/caching behavior, and still reuses current storage/types/UI behavior.
  - Cons: requires strong prompt/tool guidance because task quality now depends on the main onboarding agent, not a dedicated secondary prompt.
- Option B: keep `suggest_next_tasks` but still do an internal structured `llm.complete(...)` call.
  - Pros: more isolated suggested-task prompt/rubric.
  - Cons: conflicts with the user's updated request and adds avoidable latency/complexity.
- Option C: keep the old background generator path and only rename the onboarding trigger.
  - Pros: smaller behavioral change.
  - Cons: does not match the requested architecture and keeps the detached generation path in the active onboarding flow.

Recommendation: implement **Option A**.

## Step-by-step plan (high-level, no exact code)

1. Replace the onboarding completion contract

- Remove `complete_onboarding` from onboarding tool registration.
- Add a new onboarding-only `suggest_next_tasks` tool.
- Update the onboarding flow-definition plumbing/tests that currently hard-wire `includeCompleteOnboardingTool` so the old tool is not accidentally still exposed.
- Update onboarding prompt guidance so the model calls `suggest_next_tasks` when it has enough context to propose concrete next tasks, prefers `global`, and calls it at most once.
- Move the task-quality rubric into the onboarding prompt and tool descriptions:
  - suggest a small number of concrete next tasks,
  - keep them actionable and non-overlapping,
  - write clear user-facing headlines/descriptions/prompts,
  - prefer `global` unless a timeline-only suggestion is specifically intended.
- Enforce onboarding-only usage at the same seams that currently expose `complete_onboarding`:
  - tool registration in the onboarding flow,
  - onboarding prompt guidance,
  - and a lightweight runtime guard in the tool so accidental non-onboarding calls fail safely.
- Remove the old `StartAgent` onboarding check that watches for `complete_onboarding` and triggers background generation.

2. Define a schema-driven `suggest_next_tasks` input contract

- Give the tool an explicit schema with:
  - `scope: 'local' | 'global'`
  - `tasks: TaskDraft[]`
- Keep `TaskDraft` model-facing and minimal:
  - `emoji`
  - `headline`
  - `description`
  - `prompt`
- Do not ask the model to provide `id`.
- Do not allow the model to set `source`.
- Use schema field descriptions/tool descriptions to steer the model toward the same limits expected by the existing suggested-task UX.
- Reject empty task lists at schema/validation level rather than silently producing an empty inline item.

3. Normalize and validate server-side before display or persistence

- Reuse or extract the existing normalization rules from `WorkspaceSuggestedTaskGenerationService`.
- Preserve the existing normalization contract, not just the field names:
  - max task count,
  - text-length bounds,
  - whitespace cleanup,
  - stable IDs derived server-side from deterministic normalized content seeds,
  - dedupe/order behavior.
- Convert normalized drafts into the canonical suggested-task shape used by the rest of the app.
- Treat invalid or effectively empty post-normalization output as failure:
  - mark the inline item failed,
  - skip persistence,
  - and surface a useful error instead of silently writing an empty list.

1. Reuse existing suggested-task persistence infrastructure for `global`

- Keep `local` timeline-only with no backend suggested-task mutation.
- For `global`, persist normalized tasks through `WorkspaceSuggestedTaskService` and the existing suggested-task state model.
- Preserve current replace-style semantics for v1 so the Tasks panel behavior stays familiar.
- Prefer a small onboarding-specific atomic replace helper in `WorkspaceSuggestedTaskService` rather than the old `beginGeneration()` / `completeGeneration()` loading lifecycle, because the tool already has final tasks and we do not want failures to clear the seeded onboarding card prematurely.
- Keep the same stored state shape/API surface even if the service gets a new synchronous write helper.
- Make that helper transactional/compare-and-set so concurrent onboarding runs cannot both persist competing `global` suggestions.
- If global persistence fails, also fail the inline timeline item so the chat and Tasks panel do not diverge.
- After successful global persistence, explicitly invalidate/refetch the existing React Query key (`workspaceSuggestedTasksQueryKey(workspaceId)`) so the Tasks panel updates immediately even without the old loading/poll path.
- Keep the old suggested-task generation service code intact, but do not call it from `suggest_next_tasks`.

5. Add a first-class `suggested_tasks` timeline item

- Add a new conversation/timeline item type that contains:
  - status (`loading`, `completed`, `failed`),
  - scope,
  - origin/provenance metadata for inline click behavior (minimum: whether the card is `local` vs `global` and whether a persisted copy exists),
  - normalized tasks,
  - optional error text.
- Update all required type surfaces together:
  - backend internal conversation item types,
  - backend public agent types exported to frontend,
  - `State.addTimelineItem(...)` input union,
  - frontend timeline render switch/components.
- Reuse the existing suggested-task object shape inside that item rather than inventing a different task-card schema.
- Have `suggest_next_tasks` create/update this item directly so the user can see inline suggestion progress/result.
- Use the timeline item as the canonical UI source of truth for inline rendering; the tool result itself can stay a compact acknowledgment string.
- Keep the item in the timeline as the historical record of what was suggested.
- Always show the inline item for both `local` and `global`; `global` additionally persists the same task set into the Tasks panel.

6. Reuse existing click-to-start behavior

- Wire inline suggested-task cards to the same fresh-task `sendMessage(..., invocationId = null, ...)` start path used by current suggested-task clicks.
- Keep the exact behavior of starting a new task through `sendMessage(..., invocationId = null, ...)`.
- Do not pass bare `WorkspaceSuggestedTask` objects into the current shared start/delete path without wrapper context.
- Add a thin adapter/wrapper API for inline suggested-task starts so provenance-based delete behavior cannot regress while still reusing the same fresh-task launch path.
- Do not blindly reuse the current delete side effect for every inline click:
  - `local` inline cards should start work without attempting backend deletion,
  - `global` inline cards should use provenance metadata to decide whether there is a persisted Tasks-panel copy to delete,
  - `global` persisted suggestions should keep current delete-on-start behavior for the Tasks-panel-backed copy.
- For `local`, leave inline cards clickable after use in v1 rather than adding a consumed/disabled state.
- Use the chat UI as the explicit client-side refresh trigger: when a `global` `suggested_tasks` timeline item completes successfully, invalidate/refetch the suggested-task query.

7. Keep the old generator reachable in code but unreachable in product flow

- Remove the active onboarding trigger from `StartAgent`.
- Leave the old generation flow, services, and prompt in place for now.
- Ensure no current onboarding path still calls that old generator, directly or indirectly.
- Explicitly verify that `GenerateSuggestedTasksAfterOnboarding` remains unreachable in runtime for both `local` and `global`; if any registration/path can still fire, guard or disable it for the new onboarding flow.

8. Validate end to end

- Backend coverage should confirm:
  - onboarding exposes `suggest_next_tasks` and no longer exposes `complete_onboarding`
  - onboarding flow-definition plumbing/tests are updated so `complete_onboarding` is not still registered indirectly
  - non-onboarding flows do not expose `suggest_next_tasks`
  - onboarding no longer triggers the old background generation path
  - `suggest_next_tasks` does not call `llm.complete(...)` or any other internal model helper
  - the tool schema accepts task drafts from the main agent directly
  - the backend derives IDs server-side and forbids/omits `source`
  - normalization keeps the current max-count/ID/length/dedupe behavior
  - invalid/empty task drafts become a failed inline item with no persistence
  - duplicate/retried tool calls reuse the same timeline item via tool-call identity
  - a successful `suggest_next_tasks` completion blocks later repeat calls in the same onboarding invocation regardless of scope
  - duplicate `global` generation attempts are rejected safely while retry-after-failure remains possible
  - `global` persists through the existing suggested-task store/state without routing through the old generator
  - `local` stays timeline-only
  - the timeline receives the new `suggested_tasks` item in loading/completed/failed states
- Frontend coverage should confirm:
  - the new timeline item renders correctly
  - inline cards reuse the same start-task behavior as current suggested tasks without accidental delete calls for local-only items
  - persisted global tasks still appear in the Tasks panel
  - successful global persistence triggers a suggested-task query refresh so the Tasks panel updates promptly
- Manual validation should confirm:
  - onboarding now ends by calling `suggest_next_tasks`
  - no background suggested-task generator runs afterward
  - inline tasks look and behave like current suggested tasks
  - global tasks persist and local tasks do not

## Open questions

- None blocking for this planning iteration. Working assumptions:
  - onboarding-only exposure
  - clean break from `complete_onboarding`
  - no internal model call inside `suggest_next_tasks`
  - the main agent supplies tasks directly through the tool schema
  - the tool-facing schema includes `scope` plus task drafts without `id` or `source`
  - the backend derives stable IDs server-side during normalization
  - the timeline item is the canonical inline-rendering payload and is keyed via tool-call identity
  - successful completion of the tool is single-use per onboarding invocation regardless of scope
  - onboarding guidance prefers `global` and calls the tool at most once
  - current normalization semantics are preserved, not just the field names
  - `global` persists through existing suggested-task storage/state
  - `local` remains backend-side-effect free and leaves the seeded onboarding suggestion alone
  - `global` keeps current delete-on-start behavior for the persisted Tasks-panel item
  - local inline cards remain clickable after use in v1
  - persistence failure for `global` should also fail the inline item
  - old generator code remains but is not called by onboarding

## Validation and acceptance criteria

- `complete_onboarding` no longer exists in the onboarding flow.
- `suggest_next_tasks` exists only in the onboarding flow.
- The onboarding prompt tells the model to call `suggest_next_tasks` instead of `complete_onboarding`.
- Onboarding guidance prefers `global` and limits the tool to a single completion-style call.
- The tool also guards against accidental use outside onboarding.
- `suggest_next_tasks` does not make any internal model call.
- The main agent supplies tasks directly through the tool-call schema.
- The backend derives IDs server-side and does not accept `source` from the model.
- The normalized tasks match the current suggested-task structure.
- The normalized tasks also preserve current behavior for limits/IDs/dedupe.
- The chat timeline shows a dedicated `suggested_tasks` item for the result.
- The inline timeline item is keyed idempotently so tool-call retries do not create duplicates.
- The timeline item carries enough provenance metadata to distinguish local-only inline cards from persisted/global suggestions.
- Clicking an inline suggested task starts a fresh task exactly like current suggested-task clicks.
- Local inline clicks do not attempt persisted-suggestion deletion.
- If `scope = global`, the tasks are persisted into the current suggested-task backend state and appear in the Tasks panel.
- Successful global persistence refreshes the Tasks panel promptly.
- Successful global persistence replaces the seeded onboarding suggestion without an intermediate empty/flickering Tasks-panel state.
- If a persisted/global suggestion is used, the Tasks-panel copy still deletes on start like today.
- If `scope = local`, the tasks appear only inline in the timeline.
- Invalid/empty task drafts result in a failed inline item and no persistence.
- Duplicate global generation attempts fail safely instead of overwriting existing generated suggestions.
- The old onboarding-triggered background suggested-task generation path is no longer called.
- The old suggested-task generation infrastructure still exists in the codebase.

## Plan status

- Ready

## Change log

- 2026-03-30: Initial plan focused on reusing onboarding sandbox after `complete_onboarding`.
- 2026-03-30: Plan was later rewritten around a hidden suggested-tasks subagent and dedicated terminal tool.
- 2026-03-30: User scrapped that direction and replaced it with a simpler design: onboarding-only `suggest_next_tasks`, dedicated timeline item, existing suggested-task types, and optional direct persistence to the existing suggested-task store when `scope = global`.
- 2026-03-30: Incorporated review feedback and user answers: generated tasks omit `source`, `local` leaves the seeded onboarding task untouched, local inline cards stay reusable in v1, onboarding-only enforcement is explicit, and invalid/empty structured output is treated as failure.
- 2026-03-30: Updated the plan again so `suggest_next_tasks` no longer makes any internal model call; instead the main agent supplies task drafts via the tool schema, the backend derives IDs server-side, and normalization/persistence stay backend-owned.
- 2026-03-30: Final review tightened idempotency, provenance metadata, atomic global persistence, query refresh wiring, flow-plumbing updates, and no-flicker validation for the seeded onboarding card.
