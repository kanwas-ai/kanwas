---
name: okr-reviewer
description: Review draft OKRs against best practices from John Doerr and Andy Grove's OKR methodology. Use when you have draft objectives and key results that need feedback before finalizing. Catches common mistakes like vague key results, tasks disguised as KRs, sandbagging, and missing measurability.
featured: true
---

# OKR Reviewer

Review draft OKRs for methodology compliance and quality, providing specific actionable feedback.

## The Methodology

**Sources:** John Doerr ("Measure What Matters"), Andy Grove (Intel, "High Output Management")

### Core Principles

**Objectives** answer "Where do I want to go?"

- Qualitative and inspirational
- Action-oriented (starts with verb)
- Time-bound (implicit or explicit quarter/period)
- Ambitious but achievable with effort

**Key Results** answer "How will I know I'm getting there?"

- Quantitative and measurable
- Outcome-based, not activity-based
- Specific with numbers, dates, or percentages
- 2-5 per Objective (typically 3)
- Achievable but stretching (60-70% attainment expected for stretch KRs)

### The Stretch Test

OKRs should be uncomfortable. If you're 100% confident you'll hit them, they're not ambitious enough. Doerr's guideline: if you hit 70% of your KRs, you've set them right.

Two types:

- **Committed OKRs** — Must hit 100%. Failure indicates planning or execution problems.
- **Aspirational OKRs** — Stretch goals. 70% is success. Hitting 100% means you sandbagged.

## Process

### 1. Review Each Objective

Check against criteria:

- Is it qualitative and inspiring?
- Does it indicate direction without specifying how?
- Is it action-oriented?
- Is the scope right for the time period?

### 2. Review Each Key Result

For every KR, verify:

- **Measurable** — Contains a specific metric (number, percentage, date, yes/no)
- **Outcome not output** — Describes result achieved, not work done
- **Verifiable** — Can be objectively checked at end of period
- **Timebound** — Clear when measurement occurs

### 3. Flag Common Mistakes

| Mistake                     | Example                                          | Problem                                                     |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **Task as KR**              | "Launch redesigned homepage"                     | Activity, not outcome. What result does the launch achieve? |
| **Vague KR**                | "Improve customer satisfaction"                  | Not measurable. Improve by how much? From what baseline?    |
| **Sandbagging**             | "Increase signups by 5%" (when 20% is realistic) | Committed to what you'll do anyway. Not stretching.         |
| **Binary milestone**        | "Complete security audit"                        | Sometimes OK, but prefer outcomes over checkboxes           |
| **Too many KRs**            | 7 KRs for one Objective                          | Indicates unclear Objective or mixed goals. Aim for 2-5.    |
| **Metric without baseline** | "Achieve 50% retention"                          | Is that up or down? From what?                              |
| **Leading indicator as KR** | "Send 10,000 emails"                             | That's effort. What outcome do emails drive?                |

### 4. Check Alignment

- Do KRs actually measure progress toward the Objective?
- Would achieving all KRs mean the Objective is met?
- Are KRs collectively sufficient (not missing key aspects)?

### 5. Provide Feedback

For each issue, explain:

- What's wrong (specific)
- Why it matters (methodology reason)
- How to fix it (concrete suggestion)

## Example Review

**Draft OKR:**

> O: Become the market leader in developer tools
> KR1: Ship v2.0 of the CLI
> KR2: Improve NPS
> KR3: Hire 3 engineers

**Review:**

**Objective: Needs refinement**
"Market leader" is vague. Leader in what dimension? Consider: "Become the preferred CLI tool for JavaScript developers" or "Achieve dominant market share in developer CLIs."

**KR1: Task, not outcome** (Critical)
"Ship v2.0" is a milestone/activity. What outcome does v2.0 drive?
_Suggested:_ "Increase weekly active CLI users from 10K to 25K" or "Reduce average task completion time by 40%"

**KR2: Not measurable** (Critical)
"Improve NPS" lacks specificity. By how much? From what baseline?
_Suggested:_ "Increase NPS from 32 to 50" (include current baseline)

**KR3: Input, not outcome** (Critical)
Hiring is an input to achieving goals, not an outcome. Why do you need 3 engineers?
_Suggested:_ If hiring enables shipping more, make the outcome the KR. If team growth is the real goal, consider: "Grow engineering team velocity to 50 points/sprint" (outcome of having more engineers).

**Overall:** 0/3 KRs pass. All describe activities or inputs rather than measurable outcomes. Reframe around what success looks like, not what work you'll do.

## Quality Checks

After review, verify your feedback addresses:

- [ ] Every Objective has 2-5 measurable Key Results
- [ ] No KRs are tasks/activities disguised as results
- [ ] All KRs have specific numbers, dates, or percentages
- [ ] KRs include baselines or current state when relevant
- [ ] Stretch vs. committed distinction is clear (if applicable)
- [ ] KRs actually measure the Objective (alignment check)
- [ ] Feedback is specific and actionable, not generic

## Output Format

Structure your review as:

```
## Objective: [Quoted Objective]
[Assessment + specific feedback if needed]

### KR1: [Quoted KR]
**Verdict:** Pass / Needs Work / Critical Issue
**Issue:** [If applicable—what's wrong]
**Suggestion:** [Improved version]

### KR2: [Quoted KR]
...

## Overall Assessment
[Summary: how many KRs pass, overall quality, key patterns to fix]
```
