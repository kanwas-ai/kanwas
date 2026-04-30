---
name: opportunity-solution-tree
description: Build an Opportunity Solution Tree when exploring how to achieve a product outcome. Use when you have a target metric or goal and need to systematically map user opportunities to testable solutions. Applies Teresa Torres' framework from Continuous Discovery Habits.
---

# Opportunity Solution Tree

Map from a desired outcome to user opportunities to testable solutions. The tree structure ensures solutions trace back to real user needs, not assumptions.

## The Methodology

**Source:** Teresa Torres, _Continuous Discovery Habits_ (2021)

The OST is a visual framework that connects:

1. **Outcome** — A measurable business or product metric you want to move
2. **Opportunities** — User needs, pain points, or desires that could influence the outcome
3. **Solutions** — Ideas that address specific opportunities
4. **Experiments** — Lightweight tests to validate solutions before building

Key principles:

- Opportunities are framed from the user's perspective, not the business
- Multiple solutions per opportunity (avoid "pet solution" bias)
- Experiments are cheap and fast — assumption tests, not MVPs
- The tree is living — updated as you learn

## Process

### 1. Define the Outcome

Start with a single, measurable outcome.

Ask:

- What metric are we trying to move?
- Is this within the team's control?
- Can we measure progress weekly/monthly?

Bad: "Improve the user experience"
Good: "Increase 7-day retention from 40% to 50%"

### 2. Map Opportunities

Brainstorm user needs, pain points, and desires that could affect the outcome.

Rules:

- Frame as user problems, not solutions ("users struggle to find X" not "add search")
- Pull from research — interviews, support tickets, analytics
- Cast wide first, then cluster related opportunities

Structure opportunities hierarchically:

- Top-level: broad opportunity areas
- Sub-opportunities: specific, actionable needs

### 3. Prioritize Opportunities

Not all opportunities are equal. Assess:

| Factor           | Question                          |
| ---------------- | --------------------------------- |
| Opportunity size | How many users? How painful?      |
| Market factors   | Competitors solving this? Timing? |
| Company factors  | Strategic fit? Capability?        |
| Customer factors | Willingness to pay? Urgency?      |

Select 1-3 opportunities to explore with solutions.

### 4. Generate Solutions

For each prioritized opportunity, brainstorm multiple solutions.

Rules:

- Minimum 3 solutions per opportunity
- Include "boring" solutions (not just the exciting ones)
- Vary in scope — small fixes to large bets
- No evaluation yet — quantity first

### 5. Design Experiments

For promising solutions, design assumption tests.

Types:

- **Prototype tests** — Show mockups, gauge reaction
- **One-question surveys** — Validate the problem exists
- **Fake door tests** — Measure intent before building
- **Concierge tests** — Deliver the value manually first
- **Data analysis** — Check if behavior patterns support the assumption

Each experiment should answer: "What's the riskiest assumption, and how can we test it cheaply?"

### 6. Synthesize the Tree

Present the complete OST structure:

```
OUTCOME: [Measurable goal]
│
├── Opportunity A: [User need/pain]
│   ├── Solution A1: [Idea]
│   │   └── Experiment: [Test]
│   ├── Solution A2: [Idea]
│   └── Solution A3: [Idea]
│
├── Opportunity B: [User need/pain]
│   ├── Solution B1: [Idea]
│   └── Solution B2: [Idea]
│       └── Experiment: [Test]
│
└── Opportunity C: [User need/pain]
    └── Solution C1: [Idea]
```

## Example

**Input:** "We need to increase trial-to-paid conversion"

**Output:**

```
OUTCOME: Increase trial-to-paid conversion from 8% to 12%
│
├── Opportunity: Users don't experience core value during trial
│   ├── Solution: Guided onboarding flow highlighting key features
│   │   └── Experiment: A/B test guided vs. self-serve onboarding
│   ├── Solution: Pre-populate with sample data so product isn't empty
│   └── Solution: Email sequence with use case tutorials
│
├── Opportunity: Users forget about the product after signup
│   ├── Solution: Re-engagement email on day 3 and 7
│   │   └── Experiment: Track open/click rates and return visits
│   ├── Solution: Browser push notifications for activity
│   └── Solution: Weekly digest email showing what they're missing
│
├── Opportunity: Pricing page is confusing
│   ├── Solution: Simplify to 2 tiers instead of 4
│   ├── Solution: Add comparison table with competitor pricing
│   └── Solution: Add "most popular" badge to recommended plan
│       └── Experiment: Heatmap analysis of pricing page interactions
│
└── Opportunity: Users unsure if product fits their workflow
    ├── Solution: Integration showcase during trial
    └── Solution: "Book a demo" CTA for complex use cases
        └── Experiment: Track demo requests vs. conversion rate
```

**Prioritized for experimentation:** "Users don't experience core value during trial" — highest impact, directly tied to outcome.

## Quality Checks

- [ ] Outcome is a specific, measurable metric (not "improve X")
- [ ] Opportunities are user needs/pains, not disguised solutions
- [ ] Each opportunity has 2+ distinct solutions
- [ ] Solutions vary in scope (quick wins and bigger bets)
- [ ] Experiments test assumptions, not full features
- [ ] Tree structure is clear — solutions trace to opportunities trace to outcome
- [ ] At least one opportunity is prioritized for next action
