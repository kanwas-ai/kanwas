---
name: rice-scoring
description: Apply the RICE prioritization framework to rank features, initiatives, or projects. Use when you have multiple items competing for resources and need a structured, quantitative method to determine priority order based on reach, impact, confidence, and effort.
---

# RICE Scoring

Score and rank items using Intercom's RICE prioritization framework.

## The Methodology

**Source:** Intercom (Sean McBride)

RICE provides a quantitative score for prioritization decisions:

**RICE = (Reach × Impact × Confidence) / Effort**

### Components

**Reach** — How many users/customers affected in a defined time period?

- Must be a specific number, not "many" or "some"
- Define the time period (per quarter, per month)
- Example: "2,000 users per quarter"

**Impact** — How much will this move the needle for each user reached?

- 3 = Massive (fundamental change)
- 2 = High (significant improvement)
- 1 = Medium (noticeable improvement)
- 0.5 = Low (minor improvement)
- 0.25 = Minimal (barely noticeable)

**Confidence** — How certain are you about these estimates?

- 100% = High (data-backed, validated)
- 80% = Medium (some data, reasonable assumptions)
- 50% = Low (gut feel, unvalidated)

**Effort** — Person-months of work required

- Include all disciplines (engineering, design, PM, QA)
- Round to whole or half months
- Example: "2 person-months" means 1 person for 2 months OR 2 people for 1 month

## Process

1. **List items** — Gather all features/initiatives to prioritize
2. **Define reach time period** — Pick consistent period (usually quarterly)
3. **Score each item:**
   - Estimate Reach (specific number)
   - Assign Impact (3/2/1/0.5/0.25)
   - Set Confidence (100/80/50%)
   - Estimate Effort (person-months)
4. **Calculate RICE** — (R × I × C) / E for each
5. **Rank** — Order by RICE score descending
6. **Sanity check** — Review if rankings match intuition; investigate mismatches

## Example

Scoring three features for a B2B SaaS product:

| Feature            | Reach (quarterly) | Impact | Confidence | Effort | RICE |
| ------------------ | ----------------- | ------ | ---------- | ------ | ---- |
| SSO integration    | 500               | 2      | 80%        | 3      | 267  |
| Dashboard redesign | 2,000             | 1      | 50%        | 4      | 250  |
| Export to CSV      | 800               | 0.5    | 100%       | 0.5    | 800  |

**Calculation for SSO:**
(500 × 2 × 0.80) / 3 = 800 / 3 = 267

**Ranked priority:**

1. Export to CSV (800)
2. SSO integration (267)
3. Dashboard redesign (250)

Note: Export to CSV ranks highest despite low impact because it's quick to build and affects many users with high confidence.

## Quality Checks

- [ ] Reach uses specific numbers, not vague terms
- [ ] Reach time period is consistent across all items
- [ ] Impact uses only standard scale values (3/2/1/0.5/0.25)
- [ ] Confidence reflects actual certainty, not optimism
- [ ] Effort includes all disciplines, not just engineering
- [ ] Calculations are correct
- [ ] Rankings reviewed for sanity (surprising results investigated)

## Common Pitfalls

**Inflated confidence** — Default to 50% when lacking data. 100% requires actual evidence.

**Missing effort** — Engineering-only estimates undercount. Include design, PM review, QA, documentation.

**Vague reach** — "All users" or "enterprise customers" isn't a number. Estimate specifically.

**Impact confusion** — Impact is per-user effect, not total effect. A feature touching 10,000 users with 0.5 impact is different from one touching 100 users with 3 impact.

## When RICE Falls Short

RICE works well for tactical prioritization. Consider other factors for:

- **Strategic bets** — Long-term positioning may override RICE scores
- **Dependencies** — Item B might require Item A first
- **Risk mitigation** — Security/compliance may be non-negotiable
- **Customer commitments** — Contractual obligations take precedence

Present RICE scores as input to the decision, not the decision itself.
