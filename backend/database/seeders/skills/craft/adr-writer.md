---
name: adr-writer
description: Create Architecture Decision Records that capture the context, decision, and consequences of significant technical choices. Use when documenting why a particular approach was chosen over alternatives, when future developers need to understand the reasoning behind a system design, or when stakeholders need a record of architectural commitments.
featured: true
---

# ADR Writer

Transform technical decision context into Architecture Decision Records that capture not just what was decided, but why it made sense at the time.

## What Good Looks Like

- **Specific title** — Names the decision, not the topic ("Use PostgreSQL for event storage" not "Database selection")
- **Rich context** — Forces and constraints that shaped the decision, not project history
- **Clear decision statement** — One sentence stating what will be done
- **Honest consequences** — Both positive and negative, including what becomes harder
- **Right scope** — One decision per ADR, linked to related ADRs when needed
- **Time-stamped understanding** — Captures what was known when the decision was made

## What Separates Good ADRs from Bad Ones

**Bad ADRs:**

- Read like post-hoc justification for a choice already made
- List only benefits (no tradeoffs acknowledged)
- Context is either missing or contains irrelevant history
- Decision is buried in paragraphs of explanation
- Consequences are vague ("improves performance")

**Good ADRs:**

- Honestly capture the forces that led to the decision
- Acknowledge what was given up and what becomes harder
- Someone new could understand why this made sense
- Decision is immediately clear
- Consequences are specific and testable

## Process

1. **Identify the decision**
   - What architectural choice was made?
   - State it as a complete sentence: "We will [do X]"
   - If you can't state it clearly, the decision isn't ready to document

2. **Capture the context**
   - What forces led to this decision?
   - Technical constraints (performance, scale, existing systems)
   - Business constraints (timeline, budget, team skills)
   - What alternatives were considered?
   - What was unknown or uncertain?

3. **State the decision**
   - One sentence: "We will [specific action]"
   - Follow with 2-3 sentences of immediate rationale
   - Do not repeat the context

4. **Document consequences**
   - Positive: What becomes easier or possible?
   - Negative: What becomes harder or impossible?
   - Neutral: What changes that's neither good nor bad?
   - Be specific — "increases cold start time by ~2s" not "may impact performance"

5. **Add metadata**
   - Status: Proposed, Accepted, Deprecated, Superseded
   - Date: When the decision was made
   - Deciders: Who made or approved this decision

## Output Structure

```markdown
# ADR-[number]: [Decision Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Date

[YYYY-MM-DD]

## Deciders

[Names or roles of decision-makers]

## Context

[2-4 paragraphs describing:

- The situation requiring a decision
- Forces and constraints (technical, business, team)
- Alternatives that were considered
- What was uncertain at the time]

## Decision

We will [specific architectural choice].

[2-3 sentences of immediate rationale — why this choice given the context above]

## Consequences

### Positive

- [Specific benefit 1]
- [Specific benefit 2]

### Negative

- [Specific tradeoff 1]
- [Specific tradeoff 2]

### Neutral

- [Change that's neither good nor bad]

## Related ADRs

- [ADR-XXX: Related decision] (if applicable)
```

## Example

### Before (raw input)

> We spent last week debating whether to use GraphQL or REST for the new API. The frontend team really wanted GraphQL because they're tired of over-fetching, but ops is worried about caching and complexity. We decided to go with REST but with a BFF pattern. Tom made the call.

### After (structured ADR)

```markdown
# ADR-0023: Use REST with Backend-for-Frontend Pattern for Customer API

## Status

Accepted

## Date

2024-01-15

## Deciders

Tom Chen (Principal Engineer), API Team

## Context

The new Customer API needs to serve both our web dashboard and mobile apps. The frontend team has experienced friction with existing REST APIs due to over-fetching — mobile screens need only a subset of the data that web views require, leading to wasted bandwidth and slower load times on mobile.

GraphQL was proposed as a solution, offering client-specified queries that would solve the over-fetching problem. However, the operations team raised concerns: our CDN caching strategy relies on URL-based cache keys, GraphQL's POST-based queries would require significant cache infrastructure changes, and the team has no production GraphQL experience.

A Backend-for-Frontend (BFF) pattern was proposed as an alternative — separate REST endpoints optimized for each client's specific needs, with shared core services underneath.

Timeline pressure exists: the mobile app launch is in 8 weeks.

## Decision

We will use REST APIs with a Backend-for-Frontend pattern, creating separate API layers for web and mobile clients.

This preserves our existing caching infrastructure and ops tooling while solving the over-fetching problem through purpose-built endpoints. The 8-week timeline doesn't allow for the learning curve GraphQL would require.

## Consequences

### Positive

- Existing CDN caching continues to work without changes
- Team can start immediately with familiar patterns
- Each client gets exactly the data shapes it needs
- Mobile API can be optimized for bandwidth constraints

### Negative

- Two API surfaces to maintain instead of one
- Risk of logic duplication between BFFs if not careful
- Frontend team doesn't get GraphQL experience they wanted
- May need to revisit if we add more client types (watch app, third-party)

### Neutral

- Shared core services layer required regardless of choice
- API versioning strategy applies to both BFFs independently

## Related ADRs

- ADR-0019: Shared Service Layer Architecture
- ADR-0021: Mobile App Technology Stack
```

## Quality Checks

Before delivering:

- [ ] **Title names the decision** — Not just the topic area
- [ ] **Context explains forces** — Technical, business, and team constraints
- [ ] **Alternatives mentioned** — What else was considered?
- [ ] **Decision is one clear sentence** — Starts with "We will..."
- [ ] **Consequences include negatives** — What becomes harder?
- [ ] **Consequences are specific** — Not vague platitudes
- [ ] **Future reader test** — Would someone in 2 years understand why this made sense?

## Common Mistakes

**Context is missing or too brief:**

- Bad: "We needed a database."
- Good: "User growth projections suggest 10x data volume in 18 months. Current MySQL instance is at 70% capacity..."

**No negative consequences listed:**

- Bad: [Only benefits listed]
- Good: "Negative: Adds ~200ms latency to cross-region requests. Team must learn new query patterns."

**Decision buried in prose:**

- Bad: "After considering many factors and discussing with the team, we thought it might be best to..."
- Good: "We will use PostgreSQL for event storage."

**Consequences are vague:**

- Bad: "Improves developer experience"
- Good: "Reduces deployment time from 45 minutes to under 5 minutes"
