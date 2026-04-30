---
name: ticket-writer
description: Transform rough bug reports, feature ideas, or task descriptions into well-structured tickets ready to file. Use when you have messy notes, Slack messages, or verbal descriptions that need to become actionable work items in Linear, Jira, GitHub Issues, or similar systems.
---

# Ticket Writer

Transform messy input into tickets engineers can immediately act on.

## What Good Looks Like

- **Clear title** — Scannable, specific, action-oriented
- **Problem statement** — What's broken or what's needed, not how to fix it
- **Right context** — Why this matters, not entire project history
- **Testable acceptance criteria** — Binary pass/fail, not vague descriptions
- **Appropriate detail** — Matches audience (senior dev vs new hire)
- **Links over duplication** — Reference docs, don't copy them inline

## Process

1. **Extract the core** — What is actually needed? Strip noise from input.

2. **Identify ticket type:**
   - Bug — Something is broken
   - Feature — New capability
   - Task — Work that needs doing (doesn't change product behavior)
   - Chore — Maintenance, cleanup, upgrades

3. **Write the title:**
   - Start with verb for tasks: "Add...", "Fix...", "Update..."
   - Be specific: "Login fails for SSO users" not "Login broken"
   - Keep under 60 characters

4. **Write the description:**

   ```
   ## Problem
   [What's broken or missing — 1-3 sentences]

   ## Context
   [Why this matters — link to related issues/docs if relevant]

   ## Acceptance Criteria
   - [ ] [Testable criterion 1]
   - [ ] [Testable criterion 2]
   - [ ] [Testable criterion 3]
   ```

5. **Add metadata suggestions:**
   - Priority: P0 (outage), P1 (blocking), P2 (important), P3 (nice to have)
   - Labels: relevant area (auth, api, frontend, etc.)
   - Size estimate: XS/S/M/L/XL if team uses t-shirt sizing

## Example

### Before (raw input)

"hey so users are complaining that when they try to log in with google it just spins forever and then shows a weird error. happened to like 3 people today i think? maybe related to that auth change we did last week"

### After (structured ticket)

**Title:** Google SSO login fails with timeout error

**Type:** Bug

**Priority:** P1

**Labels:** auth, login

---

## Problem

Google SSO login hangs indefinitely, then displays an error. Multiple user reports today.

## Context

Potentially related to auth changes deployed last week. Affecting user access.

## Acceptance Criteria

- [ ] Google SSO login completes within 5 seconds
- [ ] Success redirects to dashboard
- [ ] Failure shows actionable error message with retry option
- [ ] Root cause identified and documented

## Technical Notes

- Check OAuth callback handling after recent auth refactor
- Review timeout configuration for SSO flow

---

## Quality Checks

Before submitting:

- [ ] **Title is specific** — Someone can understand the issue without reading the body
- [ ] **Problem is clear** — A new team member could understand what's wrong
- [ ] **Acceptance criteria are testable** — Each item is pass/fail, not subjective
- [ ] **No solution prescribed** — Describes what, not how (unless context requires it)
- [ ] **Right amount of context** — Not too much, not too little
- [ ] **No jargon without explanation** — Or links to where it's explained

## Common Mistakes

**Vague acceptance criteria:**

- Bad: "Login works properly"
- Good: "User can complete Google SSO login and reach dashboard within 5 seconds"

**Solution in the problem:**

- Bad: "Add retry logic to the OAuth callback handler"
- Good: "OAuth callback fails silently when token exchange times out"

**Missing context:**

- Bad: "It's broken"
- Good: "3 users reported this today; may be related to auth refactor (PR #1234)"

**Too much context:**

- Bad: [500 words of project history]
- Good: "See technical design doc: [link]"
