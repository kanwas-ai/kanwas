---
name: assumption-mapping
description: Map and prioritize assumptions behind an initiative, product, or plan. Use when launching something new, evaluating a strategy, or when a decision carries significant uncertainty. Identifies what you're betting on and what needs validation first.
---

# Assumption Mapping

Identify hidden assumptions in an initiative and prioritize them by risk. The goal is to surface what you're betting on and determine what needs validation before committing resources.

## The Methodology

**Source:** David Bland & Alex Osterwalder, _Testing Business Ideas_ (Strategyzer, 2019)

Every initiative rests on assumptions—beliefs treated as facts. Most failures trace back to untested assumptions, not poor execution. This methodology exposes those assumptions and prioritizes them for testing.

**The two axes:**

- **Importance**: How critical is this assumption to success? If wrong, does the initiative fail?
- **Evidence**: How much do we actually know? Hard data vs. gut feeling?

**The priority rule:** High importance + Low evidence = Test first

```
                    HIGH IMPORTANCE
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        │   TEST FIRST    │   MONITOR       │
        │   (Leap of      │   (Known        │
        │   faith)        │   risks)        │
        │                 │                 │
LOW ────┼─────────────────┼─────────────────┼──── HIGH
EVIDENCE│                 │                 │     EVIDENCE
        │                 │                 │
        │   PARK          │   SAFE          │
        │   (Nice to      │   (Validated)   │
        │   know)         │                 │
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                    LOW IMPORTANCE
```

## Process

### 1. Extract Assumptions

Review the initiative and list every assumption it depends on. Look for:

- **Desirability**: Will people want this? Will they pay?
- **Feasibility**: Can we build/deliver this? Do we have the capability?
- **Viability**: Does the business model work? Can we sustain it?

Frame as falsifiable statements:

- "Customers will pay $X for this feature"
- "We can deliver in Q2 with current team"
- "Churn will stay below 5%"

### 2. Rate Each Assumption

For each assumption, assign:

| Dimension      | 1            | 2        | 3           | 4             | 5              |
| -------------- | ------------ | -------- | ----------- | ------------- | -------------- |
| **Importance** | Nice to have | Helpful  | Significant | Critical      | Fatal if wrong |
| **Evidence**   | Pure guess   | Anecdote | Some data   | Strong signal | Validated      |

Be honest. Most teams overrate their evidence.

### 3. Map to Quadrants

Place each assumption on the matrix:

| Quadrant       | Profile                      | Action                        |
| -------------- | ---------------------------- | ----------------------------- |
| **Test First** | Importance 4-5, Evidence 1-2 | Design experiment immediately |
| **Monitor**    | Importance 4-5, Evidence 3-5 | Track for changes             |
| **Park**       | Importance 1-3, Evidence 1-2 | Revisit if scope changes      |
| **Safe**       | Importance 1-3, Evidence 3-5 | No action needed              |

### 4. Prioritize Testing

For "Test First" assumptions, rank by:

1. Which could kill the initiative fastest?
2. Which is cheapest to test?
3. Which unblocks other decisions?

### 5. Design Experiments

For top 3-5 assumptions, define:

- **Hypothesis**: What we believe
- **Test**: How we'll check (interviews, prototypes, data analysis)
- **Signal**: What result would change our mind
- **Timeline**: When we'll have an answer

## Example

**Initiative:** Launch premium tier at $99/month

**Extracted Assumptions:**

| Assumption                                 | Importance | Evidence | Quadrant   |
| ------------------------------------------ | ---------- | -------- | ---------- |
| Power users will pay 3x current price      | 5          | 1        | Test First |
| We can ship premium features in 8 weeks    | 4          | 3        | Monitor    |
| Premium won't cannibalize enterprise sales | 5          | 2        | Test First |
| Support costs scale linearly               | 3          | 2        | Park       |
| Competitors won't match price in 6 months  | 3          | 4        | Safe       |

**Top Assumptions to Test:**

1. **"Power users will pay 3x"** — Run pricing survey + fake door test
2. **"Won't cannibalize enterprise"** — Interview 10 enterprise prospects

**Experiment Design (Example):**

```
Hypothesis: 20% of power users will upgrade to $99/month
Test: Fake door test on billing page for 2 weeks
Signal: >15% click-through = proceed, <5% = rethink pricing
Timeline: 2 weeks
```

## Quality Checks

Before delivering the assumption map, verify:

- [ ] Assumptions are specific and falsifiable (not "users will like it")
- [ ] Each assumption has independent importance/evidence ratings
- [ ] Ratings are honest, not optimistic
- [ ] "Test First" quadrant has clear experiments defined
- [ ] Experiments have concrete success/failure signals
- [ ] At least one desirability, feasibility, and viability assumption identified
- [ ] No critical assumption is marked "Safe" without real evidence

## Output Format

Deliver:

1. **Assumption List**: Table with all assumptions, ratings, and quadrants
2. **Assumption Map**: Visual quadrant placement (ASCII or description)
3. **Test Plan**: Top 3-5 assumptions with experiment designs
4. **Key Insight**: One sentence on the biggest risk identified
