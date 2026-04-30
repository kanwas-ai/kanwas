---
name: priority-stack-ranker
description: Facilitate prioritization of items (features, tasks, initiatives) using appropriate frameworks like RICE, ICE, or MoSCoW. Use when you need to rank a list of items with explicit criteria and defensible rationale, especially when stakeholders need to understand tradeoffs.
---

# Priority Stack Ranker

Prioritize a list of items with explicit criteria, defensible ranking, and surfaced tradeoffs.

## What This Orchestrates

1. Context gathering — understand what's being prioritized and constraints
2. Framework selection — match method to data availability and decision needs
3. Scoring — apply framework systematically to each item
4. Ranking — generate ordered list with rationale
5. Tradeoff analysis — surface close calls and key tensions

## Process

### 1. Clarify Context

Ask or infer:

- **What** is being prioritized? (features, bugs, initiatives, tasks)
- **Who** decides? (single owner, committee, stakeholders with different goals)
- **What constraints** exist? (time, budget, dependencies, capacity)
- **What data** is available? (usage metrics, estimates, stakeholder input)

If context is ambiguous, ask clarifying questions before proceeding.

### 2. Select Framework

Match framework to context:

| Framework            | Best When                              | Data Needed                                        |
| -------------------- | -------------------------------------- | -------------------------------------------------- |
| **RICE**             | Product features with metrics          | Reach, Impact (1-3), Confidence (%), Effort        |
| **ICE**              | Quick scoring, limited data            | Impact (1-10), Confidence (1-10), Ease (1-10)      |
| **MoSCoW**           | Release scoping, stakeholder alignment | Clear understanding of must-haves vs nice-to-haves |
| **Value vs Effort**  | Simple 2x2 tradeoff                    | Relative value and effort estimates                |
| **Weighted Scoring** | Multiple criteria, custom weights      | Defined criteria and weights                       |
| **Forced Ranking**   | When everything seems equal priority   | Willingness to make hard tradeoffs                 |

Default to **ICE** if data is limited and speed matters.
Default to **RICE** if product metrics are available.
Default to **MoSCoW** if scoping a release or sprint.

### 3. Gather Inputs

For each item, collect framework-specific inputs:

**RICE:**

- Reach: How many users/transactions affected per time period?
- Impact: Minimal (0.25), Low (0.5), Medium (1), High (2), Massive (3)
- Confidence: How sure are you? (100%, 80%, 50%)
- Effort: Person-months or story points

**ICE:**

- Impact: 1-10 scale (10 = highest impact)
- Confidence: 1-10 scale (10 = certain)
- Ease: 1-10 scale (10 = easiest to implement)

**MoSCoW:**

- Must have: Required for release to succeed
- Should have: Important but not critical
- Could have: Nice to have
- Won't have: Out of scope for now

If inputs are missing, ask for estimates or make explicit assumptions.

### 4. Score and Rank

Apply the framework:

**RICE Score:** `(Reach × Impact × Confidence) / Effort`

**ICE Score:** `Impact × Confidence × Ease` (or average, depending on preference)

**MoSCoW:** Group into categories, then rank within each category

Present results in a table:

```
| Rank | Item | Score | Key Factors |
|------|------|-------|-------------|
| 1 | ... | ... | ... |
| 2 | ... | ... | ... |
```

### 5. Surface Tradeoffs

Identify and call out:

- **Close calls** — Items within 10-15% of each other in score
- **High-impact/high-effort items** — Strategic bets that need explicit discussion
- **Quick wins** — Low effort, moderate impact items that might jump the queue
- **Dependencies** — Items that unlock or block others
- **Disagreement signals** — Areas where confidence is low or stakeholders might differ

### 6. Deliver Output

Provide:

1. **Ranked list** with scores and brief rationale for top items
2. **Tradeoffs section** highlighting decisions that warrant discussion
3. **Assumptions** that informed the scoring (so stakeholders can challenge)

## Adapts To

**Data availability:**

- Rich metrics available → Use RICE with actual numbers
- Limited data → Use ICE with estimates, flag low confidence
- No quantitative data → Use MoSCoW or forced ranking

**Decision urgency:**

- Need quick answer → Skip extensive input gathering, use ICE or forced ranking
- High-stakes decision → Spend time on criteria alignment and stakeholder input

**Stakeholder context:**

- Single decision maker → Optimize for their criteria
- Multiple stakeholders → Surface criteria conflicts, use weighted scoring
- Executive audience → Lead with top 3-5, put details in appendix

**Item characteristics:**

- Similar scope items → Standard scoring works
- Mixed scope (epics + tasks) → Normalize or separate into tiers
- Dependencies between items → Factor into ranking or flag for discussion

## Quality Checks

Before delivering:

- [ ] Framework matches context (didn't use RICE when MoSCoW was needed)
- [ ] All items scored with same criteria (apples to apples)
- [ ] Rationale is defensible (could explain ranking to skeptic)
- [ ] Tradeoffs are explicit (close calls and tensions surfaced)
- [ ] Assumptions are stated (scoring inputs can be challenged)
- [ ] Output is actionable (clear what to do next)
