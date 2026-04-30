---
name: user-story-writer
description: Transform feature ideas, requirements, or stakeholder requests into well-formed user stories with testable acceptance criteria. Use when you have a rough feature concept, product requirement, or verbal request that needs to become a clear, actionable user story for backlog grooming, sprint planning, or development handoff.
featured: true
---

# User Story Writer

Transform feature ideas into user stories developers can build and QA can test.

## What Good Looks Like

- **User-centered framing** — Written from the user's perspective, not the system's
- **Clear value statement** — The "so that" explains why this matters
- **Right scope** — Small enough to complete in one sprint, big enough to deliver value
- **Testable acceptance criteria** — QA can verify each criterion with a specific test
- **Independent** — Can be built without waiting for other stories (where possible)
- **No implementation details** — Describes what, not how

## The User Story Format

```
As a [specific user type],
I want [capability or action],
So that [benefit or outcome].
```

**Each part matters:**

- **As a** — Who specifically benefits? Not "user" — be precise.
- **I want** — What capability? One thing, stated simply.
- **So that** — Why does this matter? What problem does it solve?

## Process

1. **Identify the user** — Who actually wants this? Be specific.
   - Bad: "As a user"
   - Good: "As a hiring manager", "As a first-time buyer", "As an admin"

2. **Extract the core need** — What does this user actually need to do?
   - Strip out implementation suggestions
   - Focus on capability, not mechanism
   - One story = one capability

3. **Articulate the value** — Why does this matter to them?
   - Connect to their goal or pain point
   - If you can't explain the value, question whether to build it

4. **Write acceptance criteria:**
   - Start each with "Given... When... Then..." or a testable statement
   - Include happy path and key edge cases
   - Make each criterion independently verifiable
   - 3-7 criteria is typical; more suggests the story is too big

5. **Check scope:**
   - Can this be done in one sprint? If not, split it.
   - Does it deliver standalone value? If not, combine or reframe.

## Example

### Before (raw input)

"We need to let people save their searches so they don't have to keep entering the same filters every time they come back to the site."

### After (user story)

**As a** frequent job searcher,
**I want** to save my search criteria,
**So that** I can quickly check for new matches without re-entering filters each visit.

**Acceptance Criteria:**

- [ ] Given a logged-in user with active filters, when they click "Save Search," then the current filters are stored with a user-provided name
- [ ] Given a user with saved searches, when they view their saved searches, then they see a list of all saved searches with names and filter summaries
- [ ] Given a user viewing saved searches, when they click a saved search, then those filters are applied to the current search
- [ ] Given a user with saved searches, when they delete a saved search, then it is removed from their list
- [ ] Given a guest user, when they attempt to save a search, then they are prompted to log in or create an account

**Out of Scope:**

- Email notifications for saved searches (separate story)
- Sharing saved searches with other users

---

## Quality Checks

Before finalizing:

- [ ] **User is specific** — Not "user" or "customer" — a real persona or role
- [ ] **Value is clear** — "So that" explains actual benefit, not restates the want
- [ ] **Single capability** — Story does one thing, not a feature bundle
- [ ] **Acceptance criteria are testable** — Each can be verified with a specific test
- [ ] **No implementation prescribed** — Says what, not how to build it
- [ ] **Right size** — Completable in one sprint, delivers standalone value
- [ ] **Edge cases covered** — Error states, empty states, permissions considered

## Common Mistakes

**Vague user:**

- Bad: "As a user, I want to save searches..."
- Good: "As a frequent job searcher, I want to save searches..."

**Missing value:**

- Bad: "...so that I can save searches"
- Good: "...so that I can quickly check for new matches without re-entering filters"

**Multiple capabilities bundled:**

- Bad: "I want to save, edit, share, and get notifications for my searches"
- Good: Split into 4 separate stories

**Implementation in the story:**

- Bad: "I want a dropdown menu in the header that shows saved searches"
- Good: "I want to access my saved searches quickly from any page"

**Untestable acceptance criteria:**

- Bad: "Search saving works correctly"
- Good: "Given a logged-in user with active filters, when they click 'Save Search,' then the current filters are stored with a user-provided name"

**Story too big:**

- Sign: More than 7 acceptance criteria
- Sign: Touches multiple user types
- Sign: Can't estimate confidently
- Fix: Split by user flow, by user type, or by happy path vs edge cases
