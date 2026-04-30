---
name: meeting-notes
description: Transform raw meeting discussions into structured, actionable notes. Use when you have meeting transcripts, audio summaries, or rough notes that need to be converted into a clear record with decisions, action items, and key context for distribution.
---

# Meeting Notes

Convert ephemeral meeting conversations into durable, actionable records.

## What Good Looks Like

- Decisions captured explicitly with rationale
- Action items have owners and due dates
- Key context preserved for non-attendees
- Scannable structure (headers, bullets, not walls of text)
- Distinguishes facts from opinions/interpretations

## Process

1. **Identify the meeting metadata**
   - Date, attendees, purpose/agenda
   - If not provided, ask or note as unknown

2. **Extract decisions**
   - What was decided (not just discussed)
   - Who made the decision
   - Brief rationale if available

3. **Extract action items**
   - Specific task (what)
   - Owner (who)
   - Due date (when) — flag if missing
   - Dependencies if relevant

4. **Capture key discussion points**
   - Major topics covered
   - Different viewpoints expressed
   - Context that explains decisions

5. **Note open items**
   - Unresolved questions
   - Parking lot items for future meetings
   - Blocked items waiting on external input

6. **Format for scannability**
   - Use consistent headers
   - Bullets over paragraphs
   - Bold key terms and names

## Output Format

```markdown
# [Meeting Name] — [Date]

**Attendees:** [Names]
**Purpose:** [One line]

## Decisions

- **[Decision]** — [Brief rationale]
  - Decided by: [Name/role]

## Action Items

| Action | Owner  | Due    | Status |
| ------ | ------ | ------ | ------ |
| [Task] | [Name] | [Date] | Open   |

## Discussion Summary

### [Topic 1]

- [Key point]
- [Key point]

### [Topic 2]

- [Key point]

## Open Items

- [ ] [Question or parking lot item]

## Next Steps

- Next meeting: [Date/TBD]
- [Any prep needed]
```

## Before/After Example

### Before (Raw Input)

```
standup today - me, sarah, mike

talked about the API stuff. sarah said the auth is done, mike still working on rate limiting. i mentioned we need to decide on the retry logic - sarah thinks exponential backoff, mike wants fixed intervals. we went with exponential since thats more standard.

mike said he can finish rate limiting by friday if QA is free. sarah will review his PR.

oh also we might need to push the release if the security audit takes longer, but thats TBD. need to check with ops.

next standup wednesday
```

### After (Structured Notes)

```markdown
# Engineering Standup — 2024-01-15

**Attendees:** [Author], Sarah, Mike
**Purpose:** Daily sync on API development

## Decisions

- **Use exponential backoff for retry logic** — More aligned with industry standards
  - Decided by: Team consensus (Sarah's recommendation)

## Action Items

| Action                                    | Owner        | Due              | Status      |
| ----------------------------------------- | ------------ | ---------------- | ----------- |
| Complete rate limiting implementation     | Mike         | 2024-01-19 (Fri) | In progress |
| Review rate limiting PR                   | Sarah        | After Mike's PR  | Pending     |
| Check with Ops on security audit timeline | [Unassigned] | TBD              | Open        |

## Discussion Summary

### API Development Status

- Auth implementation complete (Sarah)
- Rate limiting in progress (Mike) — dependent on QA availability

### Retry Logic

- Two options discussed: exponential backoff vs fixed intervals
- Team selected exponential backoff

## Open Items

- [ ] Security audit timeline — may impact release date
- [ ] QA availability for rate limiting testing

## Next Steps

- Next meeting: Wednesday
```

## Quality Checks

Before finalizing, verify:

- [ ] Every decision has a clear statement of what was decided
- [ ] Every action item has an owner (or explicitly flagged as unassigned)
- [ ] Every action item has a due date (or explicitly flagged as TBD)
- [ ] Non-attendees could understand what happened from the notes alone
- [ ] No transcript-style content — synthesized, not transcribed
- [ ] Open items are clearly distinguished from action items
- [ ] Attendee names are correct and consistent throughout

## Handling Incomplete Input

If the input is missing critical information:

| Missing              | How to handle                        |
| -------------------- | ------------------------------------ |
| Date                 | Note as "[Date unknown]"             |
| Attendees            | Note as "[Attendees not specified]"  |
| Decision rationale   | Note decision only, omit rationale   |
| Action item owner    | Flag as "[Unassigned — needs owner]" |
| Action item due date | Flag as "TBD"                        |

Never invent information. Flag gaps explicitly.

## Adapts To

- **Formal meetings** — More structure, explicit sections
- **Casual syncs** — Lighter format, focus on action items
- **Large meetings** — Group discussion by topic/team
- **1:1s** — May have more personal context, handle with discretion
