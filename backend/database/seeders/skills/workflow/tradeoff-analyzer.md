---
name: tradeoff-analyzer
description: Analyze competing concerns and make implicit tradeoffs explicit. Use when facing decisions with multiple valid options that pull in different directions—speed vs quality, scope vs timeline, cost vs flexibility, technical debt vs shipping. Produces structured analysis with quantified impacts and justified recommendations.
---

# Tradeoff Analyzer

Make implicit tradeoffs explicit and decidable. Surface what's actually at stake so decisions can be made with clarity.

## What This Orchestrates

1. **Framing** — Name the competing concerns
2. **Stakes** — Articulate what's at risk for each option
3. **Perspectives** — Gather stakeholder viewpoints
4. **Quantification** — Put numbers where possible
5. **Recommendation** — Make a call with rationale
6. **Documentation** — Record for future reference

## Process

### 1. Identify Competing Concerns

Ask: "What's pulling in different directions?"

Common patterns:

- Speed vs quality
- Scope vs timeline
- Cost vs flexibility
- Short-term vs long-term
- Risk vs reward
- Technical purity vs pragmatism

Name them explicitly. "We're trading X for Y."

### 2. Articulate What's at Stake

For each concern, answer:

- What happens if we prioritize this?
- What happens if we deprioritize this?
- What's the worst-case scenario?
- What's irreversible?

**Format:**

```
Concern A: [Name]
- If prioritized: [outcome]
- If deprioritized: [outcome]
- Reversibility: [high/medium/low]

Concern B: [Name]
- If prioritized: [outcome]
- If deprioritized: [outcome]
- Reversibility: [high/medium/low]
```

### 3. Gather Stakeholder Perspectives

Different roles see different stakes:

- Engineering: technical debt, maintenance burden, system health
- Product: user impact, feature completeness, market timing
- Business: revenue, cost, risk exposure
- Operations: reliability, support load, scalability

Capture each perspective's primary concern and acceptable tradeoff threshold.

### 4. Quantify Where Possible

Move from vague to specific:

| Vague            | Specific                              |
| ---------------- | ------------------------------------- |
| "Takes longer"   | "+2 weeks to ship"                    |
| "More expensive" | "+$X/month infrastructure"            |
| "Higher risk"    | "30% chance of Y occurring"           |
| "Technical debt" | "Adds N hours to each future feature" |

If you can't quantify, state the uncertainty: "Unknown, but likely in range of X-Y."

### 5. Make a Recommendation

Structure:

```
Recommendation: [Option]

Rationale:
- [Key reason 1]
- [Key reason 2]
- [Key reason 3]

What we're accepting:
- [Tradeoff 1]
- [Tradeoff 2]

Mitigation:
- [How we reduce downside 1]
- [How we reduce downside 2]
```

A recommendation without tradeoffs isn't analysis—it's advocacy.

### 6. Document for Future Reference

Include:

- Context at time of decision
- Options considered
- Why rejected options were rejected
- Conditions that would change the decision
- Review date (if applicable)

## Adapts To

**By tradeoff type:**

- Technical decisions: emphasize reversibility, maintenance cost, system impact
- Product decisions: emphasize user impact, market timing, competitive position
- Resource decisions: emphasize opportunity cost, team capacity, dependencies
- Risk decisions: emphasize probability, impact severity, mitigation options

**By available data:**

- Data-rich: lead with quantified impacts, use ranges and confidence levels
- Data-poor: lead with stakeholder perspectives, flag assumptions explicitly

**By decision urgency:**

- High urgency: prioritize reversibility—prefer options that leave doors open
- Low urgency: prioritize long-term fit—accept short-term cost for better outcome

**By stakeholder alignment:**

- Aligned: focus on quantification and recommendation
- Misaligned: spend more time on perspective gathering and stakes articulation

## Output Format

```markdown
## Tradeoff Analysis: [Decision Title]

### The Decision

[One sentence: what we're deciding]

### Competing Concerns

1. **[Concern A]**: [what this optimizes for]
2. **[Concern B]**: [what this optimizes for]

### Stakes

**If we prioritize [Concern A]:**

- [Outcome 1]
- [Outcome 2]
- Reversibility: [high/medium/low]

**If we prioritize [Concern B]:**

- [Outcome 1]
- [Outcome 2]
- Reversibility: [high/medium/low]

### Stakeholder Perspectives

| Stakeholder | Primary Concern | Acceptable Tradeoff  |
| ----------- | --------------- | -------------------- |
| [Role 1]    | [Concern]       | [What they'd accept] |
| [Role 2]    | [Concern]       | [What they'd accept] |

### Quantified Impacts

| Option   | [Metric 1] | [Metric 2] | [Metric 3] |
| -------- | ---------- | ---------- | ---------- |
| Option A | [value]    | [value]    | [value]    |
| Option B | [value]    | [value]    | [value]    |

### Recommendation

**[Recommended option]**

Rationale:

- [Reason 1]
- [Reason 2]

What we're accepting:

- [Tradeoff 1]
- [Tradeoff 2]

Mitigation:

- [Action 1]
- [Action 2]

### Decision Record

- Context: [Key context at time of decision]
- Rejected: [Option X] because [reason]
- Revisit if: [Conditions that would change this]
```

## Quality Checks

**Completeness:**

- [ ] Both/all competing concerns are explicitly named
- [ ] Stakes are articulated for each option
- [ ] At least 2 stakeholder perspectives captured
- [ ] Impacts quantified where data exists
- [ ] Recommendation includes rationale AND accepted tradeoffs

**Intellectual honesty:**

- [ ] No false dichotomies—have we considered hybrid options?
- [ ] Uncertainties flagged, not hidden
- [ ] Rejected options have fair treatment
- [ ] Recommendation acknowledges downsides

**Actionability:**

- [ ] Decision is clear and unambiguous
- [ ] Mitigation actions are specific
- [ ] Conditions for revisiting are stated
- [ ] Document is useful to someone reading it in 6 months

**Red flags to catch:**

- Analysis that only supports one option (advocacy, not analysis)
- Vague impacts when data is available
- Missing stakeholder whose input matters
- Reversibility not considered
- No mitigation for accepted downsides
