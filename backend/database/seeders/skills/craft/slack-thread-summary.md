---
name: slack-thread-summary
description: Distill long Slack threads into actionable summaries. Use when a thread has grown unwieldy and you need to extract what actually matters — the TL;DR, decisions made, action items assigned, and anything that requires follow-up. Turns noisy async discussion into signal.
featured: true
---

# Slack Thread Summary

Turn sprawling Slack threads into crisp summaries. Extract signal from noise.

## What Good Looks Like

- **TL;DR is actually TL** — 2-3 sentences max, captures the core
- **Nothing important missed** — Decisions, commitments, and blockers all captured
- **No filler captured** — Reactions, tangents, and "sounds good" stripped out
- **Action items are actionable** — Owner + what + when, not vague intentions
- **Decisions are definitive** — What was decided, not what was discussed
- **Context preserved** — Someone who missed the thread can catch up

## Process

1. **Read the full thread** — Don't summarize prematurely. Conclusions often come late.

2. **Identify the core question/topic** — What triggered this thread? What was it trying to resolve?

3. **Extract the TL;DR:**
   - What's the one thing someone needs to know?
   - If the thread resolved something, lead with the resolution
   - If unresolved, lead with the open question

4. **Find decisions:**
   - Look for explicit agreements: "Let's go with...", "Agreed", "Decision:"
   - Note who made or approved the decision
   - Distinguish final decisions from proposals still being discussed

5. **Extract action items:**
   - Look for commitments: "I'll...", "Can you...", "Will do", tagged follow-ups
   - Each action needs: owner, task, deadline (if stated)
   - Ignore vague statements like "we should probably..."

6. **Note open items:**
   - Unresolved questions
   - Waiting on external input
   - "Let's discuss in the meeting" deferrals

7. **Skip the noise:**
   - Emoji reactions (unless they represent a vote/approval)
   - Social pleasantries
   - Tangents that went nowhere
   - Repeated information

## Output Format

```
## TL;DR

[2-3 sentences: what was this about and what's the outcome]

## Decisions

- **[Decision]** — [Brief context if needed]
  - Decided by: [Name] | [Date if relevant]

## Action Items

- [ ] **[Task]** — [Owner] | Due: [Date or "not specified"]
- [ ] **[Task]** — [Owner] | Due: [Date or "not specified"]

## Open Items

- [Question or blocker still unresolved]
- Waiting on: [External dependency]

## Key Context

[1-2 bullets of background someone new would need — only if essential]
```

## Before/After Example

### Before (Raw Thread)

```
@channel heads up - the API latency is spiking again

Mike: looking into it now
Sarah: is this related to the cache changes from yesterday?
Mike: possibly, checking the logs
Mike: yeah found it - the cache TTL was set too low, causing constant invalidation
Sarah: should we roll back or fix forward?
Mike: I can push a fix in 10 min, just bumping the TTL to 5min instead of 30sec
Sarah: sounds good, ping me when it's up and I'll verify
James: fyi customers have been complaining in #support
Mike: deployed, should be resolving now
Sarah: confirmed latency is back to normal
Mike: I'll add monitoring for cache hit rate so we catch this earlier
Sarah: good call, can you also update the runbook?
Mike: will do
```

### After (Summary)

```
## TL;DR

API latency spike was caused by cache TTL being too low (30sec instead of 5min). Mike pushed a fix and latency is back to normal.

## Decisions

- **Fix forward rather than rollback** — Faster resolution, root cause was clear
  - Decided by: Sarah + Mike

## Action Items

- [ ] **Add monitoring for cache hit rate** — Mike | Due: not specified
- [ ] **Update runbook with cache debugging steps** — Mike | Due: not specified

## Open Items

None.

## Key Context

This was related to cache changes deployed yesterday. Customer complaints came through #support.
```

## Quality Checks

Before delivering, verify:

- [ ] TL;DR is 2-3 sentences max (actually short, not just "shorter")
- [ ] All decisions are captured — nothing agreed upon is missing
- [ ] All action items have an owner — no orphaned tasks
- [ ] No noise included — tangents, pleasantries, and "+1"s are gone
- [ ] Someone who missed the thread could act on this summary
- [ ] Open items are clearly distinguished from completed decisions

## Common Patterns

**Thread with a question resolved:**

- Lead TL;DR with the answer

**Thread with a question still open:**

- Lead TL;DR with the question and current status

**Thread that wandered off topic:**

- Summarize the main topic; note tangent only if it produced action items

**Thread with implicit decisions:**

- If something was implicitly agreed (no objections to a proposal), note it as a decision but flag as "no explicit approval"

## Handling Edge Cases

| Situation                       | How to handle                                                             |
| ------------------------------- | ------------------------------------------------------------------------- |
| Very long thread (50+ messages) | Group by sub-topic if multiple threads merged                             |
| No clear decision reached       | State "No decision reached" explicitly in Decisions section               |
| Action items without owners     | List under Open Items, flag as "needs owner"                              |
| Thread is mostly noise          | State that explicitly: "Thread was mostly discussion with no conclusions" |
| Multiple decisions              | List all; order by importance                                             |
