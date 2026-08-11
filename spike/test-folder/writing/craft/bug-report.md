---
name: bug-report
description: Transform bug observations into actionable bug reports with clear reproduction steps, expected vs actual behavior, and environment details. Use when filing issues that engineers need to diagnose and fix without back-and-forth clarification.
---

# Bug Report

Structure bug observations so engineers can reproduce and fix without follow-up questions.

## Process

1. **Gather context** — Ask for or identify:
   - What happened (symptoms)
   - What was expected
   - Steps that led to the bug
   - Environment (browser, OS, app version, device)
   - Any error messages or visual artifacts

2. **Write reproduction steps** — Numbered, specific actions:
   - Start from a known state (e.g., "logged in as admin")
   - Each step = one action
   - Include exact inputs (URLs, values, clicks)

3. **Document behavior**
   - Expected: What should happen
   - Actual: What happens instead
   - Include error messages verbatim

4. **Add environment details**
   - Browser/OS/device
   - App version or commit
   - User role or account type if relevant

5. **Assess severity**
   - Blocker: Prevents core functionality, no workaround
   - Critical: Major feature broken, workaround exists
   - Major: Feature impaired but usable
   - Minor: Cosmetic or edge case

6. **Attach evidence** — Note what to include:
   - Screenshots showing the issue
   - Console errors
   - Network requests if relevant

## Output Format

```markdown
## Summary

[One-line description of the bug]

## Environment

- **Browser/OS:** [e.g., Chrome 120 / macOS 14.2]
- **App version:** [e.g., v2.3.1 or commit abc123]
- **User type:** [e.g., admin, free tier]

## Steps to Reproduce

1. [Starting state]
2. [Action]
3. [Action]
4. [Trigger action]

## Expected Behavior

[What should happen]

## Actual Behavior

[What happens instead]

## Error Messages

[Exact error text, if any]

## Severity

[Blocker/Critical/Major/Minor] — [Brief justification]

## Attachments

[Screenshots, logs, or note if none available]
```

## Before/After Example

### Before (raw observation)

> The app crashes when I try to upload something. It worked yesterday.

### After (actionable report)

```markdown
## Summary

App crashes during file upload when file size exceeds 10MB

## Environment

- **Browser/OS:** Safari 17.2 / macOS 14.2
- **App version:** v2.3.1
- **User type:** Pro account

## Steps to Reproduce

1. Log in as pro user
2. Navigate to Documents > Upload
3. Click "Choose File"
4. Select a file larger than 10MB (tested with 15MB PDF)
5. Click "Upload"

## Expected Behavior

File uploads with progress indicator, then appears in document list.

## Actual Behavior

Progress bar reaches ~30%, then browser tab crashes. "Aw, Snap!" error displayed.

## Error Messages

Console shows before crash:
`RangeError: Maximum call stack size exceeded at ChunkProcessor.process`

## Severity

Critical — File upload is core functionality. Workaround: upload smaller files in parts.

## Attachments

- Screenshot of error attached
- Console log attached
```

## Quality Checks

Before submitting, verify:

- [ ] **Reproducible** — Steps produce the bug consistently (or note if intermittent)
- [ ] **Specific** — No vague steps like "do something with the file"
- [ ] **Complete** — Environment, steps, expected, actual all present
- [ ] **Neutral** — Describes behavior, not blame ("crashes" not "stupid bug")
- [ ] **Severity justified** — Rating matches actual impact
- [ ] **Evidence attached** — Screenshots/logs included or noted as unavailable

## Common Gaps to Probe

When the user's description is incomplete, ask about:

- **Trigger uncertainty**: "Does it happen every time, or intermittently?"
- **Environment gaps**: "Which browser/device? What version?"
- **Reproduction gaps**: "What were you doing right before this happened?"
- **Workarounds**: "Have you found any way to get it working?"
