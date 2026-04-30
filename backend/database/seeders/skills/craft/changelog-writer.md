---
name: changelog-writer
description: Transform git commits, pull requests, and technical changes into user-facing release notes that communicate value. Use when you have a list of merged PRs or commits and need to produce a changelog that non-technical users can understand and care about.
---

# Changelog Writer

Transform developer-focused changes into user-facing release notes that communicate value, not implementation.

## What Good Looks Like

- **User-centric framing** — Describes what users can now do, not what developers changed
- **Grouped by impact** — Features, improvements, fixes (not by component or PR)
- **Right level of detail** — Enough to understand, not enough to confuse
- **Consistent tone** — Professional but human, matches product voice
- **Scannable** — Users find what matters to them in seconds
- **No jargon** — Technical terms translated or omitted

## The Translation Problem

Developers write for developers:

- "Refactored auth middleware to use async token validation"
- "Fixed race condition in WebSocket reconnection handler"
- "Added Redis caching layer for user preferences"

Users need to understand impact:

- "Login is now faster and more reliable"
- "Fixed an issue where real-time updates could stop working"
- "Your settings now load instantly"

The skill is knowing which changes matter to users and how to express them.

## Process

1. **Gather raw input**
   - Collect commits, PR titles, and PR descriptions
   - Note the version number and date range
   - Identify any breaking changes or migration requirements

2. **Categorize by user impact**
   - **New** — Capabilities users didn't have before
   - **Improved** — Existing features that work better
   - **Fixed** — Problems that are now resolved
   - **Changed** — Behavior differences users need to know about
   - **Removed** — Features that are gone (rare, handle carefully)

3. **Filter what to include**
   - Include: User-visible changes, performance improvements users notice, fixed bugs users could hit
   - Exclude: Refactoring, internal tooling, dependency updates (unless security), test changes
   - Gray area: Infra changes — include only if they affect reliability or performance users experience

4. **Translate each item**
   - Start with the user benefit, not the implementation
   - Use active voice: "You can now..." or "Fixed issue where..."
   - Be specific about what changed, vague about how
   - One sentence per item, two max for significant features

5. **Group and order**
   - Order sections: New > Improved > Fixed > Changed > Removed
   - Within sections: Order by impact (most significant first)
   - Consolidate related changes into single entries

6. **Add context where needed**
   - Breaking changes: Clear migration steps
   - Major features: Brief explanation of how to use
   - Security fixes: Appropriate urgency without alarm

## Template

```markdown
# v[VERSION] - [DATE]

## New

- [User benefit — what you can now do]
- [User benefit — what you can now do]

## Improved

- [What's better and why it matters]
- [Performance improvement users notice]

## Fixed

- [Issue that was happening] is now resolved
- Fixed [specific problem] that affected [who/when]

## Changed

- [Old behavior] is now [new behavior]
```

## Example

### Input (PR Titles)

```
- feat: Add bulk export for dashboard widgets (#1234)
- fix: Resolve WebSocket disconnection on network change (#1235)
- refactor: Extract shared validation logic to utils (#1236)
- fix: Correct timezone handling in scheduled reports (#1237)
- chore: Update lodash to 4.17.21 (#1238)
- feat: Support dark mode in email templates (#1239)
- perf: Add Redis caching for user preferences (#1240)
- fix: Handle edge case in CSV parser for quoted fields (#1241)
```

### Output (Release Notes)

```markdown
# v2.4.0 - January 24, 2026

## New

- Export multiple dashboard widgets at once — select the widgets you need and download them in a single file
- Email notifications now support dark mode for users who prefer it

## Improved

- Settings and preferences now load faster across the app

## Fixed

- Real-time updates now reconnect automatically when your network changes
- Scheduled reports now arrive at the correct time regardless of timezone
- CSV imports now handle quoted fields correctly
```

Note what was excluded:

- Refactor PR (#1236) — no user impact
- Lodash update (#1238) — internal dependency
- Redis caching (#1240) — included as user-facing improvement, not as technical change

## Quality Checks

Before publishing, verify:

- [ ] Every item answers "what can users do now?" or "what problem is fixed?"
- [ ] No implementation details leaked through (no "refactored", "middleware", "handler")
- [ ] Breaking changes are clearly marked with migration steps
- [ ] Changes are grouped by impact, not by code area
- [ ] Most important changes appear first in each section
- [ ] Tone is consistent throughout
- [ ] A non-technical user could read this and understand what changed

## Common Mistakes

**Technical framing:**

- Bad: "Optimized database queries for the reporting module"
- Good: "Reports now generate noticeably faster"

**Missing the benefit:**

- Bad: "Added retry logic to email sending"
- Good: "Emails are now more reliably delivered"

**Too vague:**

- Bad: "Various bug fixes and improvements"
- Good: List the specific fixes users care about, omit the rest

**Including everything:**

- Bad: Every commit becomes a line item
- Good: Curate — only user-facing changes, consolidated where sensible

**Inconsistent tone:**

- Bad: Mix of "we added", "you can now", "the system will", passive voice
- Good: Pick a voice and stick with it (prefer "you can now" or active third person)
