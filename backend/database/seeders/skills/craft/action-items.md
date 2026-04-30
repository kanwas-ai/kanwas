---
name: action-items
description: Extract action items from meeting notes, discussions, or email threads. Use when you have unstructured conversation content and need clear, assigned tasks with owners and deadlines.
---

# Action Items

Extract actionable tasks from discussions. Each item gets a clear owner, deadline, and definition of done.

## Process

1. **Scan for commitments** — Look for phrases like "I'll...", "Can you...", "We need to...", "Let's...", "Action:", agreed decisions
2. **Clarify vague items** — Turn "look into X" into specific deliverables
3. **Assign owners** — One person per item. If unclear, flag for clarification
4. **Add deadlines** — Extract explicit dates or infer from context. Flag missing deadlines
5. **Define done** — Each item should have an implicit or explicit completion state
6. **Group and format** — By owner, project, or deadline depending on context

## Output Format

```
## Action Items

### [Owner Name]
- [ ] **[Action]** — [Context if needed] | Due: [Date]
- [ ] **[Action]** — [Context if needed] | Due: [Date]

### [Owner Name]
- [ ] **[Action]** — [Context if needed] | Due: [Date]

---
**Needs clarification:**
- [Vague item] — Who owns this? What's the deadline?
```

## What Good Looks Like

- **Specific**: "Draft Q1 roadmap doc" not "work on roadmap"
- **Owned**: Single person responsible, not "the team"
- **Time-bound**: Explicit date or relative deadline
- **Completable**: Clear when it's done
- **Standalone**: Understandable without reading full notes

## Before/After Example

**Before (raw notes):**

```
Product sync 1/15

Talked about the homepage redesign. Sarah mentioned the mockups
are almost done. We should probably get feedback from customers
before building. James said he can reach out to a few people.
The analytics seem off — Mike will look into it.

Also need to figure out the pricing page copy. Marketing wants
to launch by end of month.
```

**After (extracted action items):**

```
## Action Items

### Sarah
- [ ] **Finalize homepage mockups** — Currently "almost done" | Due: 1/17

### James
- [ ] **Schedule 3 customer feedback sessions** — For homepage redesign review | Due: 1/22

### Mike
- [ ] **Investigate analytics discrepancy** — Dashboard showing unexpected numbers | Due: 1/19

---
**Needs clarification:**
- Pricing page copy — Who owns this? Marketing or Product? Launch target is end of January.
```

## Handling Ambiguity

When information is missing:

| Missing            | Action                                        |
| ------------------ | --------------------------------------------- |
| Owner              | List under "Needs clarification" with context |
| Deadline           | Infer from urgency cues or flag as TBD        |
| Specificity        | Propose concrete version, note assumption     |
| Definition of done | Make implicit completion state explicit       |

## Quality Checks

Before delivering, verify:

- [ ] Every item has exactly one owner (or flagged for clarification)
- [ ] Every item has a deadline (or explicitly marked TBD)
- [ ] No item starts with vague verbs: "look into", "think about", "discuss"
- [ ] Items are independent — can be completed without reading other items
- [ ] Nothing important from source material was missed
- [ ] Ambiguous items are separated and called out
