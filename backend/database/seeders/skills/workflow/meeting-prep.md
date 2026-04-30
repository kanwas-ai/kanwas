---
name: meeting-prep
description: Prepare for meetings by gathering context on attendees, surfacing relevant open items, and creating talking points. Use when you have an upcoming meeting and need to be prepared with background information, clear objectives, and anticipated questions.
---

# Meeting Prep

Prepare a meeting prep document that gives you context and clear direction for the conversation.

## What This Orchestrates

1. Understand meeting purpose and participants
2. Gather context on attendees and relationships
3. Surface relevant open items, threads, or history
4. Prepare talking points aligned to objectives
5. Anticipate questions you may face
6. Clarify your desired outcomes

## Process

### 1. Clarify the Meeting

Ask for or extract:

- Meeting purpose/agenda
- Attendee list
- Your role in the meeting (driver, participant, observer)
- Any specific concerns or goals

If the user provides a calendar invite or agenda, parse it for this information.

### 2. Gather Attendee Context

For each attendee, surface what's relevant:

- Role and responsibilities
- Recent interactions or history with you
- Their likely priorities or concerns
- Communication style (if known)

**Sources to check (if available):**

- Previous meeting notes
- Slack/email threads
- Project docs they're involved in
- CRM or people data

Adapt depth to meeting stakes:

- Low stakes (routine sync): Brief context
- High stakes (exec review, negotiation): Detailed background

### 3. Surface Open Items

Find relevant threads that may come up:

- Action items assigned to you or them
- Pending decisions
- Recent issues or blockers
- Previous commitments made

Connect items to specific attendees when possible.

### 4. Prepare Talking Points

Based on the meeting purpose, create talking points:

- Lead with your main objective
- Support points that reinforce your position
- Potential objections and responses
- Questions you want to ask

Structure depends on meeting type:

- **1:1:** Topics for discussion, feedback to give/receive
- **Team meeting:** Updates, decisions needed, blockers
- **Exec meeting:** Key message, supporting data, ask
- **External meeting:** Agenda, relationship context, goals

### 5. Anticipate Questions

List questions you're likely to be asked:

- Status questions ("Where are we on X?")
- Decision questions ("What do you recommend?")
- Challenge questions ("Why not Y instead?")

Prepare brief answers or note what you need to find out.

### 6. Clarify Desired Outcomes

State explicitly:

- What you want to walk away with
- Decisions you need made
- Information you need to gather
- Relationships you want to strengthen

## Output Format

```markdown
# Meeting Prep: [Meeting Name]

**Date:** [date]
**Attendees:** [list]
**Your Role:** [driver/participant/observer]

## Meeting Purpose

[What this meeting is for]

## Attendee Context

### [Name 1]

- Role: [their role]
- Relevant context: [what you need to know]

### [Name 2]

...

## Open Items

- [Item 1] — relates to [attendee/topic]
- [Item 2] — relates to [attendee/topic]

## Talking Points

1. [Main point]
2. [Supporting point]
3. [Question to ask]

## Anticipated Questions

- Q: [Question]
  A: [Your prepared response]

## Desired Outcomes

- [ ] [Outcome 1]
- [ ] [Outcome 2]
```

## Adapts To

**Meeting type:**

- 1:1s — Focus on relationship, feedback, career topics
- Team meetings — Focus on coordination, decisions, blockers
- Exec meetings — Focus on key message, data, clear ask
- External/vendor — Focus on relationship context, negotiation points

**Stakes level:**

- Routine — Quick context, minimal prep
- Important — Full context, prepared talking points
- Critical — Deep research, rehearsed responses, backup plans

**Information availability:**

- Rich context (CRM, meeting history) — Pull detailed background
- Limited context — Focus on what can be gathered, flag gaps

## Quality Checks

Before delivering the prep document:

- [ ] Meeting purpose is clearly stated
- [ ] Each attendee has relevant context (not generic bios)
- [ ] Open items are specific and actionable
- [ ] Talking points connect to meeting objectives
- [ ] Desired outcomes are concrete and measurable
- [ ] Prep depth matches meeting stakes
- [ ] Nothing included that won't help the meeting

## Common Pitfalls

**Avoid:**

- Generic attendee descriptions (job titles without context)
- Talking points unconnected to the meeting purpose
- Preparing for a different meeting than the one scheduled
- Over-preparing for low-stakes meetings
- Under-preparing for high-stakes meetings

**Instead:**

- Focus context on what's relevant to this specific meeting
- Tie every talking point to your objectives
- Match prep depth to stakes
