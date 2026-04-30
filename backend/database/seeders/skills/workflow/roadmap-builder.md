---
name: roadmap-builder
description: Build visual roadmaps with strategic narrative from objectives and initiatives. Use when planning needs to be communicated visually with clear sequencing rationale — not for backlog grooming or sprint planning, but for strategic timeline communication to stakeholders.
featured: true
---

# Roadmap Builder

Map objectives to a timeline with clear strategic narrative. The output is a visual roadmap plus the "why this sequence" explanation.

## What This Orchestrates

1. **Scope framing** — Establish horizon, audience, and certainty level
2. **Input gathering** — Collect objectives, initiatives, and constraints
3. **Dependency mapping** — Identify what blocks what
4. **Sequencing** — Order by priority and dependencies
5. **Visualization** — Create the roadmap artifact
6. **Narrative** — Write the strategic explanation

## Process

### 1. Frame the Roadmap

Ask or infer:

- **Planning horizon** — Quarter? Year? Multi-year?
- **Audience** — Team (detailed), leadership (strategic), external (high-level)?
- **Certainty gradient** — What's committed vs. planned vs. exploratory?

If not provided, ask before proceeding. These shape everything.

### 2. Gather Inputs

Collect from the user:

- **Objectives** — What outcomes matter?
- **Initiatives** — What work achieves those outcomes?
- **Constraints** — Fixed dates, resource limits, external dependencies?
- **Current state** — What's already in flight?

Organize into a working list. Don't sequence yet.

### 3. Map Dependencies

For each initiative, identify:

- What must happen first (blockers)
- What it enables (unlocks)
- External dependencies (other teams, vendors, events)

Create a dependency graph — even if simple. This prevents impossible sequences.

### 4. Sequence

Order initiatives by:

1. **Hard constraints** — Fixed dates, external deadlines
2. **Dependencies** — Blockers before blocked
3. **Strategic priority** — Higher impact earlier (when dependencies allow)
4. **Resource reality** — Parallel work only if capacity exists

Flag conflicts explicitly: "X is higher priority but blocked by Y"

### 5. Create Visual Roadmap

Build the visual artifact. Format depends on audience:

**For text-based output (default):**

```
Q1 2024              Q2 2024              Q3 2024
|---- Initiative A --|
                     |---- Initiative B --|
|--------------- Initiative C (ongoing) --------------|
                                          |-- Init D --|
```

**Swimlane variant (multiple workstreams):**

```
                    Q1         Q2         Q3
Platform:           [====A====][====B====]
Product:            [==C==]    [====D========]
Infrastructure:     [======E======]
```

**Indicate certainty:**

- Solid/committed: `[====]` or bold
- Planned: `[----]` or normal
- Exploratory: `[.......]` or italic

### 6. Write Strategic Narrative

Explain the sequence. Cover:

- **Why this order** — The logic behind sequencing
- **Key dependencies** — What unlocks what
- **Risks to timeline** — What could shift things
- **Flexibility points** — Where order could change

Keep it concise. One paragraph per major sequencing decision.

## Adapts To

**Audience type:**

- Team → Show all initiatives, dependencies, and details
- Leadership → Show themes and strategic bets, hide implementation detail
- External → Show outcomes and rough timing, hide internal dependencies

**Planning horizon:**

- Quarter → Week or sprint granularity, higher certainty
- Year → Month or quarter granularity, certainty gradient
- Multi-year → Quarter or half granularity, mostly directional

**Certainty level:**

- High certainty → Specific dates, commitments clear
- Mixed → Now/Next/Later buckets, committed vs. planned distinction
- Low certainty → Themes and directions, explicit "this will change"

**Format constraints:**

- Text-only → ASCII timeline (as shown above)
- Markdown → Tables with visual indicators
- Presentation → Describe slide layout, suggest tool (Mermaid, etc.)

## Quality Checks

Before delivering, verify:

- [ ] **Sequence logic is explicit** — "Why this order" is answered
- [ ] **Dependencies are visible** — Blockers and unlocks clear
- [ ] **Certainty is indicated** — What's committed vs. planned vs. maybe
- [ ] **Horizon matches request** — Not too granular or too vague for timeframe
- [ ] **Audience-appropriate** — Right level of detail for who's reading
- [ ] **Conflicts surfaced** — Priority vs. dependency tensions called out
- [ ] **Narrative matches visual** — Story and diagram tell same story

## Anti-Patterns

Avoid these common roadmap failures:

- **Feature parking lot** — List without sequence or rationale
- **False precision** — Specific dates on uncertain items
- **Missing dependencies** — Sequences that can't actually happen
- **One-size narrative** — Same detail level for all audiences
- **Static assumption** — No acknowledgment that plans change
