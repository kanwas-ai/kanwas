---
name: user-feedback-synthesizer
description: Synthesize user feedback from multiple sources (NPS surveys, app reviews, support tickets, social media, user interviews) into structured insights with themes, priorities, and actionable recommendations. Use when you have scattered feedback and need to identify patterns, quantify issues, or build a case for product decisions.
---

# User Feedback Synthesizer

Aggregate feedback from multiple channels into a prioritized synthesis with evidence.

## Input

User feedback from one or more sources:

- NPS/survey responses
- App store reviews
- Support tickets or chat logs
- Social media mentions
- User interview transcripts
- Community forum posts
- Feature requests

## Output

Structured synthesis containing:

- Themed insights with frequency and severity
- Representative quotes as evidence
- Priority ranking with rationale
- Actionable recommendations

## Process

### 1. Gather and Inventory

Collect all available feedback. Create a source inventory:

| Source          | Volume | Time Range   | Reliability |
| --------------- | ------ | ------------ | ----------- |
| NPS comments    | 150    | Last 30 days | High        |
| App reviews     | 47     | Last 90 days | Medium      |
| Support tickets | 89     | Last 30 days | High        |

**Reliability factors:**

- High: Direct user voice, verified customers
- Medium: Public reviews (may include competitors, edge cases)
- Low: Anonymous, unverified, or secondhand

### 2. First Pass: Identify Themes

Read through feedback and tag emerging themes. Start broad, refine later.

Common theme categories:

- **Usability** — Navigation, discoverability, learning curve
- **Performance** — Speed, reliability, crashes
- **Features** — Missing, broken, requested
- **Value** — Pricing, ROI, alternatives
- **Support** — Response time, resolution quality

Tag each piece of feedback with:

- Theme(s)
- Sentiment (positive/negative/neutral)
- Severity (if negative): blocking, frustrating, minor

### 3. Quantify Patterns

Roll up tagged feedback into counts:

| Theme                | Negative | Positive | Total | Severity    |
| -------------------- | -------- | -------- | ----- | ----------- |
| Search broken        | 34       | 0        | 34    | Blocking    |
| Onboarding confusing | 28       | 12       | 40    | Frustrating |
| Love new dashboard   | 3        | 47       | 50    | N/A         |

**Identify outliers:** Single mentions that suggest systemic issues (data loss, security concerns, severe bugs).

### 4. Extract Evidence

For each significant theme, pull 2-3 representative quotes:

**Theme: Search broken**

> "I literally cannot find anything. Search returns random results." — NPS detractor
> "The search feature is useless. I have to scroll through everything manually." — App review (2 stars)

Prefer:

- Specific over vague
- Detailed over short
- Recent over old

### 5. Prioritize

Rank themes using:

**Priority = Frequency x Severity x User Value**

| Priority | Theme                | Reasoning                                   |
| -------- | -------------------- | ------------------------------------------- |
| P0       | Search broken        | High frequency (34), blocking, core feature |
| P1       | Onboarding confusing | Medium frequency (28), high churn risk      |
| P2       | Export missing       | Low frequency (8), power user request       |

### 6. Synthesize Recommendations

For top themes, provide actionable recommendations:

**Search broken (P0)**

- Evidence: 34 negative mentions, 0 positive
- Impact: Users abandoning workflow, switching to competitors
- Recommendation: Investigate search indexing, prioritize in next sprint
- Quick win: Add filter options as workaround

## Output Format

```markdown
# Feedback Synthesis: [Scope/Date Range]

## Summary

- **Sources analyzed:** [list with volumes]
- **Time range:** [dates]
- **Total feedback items:** [count]

## Top Insights

### 1. [Theme Name] — [Priority]

**Frequency:** [count] mentions across [sources]
**Severity:** [blocking/frustrating/minor]
**Sentiment:** [% negative/positive]

**Evidence:**

> "[Quote 1]" — [Source]
> "[Quote 2]" — [Source]

**Recommendation:** [Actionable next step]

### 2. [Theme Name] — [Priority]

...

## Positive Signals

[What users love — preserve and amplify]

## Emerging Patterns

[Themes with low frequency but worth watching]

## Data Gaps

[What feedback doesn't tell us, suggested follow-ups]
```

## Adapts To

**Quick scan (15 min):**

- Skip detailed inventory
- Focus on top 3-5 themes
- 1 quote per theme
- High-level recommendations

**Deep dive (1 hour+):**

- Full source inventory with reliability weighting
- Comprehensive theme taxonomy
- Cross-reference themes with user segments
- Trend analysis if historical data available

**Specific focus:**

- Filter to relevant feedback only
- Deep theme extraction within focus area
- Compare to baseline if available

**Limited data:**

- Note sample size limitations
- Avoid over-generalizing from small counts
- Recommend additional data collection

## Quality Checks

Before delivering:

- [ ] Every insight has quantified frequency (not just "some users")
- [ ] Every negative theme has supporting quotes
- [ ] Priorities have explicit rationale, not just gut feel
- [ ] Recommendations are specific actions, not vague "improve X"
- [ ] Source reliability is noted when mixing high/low quality sources
- [ ] Sample size limitations are disclosed
- [ ] Positive signals are included (not just problems)
- [ ] Data gaps are acknowledged
