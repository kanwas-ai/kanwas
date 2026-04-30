---
name: scope-negotiation
description: Navigate from ambitious feature ideas to shippable MVP scope. Use when a feature feels too big, when stakeholders want everything, or when you need to find the smallest version that still delivers core value. Orchestrates the process of identifying what matters, what can wait, and how to communicate cuts without losing buy-in.
featured: true
---

# Scope Negotiation

Transform overwhelming feature requests into focused, shippable scope. Find the version that delivers core value without the bloat.

## What This Orchestrates

1. **Core Value Extraction** — What problem are we actually solving?
2. **Must-Have Identification** — What's essential vs nice-to-have?
3. **MVP Definition** — The smallest version that delivers value
4. **Cut List** — What's explicitly out, and why
5. **Stakeholder Alignment** — How to communicate scope without losing trust

## Process

### 1. Understand the Full Picture

Before cutting, understand what's on the table:

- What's the original ask or feature vision?
- Who wants this, and why?
- What outcomes are they expecting?
- What constraints exist (timeline, resources, dependencies)?

Ask if unclear: "What would success look like if we shipped this perfectly?"

### 2. Extract Core Value

Find the essence. Ask:

- **What problem does this solve?** (Not features, the actual problem)
- **Who has this problem most acutely?** (The narrowest valuable audience)
- **What's the minimum that would solve it?** (Not delight—solve)

Warning signs that scope is bloated:

- "While we're at it, we should also..."
- Features that serve different user segments
- Edge cases driving main design
- Perfection before learning

Document: "The core value is [X] for [Y users] because [Z problem]."

### 3. Separate Must-Have from Nice-to-Have

For each proposed element, apply these filters:

**Must-have** if:

- Users cannot get the core value without it
- It's literally non-functional without it
- Removing it breaks the mental model

**Nice-to-have** if:

- It makes the experience better but isn't required
- It serves a subset of users
- It handles edge cases
- It's polish, not function

**Out for now** if:

- It's a second problem disguised as the same problem
- It requires infrastructure we don't have
- Value is speculative without validation

Create three buckets. Be ruthless about the first bucket.

### 4. Define the MVP

Assemble the minimum viable version:

```
MVP Scope: [Feature Name]

Core value: [One sentence]

Included:
- [Must-have 1]
- [Must-have 2]
- [Must-have 3]

Explicitly excluded:
- [Nice-to-have 1] — ship in v2
- [Nice-to-have 2] — needs validation first
- [Out for now 1] — separate initiative
```

Test the MVP definition:

- Can a user get the core value with just this?
- Is there anything here that could still be cut?
- Does this feel like a real thing, not a broken thing?

### 5. Build the Cut List

The cut list is a communication tool. For each cut:

```
| What's Cut | Why | When It Could Return |
|------------|-----|---------------------|
| [Feature A] | Serves only 5% of users | After v1 adoption data |
| [Feature B] | Requires API that doesn't exist | When dependency ships |
| [Feature C] | Nice polish, not core | After core is validated |
```

Frame cuts as sequencing, not rejection:

- Not: "We're not doing X"
- Instead: "We're shipping Y first, then X based on what we learn"

### 6. Align Stakeholders

Different stakeholders need different framing:

**To executives:**

- Lead with timeline/resource impact
- Show what ships faster by cutting
- Present as phased approach, not reduced scope

**To product partners:**

- Lead with learning opportunity
- Show what we validate with the MVP
- Present cut list as backlog, not graveyard

**To engineers:**

- Lead with technical simplicity
- Show reduced complexity and risk
- Present clean boundaries

**To requesters/customers:**

- Lead with problem solved
- Acknowledge their full vision
- Show path to more over time

## Adapts To

**By scope source:**

- Stakeholder request: Focus on understanding their underlying need, not just ask
- Technical opportunity: Focus on user value, not just capability
- Customer feedback: Focus on pattern vs single request
- Competitive pressure: Focus on differentiation, not parity

**By timeline pressure:**

- Urgent: Aggressive cuts, focus on "what can ship this week"
- Normal: Standard MVP process
- Exploratory: Can include learning-oriented scope

**By stakeholder dynamics:**

- High trust: Direct cuts, brief rationale
- Low trust: Extensive rationale, phased commitments
- Mixed: Per-stakeholder communication plans

**By uncertainty level:**

- High uncertainty: Smaller MVP, explicit "we'll learn and expand"
- Low uncertainty: Can include more, less experimentation framing

## Output Format

```markdown
## Scope Negotiation: [Feature Name]

### The Problem We're Solving

[One paragraph: the core problem, for whom, why it matters]

### MVP Scope

What's in:

- [Item 1]
- [Item 2]
- [Item 3]

What's out (and why):
| Item | Reason | Revisit When |
|------|--------|--------------|
| [A] | [Reason] | [Condition] |
| [B] | [Reason] | [Condition] |

### Stakeholder Messaging

**For [stakeholder 1]:** [Key point and framing]

**For [stakeholder 2]:** [Key point and framing]

### Open Questions

- [What needs validation]
- [What could change scope]
```

## Quality Checks

**Scope clarity:**

- [ ] Core value is one sentence, not a paragraph
- [ ] MVP includes only what's required for core value
- [ ] Cut list has specific items, not vague categories
- [ ] Each cut has a reason and a "revisit when"

**Intellectual honesty:**

- [ ] We're cutting to ship better, not just to ship faster
- [ ] Cuts are real reductions, not renamed deferrals
- [ ] We've acknowledged what we're giving up
- [ ] MVP is a real product, not a broken feature

**Communication readiness:**

- [ ] Different stakeholders have different framings
- [ ] Cuts are positioned as sequencing, not rejection
- [ ] Path to "more" is visible and credible
- [ ] We can defend the MVP as valuable on its own
