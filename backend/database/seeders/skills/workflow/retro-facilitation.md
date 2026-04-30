---
name: retro-facilitation
description: Facilitate sprint retrospectives by guiding teams through structured reflection on what worked, what didn't, theme identification, and action item generation. Use when running or preparing for a retro, when synthesizing async retro feedback, or when a team needs help turning retrospective discussions into concrete improvements.
---

# Retro Facilitation

Guide retrospective discussions from context gathering through actionable outcomes.

## What This Orchestrates

1. Establish sprint context and goals
2. Gather what worked and what didn't
3. Extract themes from scattered feedback
4. Generate prioritized action items with owners
5. Close the loop on previous retro actions

## Process

### 1. Establish Context

Before diving into feedback, ground the discussion:

- **Sprint scope**: What was the team working on?
- **Sprint goals**: What were you trying to achieve?
- **Previous actions**: What did the team commit to last retro?

Ask: "What was this sprint about, and what were you hoping to accomplish?"

If previous retro actions exist, check status first. Unaddressed actions often resurface as new complaints.

### 2. Gather Feedback

Collect input in two buckets:

**What worked**

- Successes, wins, things to keep doing
- Process improvements that landed
- Collaboration moments worth repeating

**What didn't work**

- Frustrations, blockers, friction
- Missed goals and why
- Process breakdowns

Prompt for specifics, not vague sentiments:

- Not: "Communication was bad"
- Instead: "We didn't know about the API change until deploy day"

For async retros, structure input collection:

```
## What Worked
- [Team member]: [Specific observation]

## What Didn't Work
- [Team member]: [Specific observation]
```

### 3. Extract Themes

Group related feedback into themes. Look for:

**Process themes**

- Planning and estimation issues
- Handoff and communication gaps
- Tooling and environment friction

**Team dynamics themes**

- Workload distribution
- Cross-functional coordination
- Decision-making clarity

**Technical themes**

- Tech debt impact
- Architecture constraints
- Testing and quality gaps

Merge similar items. A theme should have 2+ related observations.

Name themes concretely:

- Not: "Communication issues"
- Instead: "Design-eng handoffs happening too late"

### 4. Prioritize Themes

Not everything can be fixed at once. Prioritize by:

| Factor              | Question                                                 |
| ------------------- | -------------------------------------------------------- |
| **Impact**          | How much does this affect the team's ability to deliver? |
| **Frequency**       | One-off or recurring?                                    |
| **Controllability** | Can the team actually change this?                       |

Skip themes that are:

- Outside team control (org-wide policy)
- Already being addressed elsewhere
- One-time events unlikely to recur

Focus on 2-3 themes max. More dilutes effort.

### 5. Generate Action Items

For each prioritized theme, define concrete actions:

**Good action items have:**

- A specific owner (not "the team")
- A clear deliverable (not "improve X")
- A timeframe (next sprint, next 2 weeks)
- A way to verify completion

**Transform complaints into actions:**

| Theme                | Bad Action             | Good Action                                                                   |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Late design handoffs | "Communicate earlier"  | "Jess schedules design review 3 days before sprint end, starting next sprint" |
| Unclear requirements | "Write better tickets" | "PM adds acceptance criteria checklist to ticket template by Friday"          |
| Deploy day surprises | "Better coordination"  | "Team adds 'deployment risks' section to standup on Thursdays"                |

Limit to 3-5 actions. Teams can't absorb more.

### 6. Close the Loop

End by confirming:

- **Previous actions**: Which are done? Which carry forward?
- **New actions**: Who owns what, by when?
- **Next retro**: When will we check on these?

Create a record for next retro:

```markdown
## Retro: [Date]

### Actions from Last Retro

- [ ] [Action] — [Owner] — [Status]

### This Sprint's Actions

- [ ] [Action] — [Owner] — [Due date]

### Themes Discussed

- [Theme 1]: [Summary]
- [Theme 2]: [Summary]
```

## Output Format

```markdown
## Sprint Retrospective: [Sprint Name/Date]

### Context

- **Sprint focus:** [What the team worked on]
- **Goals:** [What you were trying to achieve]

### Previous Action Status

- [x] [Completed action]
- [ ] [Incomplete action — carried forward or dropped?]

### What Worked

- [Specific win]
- [Specific win]

### What Didn't Work

- [Specific friction point]
- [Specific friction point]

### Themes Identified

1. **[Theme name]**: [2-3 sentence summary of grouped feedback]
2. **[Theme name]**: [2-3 sentence summary of grouped feedback]

### Action Items

| Action            | Owner  | Due    | Success Criteria        |
| ----------------- | ------ | ------ | ----------------------- |
| [Specific action] | [Name] | [Date] | [How we know it's done] |

### Parked

[Themes acknowledged but not actionable this cycle]
```

## Adapts To

**Live facilitation vs async synthesis**

- Live: Guide discussion in real-time, probe for specifics
- Async: Synthesize submitted feedback, identify gaps to clarify

**Team size**

- Small (3-5): More conversational, everyone speaks
- Large (8+): Structure input collection, theme voting

**Retro health**

- Healthy: Standard process, focus on continuous improvement
- Struggling: More time on "what worked" to rebuild morale; smaller, achievable actions
- First retro: Establish baseline expectations, lighter on previous actions

**Time available**

- Quick (30 min): Skip deep theme extraction, focus on 1-2 obvious issues
- Standard (60 min): Full process
- Extended: Add root cause analysis for recurring themes

**Recurring issues**

- If same theme appears 3+ retros: Escalate, dig into root cause, consider systemic change

## Quality Checks

- [ ] Context is established — sprint goals are explicit, not assumed
- [ ] Feedback is specific — "communication" is always unpacked into concrete examples
- [ ] Themes have multiple supporting observations — not single complaints elevated to themes
- [ ] Actions have owners and dates — not "we should" statements
- [ ] Actions are achievable in one sprint — not multi-month initiatives
- [ ] Previous retro actions are reviewed — the loop is closed
- [ ] Positive feedback is captured — not just problems
