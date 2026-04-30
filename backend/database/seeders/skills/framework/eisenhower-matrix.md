---
name: eisenhower-matrix
description: Categorize tasks or decisions using the Eisenhower Matrix (urgent vs important). Use when facing a backlog of tasks, planning priorities, or deciding what to tackle first. Helps distinguish between what feels pressing and what actually matters.
---

# Eisenhower Matrix

Categorize items into four quadrants based on urgency and importance, then recommend appropriate actions for each.

## The Methodology

**Source:** Attributed to Dwight D. Eisenhower; popularized by Stephen Covey in "The 7 Habits of Highly Effective People"

The matrix distinguishes two axes:

- **Urgent:** Demands immediate attention; time-sensitive
- **Important:** Contributes to long-term goals, values, or mission

|                   | Urgent       | Not Urgent    |
| ----------------- | ------------ | ------------- |
| **Important**     | Q1: Do First | Q2: Schedule  |
| **Not Important** | Q3: Delegate | Q4: Eliminate |

**Quadrant definitions:**

- **Q1 (Do First):** Crisis, deadlines, problems requiring immediate action
- **Q2 (Schedule):** Strategic work, planning, relationship-building, prevention
- **Q3 (Delegate):** Interruptions, some meetings, others' priorities imposed on you
- **Q4 (Eliminate):** Time-wasters, busy work, pleasant but unproductive activities

## Process

1. **Gather items** — List all tasks, decisions, or items to categorize
2. **Assess urgency** — For each item: Does it require action within 24-48 hours? Is there a hard deadline soon?
3. **Assess importance** — For each item: Does it contribute to stated goals? Would ignoring it have significant consequences?
4. **Place in quadrant** — Assign based on both assessments
5. **Challenge Q1** — Review "Do First" items critically. Many feel urgent but aren't truly important, or feel important but aren't actually urgent
6. **Recommend actions** — Provide specific guidance per quadrant

## Example Categorization

**Input:** Product manager's Monday task list

| Task                                      | Urgency                     | Importance                     | Quadrant      |
| ----------------------------------------- | --------------------------- | ------------------------------ | ------------- |
| Production bug affecting customers        | High (active impact)        | High (revenue, trust)          | Q1: Do First  |
| Quarterly roadmap planning                | Low (no deadline this week) | High (strategic direction)     | Q2: Schedule  |
| Respond to vendor demo request            | High (they're waiting)      | Low (not evaluating vendors)   | Q3: Delegate  |
| Organize old Confluence pages             | Low                         | Low                            | Q4: Eliminate |
| Prepare for tomorrow's stakeholder review | High (meeting is tomorrow)  | High (key decision point)      | Q1: Do First  |
| Research competitor feature               | Low                         | Medium-High (informs strategy) | Q2: Schedule  |

**Output format:**

```
## Q1: Do First (Urgent + Important)
- Production bug affecting customers — Address immediately
- Prepare for stakeholder review — Complete today

## Q2: Schedule (Not Urgent + Important)
- Quarterly roadmap planning — Block 2 hours this week
- Research competitor feature — Add to this week's calendar

## Q3: Delegate (Urgent + Not Important)
- Respond to vendor demo request — Have team member decline or defer

## Q4: Eliminate (Not Urgent + Not Important)
- Organize old Confluence pages — Remove from list; do only if all else done
```

## Handling Edge Cases

**"Everything feels urgent"**

- Ask: What happens if this waits 48 hours? If nothing breaks, it's not urgent
- Look for artificial urgency (self-imposed deadlines, fear of disappointing others)

**"Everything feels important"**

- Ask: Does this connect to a stated goal or OKR? If not, question its importance
- Compare items: If you could only do three things this week, which would they be?

**Items that don't fit cleanly**

- Default to the more cautious quadrant (Q1 over Q2, Q2 over Q4)
- Note the uncertainty: "Borderline Q1/Q2 — clarify deadline"

## Quality Checks

- [ ] Urgency and importance are evaluated separately (not conflated)
- [ ] Q1 contains 3 or fewer items (if more, re-examine — not everything can be top priority)
- [ ] Q2 items have specific scheduling recommendations (not just "do later")
- [ ] Q3 items include delegation suggestions (who or how)
- [ ] Q4 items are explicitly marked for elimination or deprioritization
- [ ] Reasoning is visible for non-obvious categorizations
