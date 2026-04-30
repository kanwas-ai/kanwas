---
name: slack-message
description: Sharpen Slack messages to be clear, concise, and actionable. Use when drafting messages that need responses, sharing context asynchronously, or when a message feels too long or unclear. Transforms rambling or fragmented messages into single, complete communications that respect readers' attention.
---

# Slack Message

Transform draft Slack messages into clear, concise async communication.

**Input:** Draft message or intent (what you want to say/ask)
**Output:** Clean, actionable Slack message

## What Good Looks Like

- One complete message, not five fragments
- Ask or information is immediately clear
- Context included upfront, not dripped in follow-ups
- No "Hi, quick question?" openers that force waiting
- Specific enough to get a response without back-and-forth
- Scannable — reader gets the point in seconds

## Process

1. **Identify the core ask or information**
   - What do you need from the reader?
   - What must they know or do?

2. **Front-load context**
   - Include what they need to understand your ask
   - Don't make them ask "wait, what's this about?"

3. **Make the ask explicit**
   - Bad: "Thoughts?"
   - Good: "Can you review by Thursday and flag any blockers?"

4. **Cut preamble**
   - Remove: "Hey! Hope you're having a good week. Quick question..."
   - Start with substance

5. **Check the medium**
   - Too long? → Might be a doc with a Slack link
   - Needs discussion? → Might be a meeting
   - FYI only? → Make that clear, no fake questions

6. **Format for scanning**
   - Use line breaks for distinct points
   - Bold key asks if multiple items
   - Keep it under 10 lines when possible

## Example

**Before:**

```
Hey Sarah!

Hope you're doing well! Quick question for you.

So I was looking at the Q3 roadmap and noticed we have the checkout redesign slated for August but I was talking to Marcus yesterday and he mentioned the payments team might have some dependencies we need to think about.

Do you know anything about this?

Also wondering if we should loop in the payments team earlier.

Let me know what you think!

Thanks!
```

**After:**

```
Quick sync needed on checkout redesign timing (Q3 roadmap):

Marcus mentioned the payments team may have dependencies that affect our August timeline. Two questions:

1. Are you aware of any payments team blockers for checkout redesign?
2. Should we loop them in now vs. closer to August?

Happy to set up a quick call if easier to discuss.
```

## Quality Checks

- [ ] Could this be one message instead of multiple?
- [ ] Is the ask explicit — could someone respond without asking clarifying questions?
- [ ] Does it open with substance, not pleasantries?
- [ ] Is context included, or will they need to ask "what's this about?"
- [ ] Is it scannable — can they get the point in 5 seconds?
- [ ] Is Slack the right medium, or should this be a doc/meeting?
