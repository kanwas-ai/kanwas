---
name: mece
description: Apply MECE (Mutually Exclusive, Collectively Exhaustive) structure to any analysis, breakdown, or categorization. Use when organizing information into categories, structuring problem decomposition, creating taxonomies, or reviewing existing structures for logical completeness. Ensures no overlaps and no gaps.
---

# MECE

Structure analysis to be Mutually Exclusive and Collectively Exhaustive.

## The Methodology

**Source:** McKinsey & Company consulting methodology, developed in the 1960s by Barbara Minto during her time at the firm.

### Core Principles

**Mutually Exclusive (ME):** Categories do not overlap. Each item belongs to exactly one category.

**Collectively Exhaustive (CE):** Categories cover everything. No item is left uncategorized.

### Common MECE Structures

| Structure     | Example                   | Use when...                        |
| ------------- | ------------------------- | ---------------------------------- |
| **Binary**    | Yes/No, Internal/External | Clear either/or distinction exists |
| **Process**   | Before/During/After       | Analyzing phases or stages         |
| **Component** | People/Process/Technology | Breaking down a system             |
| **Algebraic** | Revenue = Price × Volume  | Mathematical relationship exists   |
| **Framework** | 2×2 matrix, numbered list | Using established model            |

## Process

### 1. Identify the Universe

Define what you're categorizing. Be precise.

- Bad: "Marketing problems"
- Good: "Reasons our Q3 campaign underperformed vs target"

### 2. Draft Initial Categories

Start with 3-7 categories. More than 7 suggests you need sub-levels.

### 3. Test for ME (No Overlaps)

For each item, ask: "Does this fit in more than one category?"

**If overlap exists:**

- Merge overlapping categories
- Create a parent category
- Redefine category boundaries

### 4. Test for CE (No Gaps)

Ask: "What could exist that doesn't fit anywhere?"

**If gaps exist:**

- Add missing category
- Broaden an existing category
- Add "Other" only as last resort (signals weak structure)

### 5. Check Abstraction Level

Categories should be at the same level of specificity.

- Bad: "Strategy, Tactics, Email marketing" (mixed levels)
- Good: "Strategy, Tactics, Operations" (same level)

### 6. Validate with Edge Cases

Test with unusual or boundary items. If they break the structure, refine it.

## Before/After Example

**Task:** Categorize customer feedback themes

### Before (Non-MECE)

```
- Product issues
- Bugs
- Feature requests
- Price complaints
- Service problems
- Slow response times
- Missing features
```

**Problems:**

- "Bugs" overlaps with "Product issues"
- "Missing features" overlaps with "Feature requests"
- "Slow response times" overlaps with "Service problems"
- No clear structure

### After (MECE)

```
Customer Feedback Themes
├── Product
│   ├── Defects (bugs, errors, crashes)
│   └── Gaps (missing features, limitations)
├── Service
│   ├── Responsiveness (speed, availability)
│   └── Quality (accuracy, helpfulness)
└── Commercial
    ├── Pricing (cost, value perception)
    └── Terms (contracts, policies)
```

**Why it works:**

- Each feedback item fits exactly one category
- Categories cover all possible feedback types
- Consistent abstraction level (Product/Service/Commercial, then subdivisions)

## Quality Checks

**Mutual Exclusivity:**

- [ ] Can you place any item in multiple categories? If yes, restructure.
- [ ] Are category boundaries crisp and unambiguous?

**Collective Exhaustiveness:**

- [ ] What edge case might not fit? Where would it go?
- [ ] Did you resort to "Other/Miscellaneous"? If so, your structure is likely incomplete.

**Structural Quality:**

- [ ] Are categories at the same level of abstraction?
- [ ] Is the structure actually useful, or just technically MECE?
- [ ] Can someone unfamiliar with the content understand the logic?

**Practical Test:**

- [ ] Take 5 random items. Can you categorize each in under 5 seconds?
- [ ] Would two people independently categorize items the same way?

## Common Failures

| Failure                  | Example                                                      | Fix                                      |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| **Overlap**              | "Digital" and "Social media" as separate categories          | Make digital the parent, social a child  |
| **Gap**                  | Categorizing employees by department, forgetting contractors | Add "Non-departmental" or redefine scope |
| **Mixed levels**         | "Strategy, Tactics, TikTok ads"                              | Move TikTok under appropriate parent     |
| **False exhaustiveness** | Large "Other" bucket                                         | Restructure to reduce Other to <10%      |
| **Over-engineering**     | 15 categories for 20 items                                   | Simplify; diminishing returns            |

## Applying to Different Tasks

### Problem Decomposition

Break complex problems into MECE sub-problems. Solve each, combine solutions.

### Option Analysis

Structure alternatives as MECE to ensure fair comparison and no blind spots.

### Data Classification

Create MECE taxonomies for consistent tagging and analysis.

### Presentation Structure

Organize arguments or findings in MECE sections for clarity.

### Process Design

Ensure process steps are MECE to avoid duplication or gaps in coverage.
