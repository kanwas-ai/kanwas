---
name: mom-test
description: Review customer interview questions using Rob Fitzpatrick's Mom Test methodology. Use when preparing for customer discovery interviews, user research, or any conversation where you need to learn about real behavior and problems rather than collect opinions or compliments.
---

# Mom Test

Review interview questions to ensure they extract useful information about real behavior, not opinions or hypotheticals.

## The Methodology

**Source:** Rob Fitzpatrick, "The Mom Test: How to talk to customers and learn if your business is a good idea when everyone is lying to you"

The core insight: People will lie to you—not maliciously, but to be nice. Your mom will tell you your idea is great even if it isn't. The Mom Test is a set of rules for asking questions that even your mom can't lie about.

### The Three Rules

1. **Talk about their life, not your idea**
   - Their problems, their context, their workflow
   - Not your solution, your features, your vision

2. **Ask about specifics in the past, not generics or opinions**
   - What actually happened, with concrete details
   - Not what they would do, might do, or think they want

3. **Talk less, listen more**
   - You're there to learn, not to pitch
   - Silence is powerful—let them fill it

### Bad Patterns to Flag

| Pattern                     | Why It's Bad                                        | Example                                  |
| --------------------------- | --------------------------------------------------- | ---------------------------------------- |
| **Fishing for compliments** | People will say nice things to end the conversation | "Would you use this?"                    |
| **Hypotheticals**           | Predictions about future behavior are worthless     | "Would you pay $20/month?"               |
| **Leading questions**       | You're feeding them the answer you want             | "Don't you think reports take too long?" |
| **Future predictions**      | People are terrible at predicting what they'll do   | "How often would you use this?"          |
| **Generic questions**       | You get generic, useless answers                    | "What do you usually do when...?"        |

## Process

### 1. Review Each Question

For every proposed interview question, check:

- Does it ask about their life or your idea?
- Does it focus on past specifics or future hypotheticals?
- Is it open-ended or leading?

### 2. Flag Violations

Identify which rule each problematic question violates. Be specific about what's wrong.

### 3. Suggest Improvements

Transform bad questions into good ones by:

- Anchoring in specific past events
- Removing your solution from the question
- Making it impossible to answer with a polite lie

### 4. Check Question Balance

The overall question set should:

- Mostly focus on their world, not your idea
- Include questions about their current workflow and pain
- Save solution-related questions for late in the conversation (if at all)

## Before and After Examples

### Example 1: The Compliment Fisher

**Bad:** "Would you use an app that helps you track expenses?"

_Problem:_ Hypothetical + fishing for compliments. They'll say "sure" to be nice.

**Good:** "Walk me through what happened the last time you needed to figure out where your money went."

_Why it works:_ Asks about a specific past event. Their answer reveals if this is a real problem and how they currently solve it.

### Example 2: The Hypothetical Price

**Bad:** "Would you pay $50/month for this?"

_Problem:_ Future prediction. People say yes to things they'd never actually buy.

**Good:** "What are you currently spending to solve this problem? Show me the receipts or subscriptions."

_Why it works:_ Past behavior with real money. If they're spending $0 now, $50/month is unlikely.

### Example 3: The Leading Question

**Bad:** "Don't you find it frustrating when your reports take forever?"

_Problem:_ Leading. You're telling them what to feel.

**Good:** "Tell me about the last report you had to create. How did that go?"

_Why it works:_ Open-ended, past-focused. If reports are actually frustrating, they'll tell you unprompted.

### Example 4: The Generic Question

**Bad:** "What features would you want in a project management tool?"

_Problem:_ Generic hypothetical. You'll get a wish list of features they'll never use.

**Good:** "What happened the last time a project went off track? Walk me through it."

_Why it works:_ Specific past event reveals real problems and current workarounds.

### Example 5: The Idea Pitch Disguised as a Question

**Bad:** "We're building a tool that uses AI to auto-generate meeting summaries. What do you think?"

_Problem:_ You're pitching, not learning. They'll be polite about your idea.

**Good:** "After your last team meeting, what happened to the decisions that were made? How did people know what to do next?"

_Why it works:_ Learns about their actual post-meeting workflow without mentioning your solution.

## Recommending Follow-Up Prompts

Good interviews go deeper. For any answer, suggest follow-ups like:

- "Can you tell me more about that?"
- "What happened next?"
- "Why did you do it that way?"
- "How did you decide between options?"
- "What was the hardest part?"
- "Can you show me?"

These keep the conversation in specific, past territory.

## Quality Checks

After reviewing questions, verify:

- [ ] Questions focus on past behavior, not future predictions
- [ ] No hypotheticals ("Would you...", "Could you see yourself...")
- [ ] No fishing for compliments ("Do you like...", "Would you use...")
- [ ] Open-ended, not leading (no "Don't you think...")
- [ ] Most questions are about their life, not your idea
- [ ] Questions seek specific examples, not general opinions
- [ ] Solution/product questions saved for end (if included at all)

## Output Format

For each reviewed question, provide:

```
ORIGINAL: [Their question]
VERDICT: [Pass / Needs Work]
ISSUE: [If applicable—which rule it violates]
IMPROVED: [Better version of the question]
WHY: [Brief explanation of the improvement]
```

End with a summary of the overall question set and any gaps (e.g., "Missing questions about current workflow" or "Too focused on your solution").
