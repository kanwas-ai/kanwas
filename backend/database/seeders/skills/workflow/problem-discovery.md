---
name: problem-discovery
description: Orchestrate the journey from scattered signals (support tickets, user feedback, analytics, churn data) to validated problem statements with priority. Use when you have raw user signals and need to identify which problems are worth solving before jumping to solutions.
---

# Problem Discovery

Transform scattered signals into validated, prioritized problem statements.

## What This Orchestrates

1. Signal gathering from available sources
2. Pattern clustering into problem areas
3. Validation of frequency and severity
4. User segment identification
5. Prioritization by impact and tractability
6. Documentation as actionable problem statements

## Process

### 1. Gather Signals

Collect from whatever sources are available:

- Support tickets / customer complaints
- User feedback (surveys, interviews, reviews)
- Analytics (drop-offs, error rates, time-on-task)
- Churn/cancellation reasons
- Sales objections
- Internal team observations

**Ask:** "What signals do you have access to?"

If sources are limited, note the gaps — don't pretend you have complete data.

### 2. Cluster into Problem Areas

Group signals by underlying cause, not surface symptom.

**Bad clustering:** "Login errors" + "Password reset issues" + "Can't access account"
**Good clustering:** "Authentication friction" encompassing all access barriers

Look for:

- Multiple signals pointing to the same underlying issue
- Signals that share affected user segments
- Signals with common root causes

### 3. Validate Frequency and Severity

For each cluster, quantify:

| Dimension | Question                               | Sources                          |
| --------- | -------------------------------------- | -------------------------------- |
| Frequency | How often does this occur?             | Ticket volume, analytics events  |
| Severity  | How much does it hurt when it happens? | User language, churn correlation |
| Breadth   | How many users affected?               | Segment size, penetration        |

**If you can't quantify:** State the data gap. "Unknown frequency — no tracking exists" is better than making up numbers.

### 4. Identify Affected Segments

Be specific about who experiences the problem:

**Vague:** "Users struggle with onboarding"
**Specific:** "New users on mobile who sign up via social auth drop off at profile completion (43% vs 12% for email signups)"

Segment dimensions:

- User type (new/returning, free/paid, segment size)
- Platform (web/mobile, browser, device)
- Behavior (usage pattern, feature adoption)
- Context (time, location, workflow)

### 5. Prioritize by Impact and Tractability

Score each validated problem:

**Impact** (if solved, how much does it matter?)

- Revenue: Direct revenue impact or retention
- Volume: Number of users affected
- Severity: Pain intensity when experienced
- Strategic: Alignment with business goals

**Tractability** (can we actually solve this?)

- Technical complexity
- Dependencies on other work
- Data/resource availability
- Organizational constraints

Create a 2x2 or ranked list. High impact + high tractability = start here.

### 6. Document as Problem Statements

Each problem statement includes:

```
## Problem: [Descriptive name]

**The problem:** [One sentence describing what's broken]

**Who experiences it:** [Specific user segment]

**Evidence:**
- [Signal 1 with source]
- [Signal 2 with source]
- [Quantification if available]

**Impact:** [Why this matters — revenue, retention, satisfaction]

**Priority:** [High/Medium/Low with brief justification]
```

## Adapts To

**Data-rich environments:**

- Lean heavily on quantitative validation
- Cross-reference multiple signal sources
- Build confidence through triangulation

**Data-sparse environments:**

- Acknowledge uncertainty explicitly
- Recommend what data to collect
- Use qualitative signals with appropriate caveats

**Time constraints:**

- Focus on highest-signal sources first
- Produce preliminary problem list with noted gaps
- Flag validation needed before committing resources

**Complex problem spaces:**

- Break into sub-problems if clusters are too large
- Map relationships between problems
- Identify root problems vs symptoms

## Quality Checks

Before delivering problem statements:

- [ ] Each problem is specific (not "users struggle")
- [ ] Frequency/severity quantified or explicitly noted as unknown
- [ ] User segments are specific, not "users" or "customers"
- [ ] Evidence attached from actual signals, not assumptions
- [ ] Priority has explicit justification
- [ ] Problems are distinct from solutions (no embedded fixes)
- [ ] Data gaps are acknowledged, not papered over

## Anti-Patterns

**Solution smuggling:** "The problem is we don't have feature X" — that's a solution disguised as a problem. The problem is the user pain, not the missing feature.

**Vague pain:** "Users find it confusing" — which users? What's confusing? How often? What happens as a result?

**Invented urgency:** Claiming high severity without evidence. If you don't know severity, say so.

**Single-signal decisions:** One angry tweet isn't a pattern. Look for convergent evidence.
