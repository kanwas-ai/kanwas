---
name: user-research-synthesis
description: Synthesize insights from multiple user research interviews into prioritized themes, patterns, and recommendations. Use when you have interview transcripts or notes from discovery research and need to extract what matters, identify patterns across participants, and translate findings into product decisions.
featured: true
---

# User Research Synthesis

Transform raw interview data into structured insights that inform product decisions.

## What This Orchestrates

1. Intake and organize interview materials
2. Extract observations from each interview
3. Identify cross-interview themes
4. Prioritize by frequency, severity, and opportunity
5. Generate actionable recommendations

## Process

### 1. Intake Interview Materials

Gather what's available:

- Full transcripts or detailed notes
- Number of participants
- Participant context (segment, role, experience level)
- Research questions the interviews addressed

**Minimum viable:** 3+ interviews on related topics. Fewer than 3 limits pattern detection.

**If missing context:** Ask "What were you trying to learn from these interviews?"

### 2. First Pass: Per-Interview Extraction

For each interview, extract:

**Observations** (what they said/did)

- Direct quotes that capture key points
- Behaviors described or observed
- Pain points articulated
- Workarounds mentioned

**Signals** (what it suggests)

- Unmet needs
- Expectations vs reality gaps
- Emotional weight (frustration, delight, indifference)

Tag each observation:

- Topic area (onboarding, core workflow, edge case, etc.)
- Valence (pain, gain, neutral)
- Confidence (explicit statement vs inference)

### 3. Cross-Interview Theme Extraction

Cluster related observations into themes. A theme needs:

- Observations from 2+ participants
- Coherent pattern (not just keyword match)
- Describable in one sentence

**Strong theme signals:**

- Same problem described differently by multiple people
- Similar workaround across participants
- Consistent emotional response

**Watch for:**

- Loud minority (1 participant, many mentions)
- Confirmation bias (seeing what you expected)
- Missing voices (who didn't say what?)

### 4. Prioritize Themes

Rank themes using three dimensions:

| Dimension       | Questions                                    |
| --------------- | -------------------------------------------- |
| **Frequency**   | How many participants? Proportion of sample? |
| **Severity**    | Blocking? Frustrating? Minor annoyance?      |
| **Opportunity** | Size of potential impact if solved?          |

Priority matrix:

- **High frequency + high severity** = Address first
- **Low frequency + high severity** = Investigate more
- **High frequency + low severity** = Quick win candidates
- **Low frequency + low severity** = Deprioritize

### 5. Generate Recommendations

For each high-priority theme, provide:

**The insight:** What did we learn?

- Framed as user need, not product feature
- Supported by evidence (quotes, frequency)

**The implication:** So what?

- Why this matters for the product
- Risk of ignoring it

**The recommendation:** Now what?

- Specific action or decision
- Further research needed (if not enough evidence)

### 6. Acknowledge Gaps

Research never tells the complete story. Note:

- Sample limitations (size, composition, recruitment bias)
- Questions not answered
- Themes that need more evidence
- Contradictions unresolved

## Output Format

```markdown
# Research Synthesis: [Research Topic/Sprint]

## Research Overview

- **Participants:** [count] across [segments]
- **Research questions:** [what you were trying to learn]
- **Synthesis date:** [date]

## Key Themes

### Theme 1: [Name]

**Evidence:** [X of Y participants]
**Severity:** [Blocking / Frustrating / Minor]

> "[Supporting quote]" — P[X], [context]
> "[Supporting quote]" — P[Y], [context]

**Insight:** [What this tells us]
**Recommendation:** [What to do about it]

### Theme 2: [Name]

...

## Additional Observations

[Patterns worth noting but not prioritized]

## Open Questions

[What this research doesn't answer]

## Methodology Notes

[Sample limitations, recruitment, interview approach]
```

## Adapts To

**Interview volume**

- 3-5 interviews: Focus on strongest patterns, acknowledge small sample
- 6-12 interviews: Full theme extraction, quantify frequencies
- 12+ interviews: Consider segment-level analysis, look for subgroup patterns

**Research maturity**

- Exploratory: Broad themes, many open questions, hypothesis generation
- Validation: Specific theme confirmation/rejection, quantify evidence
- Ongoing: Compare to previous rounds, track theme evolution

**Data quality**

- Full transcripts: Quote-heavy synthesis, detailed observations
- Summary notes: Pattern-focused, less direct evidence
- Mixed: Weight by reliability, note gaps

**Stakeholder audience**

- Product team: Emphasize implications and recommendations
- Leadership: Lead with decisions and priorities
- Design team: Include behavioral details and quotes

## Decision Points

**When themes conflict:**

- Document the contradiction
- Check if it maps to segments
- Note as open question if unresolved

**When evidence is thin:**

- Label as "emerging signal" not confirmed theme
- Recommend targeted follow-up research
- Don't overstate confidence

**When everything seems important:**

- Return to original research questions
- Apply priority matrix rigorously
- Separate "interesting" from "actionable"

## Quality Checks

- [ ] Every theme has evidence from 2+ participants
- [ ] Quotes are verbatim, not paraphrased
- [ ] Insights framed as needs, not solutions
- [ ] Recommendations are specific actions, not vague "improve X"
- [ ] Sample limitations acknowledged
- [ ] Contradictions noted, not hidden
- [ ] Priority rationale is explicit
- [ ] Open questions identified
