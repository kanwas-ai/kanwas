---
name: assumption-validator
description: Design lightweight experiments to validate critical assumptions before committing resources. Use when starting a new initiative, feature, or project where success depends on unproven assumptions about users, technology, or business viability. Surfaces hidden risks early by turning assumptions into testable hypotheses.
---

# Assumption Validator

Transform implicit assumptions into explicit, testable hypotheses. Design minimal experiments that produce evidence, not opinions.

## What This Orchestrates

1. **Surface** — Extract hidden assumptions from plans, PRDs, or proposals
2. **Prioritize** — Rank by risk (what happens if wrong?) and uncertainty (how confident are we?)
3. **Design** — Create lightweight experiments with clear success criteria
4. **Execute** — Run experiments, capture results
5. **Update** — Adjust confidence levels and next steps based on evidence

## Process

### 1. Extract Assumptions

Ask: "What must be true for this to succeed?"

Categories to probe:

- **Desirability** — Do users want this? Will they use it?
- **Feasibility** — Can we build this? Do we have the skills/tech?
- **Viability** — Does this make business sense? Can we sustain it?

Format each assumption:

```
Assumption: [Statement that must be true]
Category: [Desirability | Feasibility | Viability]
Current confidence: [High | Medium | Low]
Evidence: [What we know now, if anything]
```

### 2. Prioritize

Score each assumption:

| Factor                  | Question                  |
| ----------------------- | ------------------------- |
| **Impact if wrong**     | What breaks? How badly?   |
| **Current uncertainty** | How much are we guessing? |
| **Reversibility**       | Can we recover if wrong?  |

Focus on: High impact + High uncertainty + Low reversibility

Skip validation for: Low impact or already have strong evidence

### 3. Design Experiments

For each high-priority assumption, design a test:

```
Experiment: [Name]
Tests assumption: [Which one]
Method: [What we'll do]
Success criteria: [Specific, measurable outcome]
Failure criteria: [What would disprove the assumption]
Time/cost: [Resources needed]
```

Experiment types by category:

**Desirability:**

- User interviews (5-8 people, specific questions)
- Landing page tests (measure signups, not clicks)
- Prototype walkthroughs (observe behavior, not just feedback)
- Concierge tests (do it manually first)

**Feasibility:**

- Spike/proof of concept (time-boxed technical exploration)
- Expert consultation (find someone who's done it)
- Component testing (isolate the risky piece)

**Viability:**

- Unit economics modeling (with real numbers)
- Competitor analysis (who's doing this, what happened)
- Pilot with pricing (test willingness to pay)

### 4. Define Success Criteria

Bad: "Users like it"
Good: "5 of 8 users complete the task without asking for help"

Bad: "Technically possible"
Good: "Spike achieves <200ms response time with 1000 concurrent users"

Bad: "Makes business sense"
Good: "CAC < $50, LTV > $150 based on pilot data"

### 5. Run and Record

For each experiment:

```
Experiment: [Name]
Date: [When run]
Result: [What happened]
Evidence: [Specific observations/data]
Conclusion: [Validated | Invalidated | Inconclusive]
New confidence: [High | Medium | Low]
Next action: [What this means for the project]
```

### 6. Update the Plan

Based on results:

- **Validated** — Proceed with confidence, document evidence
- **Invalidated** — Pivot, scope change, or kill the initiative
- **Inconclusive** — Design better experiment or accept the risk

## Adapts To

**Early stage (idea/concept):**

- Focus on desirability assumptions first
- Favor quick, cheap experiments (interviews, landing pages)
- Accept higher uncertainty tolerance

**Mid stage (committed but not shipped):**

- Focus on feasibility and viability
- Spikes and pilots become more important
- Tighter success criteria needed

**High stakes (big investment, hard to reverse):**

- Test all three categories
- Multiple experiments per critical assumption
- Require stronger evidence before proceeding

**Resource constrained:**

- Combine experiments where possible
- Prioritize ruthlessly (top 3 assumptions only)
- Accept calculated risks on lower-priority items

**Time pressure:**

- Parallel experiments where possible
- Set hard timebox for validation phase
- Document untested assumptions as known risks

## Quality Checks

Before moving forward:

- [ ] Assumptions are specific statements, not vague concerns
- [ ] Prioritization based on risk and uncertainty, not just gut feel
- [ ] Experiments actually test the assumption (not adjacent things)
- [ ] Success criteria are measurable, not subjective
- [ ] Failure criteria exist (what would change your mind?)
- [ ] Time/cost is appropriate to the risk
- [ ] Results include evidence, not just conclusions
- [ ] Next actions are clear based on each outcome
