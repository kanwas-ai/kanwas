---
name: decision-log
description: Capture decisions and their rationale from discussions, meetings, or Slack threads before the context is lost. Use when a decision was just made (or is being made) and you need to document why, what alternatives were considered, and what constraints shaped the choice. Preserves the "why" that's always forgotten.
---

# Decision Log

Extract and document decisions from discussion context. The goal is capturing rationale that will matter in 6 months when someone asks "why did we do it this way?"

## What Good Looks Like

- **Decision stated clearly** — One sentence, unambiguous
- **The "why" is explicit** — Not just what was decided, but reasoning behind it
- **Alternatives acknowledged** — What was considered and rejected (and why)
- **Constraints captured** — What shaped the decision (time, budget, people, tech)
- **Context preserved** — Enough that someone unfamiliar can understand
- **Dated** — When was this decided (decisions age)
- **Participants noted** — Who was involved in the decision

## What This Is NOT

- Not a decision-making framework (use decision-doc for that)
- Not a proposal or recommendation
- Not a detailed analysis of options
- This is a record of a decision that was made

## Process

1. **Identify the decision**
   - What was actually decided? State it in one sentence.
   - If multiple decisions, create separate entries.

2. **Extract the rationale**
   - Why this choice over alternatives?
   - What reasoning was most compelling?
   - What evidence or experience informed this?

3. **Note what was rejected**
   - What alternatives were considered?
   - Why were they ruled out? (even briefly)

4. **Capture constraints**
   - What limits shaped this decision?
   - Time pressure, budget, technical debt, team capacity, dependencies?

5. **Record the context**
   - What problem was this solving?
   - What triggered the need for a decision now?

6. **Note participants and date**
   - Who made or influenced this decision?
   - When was it made?

## Output Format

```markdown
## Decision: [Clear statement of what was decided]

**Date:** [YYYY-MM-DD]
**Participants:** [Who was involved]
**Status:** [Decided | Revisiting | Superseded by X]

### Context

[1-2 sentences: What problem or situation required this decision]

### Decision

[1-2 sentences: What was decided, stated clearly]

### Rationale

[Why this choice — the reasoning that made this the right call]

### Alternatives Considered

- **[Alternative 1]:** [Why rejected — 1 sentence]
- **[Alternative 2]:** [Why rejected — 1 sentence]

### Constraints

[What shaped or limited the decision — time, budget, people, tech]

### Consequences

[Expected outcomes, tradeoffs accepted, things to watch]
```

## Example

### Before (discussion context)

> From Slack thread:
>
> Sarah: we need to decide on the API versioning approach before the launch
> Mike: I vote for URL versioning (/v1/, /v2/) - it's what everyone expects
> Sarah: header versioning is cleaner though, no URL pollution
> Mike: true but our clients are mostly external devs, they'll expect URL
> Sarah: fair point. Let's do URL versioning. We can always add header support later if needed
> Mike: agreed. documenting this somewhere?
> Sarah: yeah I'll add it to the arch docs

### After (decision log entry)

```markdown
## Decision: Use URL-based API versioning (/v1/, /v2/)

**Date:** 2024-01-15
**Participants:** Sarah (Tech Lead), Mike (Backend)
**Status:** Decided

### Context

Needed to finalize API versioning strategy before public API launch. External developers will consume this API.

### Decision

API versions will be specified in the URL path (e.g., /v1/users, /v2/users) rather than request headers.

### Rationale

External developers are the primary consumers, and URL versioning matches their expectations. Discoverability and ease of use outweigh the "cleaner" header approach for this audience.

### Alternatives Considered

- **Header versioning (Accept-Version header):** Rejected — Less familiar to external developers, harder to test in browser, adds friction.
- **Query parameter (?version=1):** Not discussed — Generally considered poor practice for this use case.

### Constraints

- Launch deadline required a quick decision
- Primary audience is external developers (not internal services)

### Consequences

- URLs will include version prefix permanently
- Can add optional header support later without breaking URL approach
- Need to document versioning policy and deprecation timeline
```

## Quality Checks

Before finalizing:

- [ ] **Decision is unambiguous** — A reader knows exactly what was decided
- [ ] **Rationale explains "why"** — Not just restating the decision
- [ ] **At least one alternative noted** — Shows options were considered
- [ ] **Constraints are specific** — Not generic ("we had limited time")
- [ ] **Date is included** — Decisions need timestamps
- [ ] **Participants are named** — Accountability and future questions
- [ ] **Standalone readability** — Someone unfamiliar could understand this

## Anti-Patterns

- **Recording without rationale** — "We decided X" without "because Y"
- **Vague alternatives** — "We considered other options" (which ones?)
- **Missing constraints** — Makes decisions seem arbitrary in hindsight
- **No date** — Decisions age; what was right in 2023 may not be right in 2025
- **Too much detail** — This is a log entry, not a design doc
