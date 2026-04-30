---
name: pr-description
description: Write pull request descriptions that speed up code review and document intent. Use when you have code changes ready to submit and need a clear, structured PR description that explains what changed, why, and how to verify it.
---

# PR Description

Write PR descriptions that help reviewers understand changes quickly and document decisions for future reference.

## What Good Looks Like

- **Scannable** — Reviewer gets the gist in 10 seconds
- **Complete** — No back-and-forth questions about basic context
- **Linked** — Related tickets, docs, or discussions are one click away
- **Testable** — Clear steps to verify the change works

## Process

1. **Analyze the changes**
   - Review the diff to understand scope
   - Identify the primary change vs supporting changes
   - Note any non-obvious implementation decisions

2. **Write the summary**
   - One sentence: what this PR does
   - One sentence: why (link to ticket/issue)
   - Keep it under 3 sentences total

3. **Document key decisions**
   - List alternatives considered (if relevant)
   - Explain non-obvious choices
   - Skip this section if changes are straightforward

4. **Add testing instructions**
   - Specific steps to verify the change
   - Include edge cases worth checking
   - Note any setup required

5. **Include visual evidence** (if applicable)
   - Screenshots for UI changes
   - Before/after comparisons
   - Terminal output for CLI changes

6. **Note deployment considerations**
   - Migrations required
   - Feature flags
   - Config changes
   - Skip if none

## Template

```markdown
## Summary

[One sentence: what changed]
[One sentence: why — link to ticket]

## Changes

- [Key change 1]
- [Key change 2]
- [Key change 3]

## Testing

1. [Step to verify]
2. [Step to verify]
3. [Edge case to check]

## Screenshots

[If UI changes — before/after]

## Notes

[Deployment considerations, if any]
```

## Example

### Before (Typical PR Description)

```markdown
Fixed the login bug

Updated the auth code to handle the edge case we discussed.
```

### After (Using This Skill)

```markdown
## Summary

Fix session expiration handling during OAuth refresh flow.
Resolves AUTH-1234.

## Changes

- Add retry logic when refresh token is expired mid-request
- Clear stale session data before redirect to login
- Add logging for debugging token refresh failures

## Testing

1. Log in and wait 15 minutes (or set token expiry to 1 min in dev)
2. Trigger an API call — should silently refresh
3. Force-expire the refresh token — should redirect to login cleanly
4. Check logs for `token_refresh_attempt` entries

## Notes

Requires `SESSION_CLEANUP_ENABLED=true` in env (already set in staging/prod).
```

## Quality Checks

Before submitting, verify:

- [ ] Summary answers "what" and "why" in under 3 sentences
- [ ] A reviewer unfamiliar with the context can understand the change
- [ ] Testing instructions are specific enough to follow without guessing
- [ ] Related ticket/issue is linked
- [ ] Screenshots included for any UI changes
- [ ] Deployment notes present if migrations, flags, or config changes exist
