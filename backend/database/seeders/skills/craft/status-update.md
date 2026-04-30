---
name: status-update
description: Compose clear, scannable status updates for stakeholders. Use when you need to communicate project progress, blockers, or milestones to busy readers who need to quickly understand where things stand.
---

# Status Update

Transform project context into scannable updates that busy stakeholders can process in seconds.

## What Good Looks Like

- **Headline first** — Overall status (on track, at risk, blocked) is immediately visible
- **Quantified progress** — Numbers over vague descriptors ("3 of 5 complete" not "good progress")
- **Blockers have asks** — Every blocker names who can unblock and what they need to do
- **Explicit next steps** — Reader knows what happens next without asking
- **Right-sized** — Daily updates are brief; weekly updates have more context

## Process

1. **Clarify context**
   - What cadence? (daily standup, weekly summary, milestone report)
   - Who reads this? (team, leadership, external stakeholders)
   - What do they care about? (shipping dates, risks, resource needs)

2. **Determine status**
   - Green: On track, no intervention needed
   - Yellow: At risk, needs attention but recoverable
   - Red: Blocked, requires immediate action

3. **Draft the update**
   - Lead with status and one-line summary
   - List progress since last update (quantify where possible)
   - Surface blockers with specific asks
   - State next milestones with dates

4. **Trim ruthlessly**
   - Remove anything the reader doesn't need to act on
   - Daily: 3-5 bullet points max
   - Weekly: Keep under 200 words

## Structure

### Daily Update

```
Status: [Green/Yellow/Red]

Done:
- [Completed item with outcome]

Doing:
- [Current focus]

Blockers:
- [Blocker] — Need [specific ask] from [person/team]
```

### Weekly Update

```
Status: [Green/Yellow/Red] — [One-line summary]

Progress:
- [Key accomplishment with metric]
- [Key accomplishment with metric]

Risks:
- [Risk]: [Mitigation or ask]

Next Week:
- [Milestone with target date]
```

## Before/After Example

### Before (Vague, Buried Information)

> Things are going well on the project. We've been making good progress on the backend work and the team has been really productive. There are some challenges with the API integration but we're working through them. We should have more updates soon. The design team has been helpful. We're hoping to wrap up the current phase in the next couple weeks.

### After (Scannable, Actionable)

> **Status: Yellow** — API integration delayed; targeting May 15 completion
>
> **Progress:**
>
> - Backend auth module complete (was 60%, now 100%)
> - 4 of 6 API endpoints deployed to staging
>
> **Blockers:**
>
> - Payment API docs outdated — Need @fintech-team to provide v2 spec by Thursday
>
> **Next:**
>
> - Complete remaining 2 endpoints (May 10)
> - Integration testing (May 12-14)
> - Production deploy (May 15)

## Quality Checks

Before sending, verify:

- [ ] Status (green/yellow/red) is stated in the first line
- [ ] Progress uses numbers, not adjectives ("3 of 5" not "most")
- [ ] Every blocker has a specific ask and owner
- [ ] Next steps include dates or timeframes
- [ ] Length matches cadence (daily: <50 words, weekly: <200 words)
- [ ] A reader can understand the situation without asking follow-up questions
