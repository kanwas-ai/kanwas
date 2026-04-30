---
name: announcement-drafter
description: Transform news, updates, or changes into polished internal or external announcements. Use when you need to communicate product launches, policy changes, team updates, or organizational news to different audiences with appropriate tone and structure.
---

# Announcement Drafter

Craft announcements that land with the right audience at the right level of formality.

## What Good Looks Like

- **Audience-calibrated tone** — Internal team updates feel different from customer announcements
- **Lead with what matters to the reader** — Not what matters to you
- **Clear action or takeaway** — Reader knows what this means for them
- **Right length for context** — Slack ping vs company-wide email vs blog post
- **No buried lede** — The news is in the first sentence
- **Honest framing** — Admits trade-offs when relevant, avoids spin

## Audience Patterns

| Audience        | Tone                   | What They Care About              |
| --------------- | ---------------------- | --------------------------------- |
| Internal team   | Direct, context-rich   | How this affects their work       |
| All-company     | Professional but warm  | What changed and why              |
| Customers       | Clear, benefit-focused | What's in it for them             |
| External/public | Polished, measured     | Facts, impact, credibility        |
| Partners        | Professional, specific | Integration/business implications |

## Process

1. **Clarify the announcement:**
   - What happened or is happening?
   - Who needs to know? (internal team, company, customers, public)
   - What do they need to do with this information?
   - What's the channel? (Slack, email, blog, press release)

2. **Identify the core message:**
   - One sentence: What's the news?
   - One sentence: Why should the reader care?
   - One sentence: What happens next?

3. **Match tone to audience:**
   - Internal: Can be casual, include context, acknowledge challenges
   - Customer: Focus on benefits, be clear about changes affecting them
   - External: Measured, factual, credible

4. **Structure for the channel:**
   - Slack: 2-3 sentences max, link to details
   - Email: Headline, 2-3 paragraphs, clear CTA
   - Blog: Hook, context, details, what's next
   - Press release: Standard format with quotes

5. **Check for common failures:**
   - Does this bury bad news in good news?
   - Does this over-promise?
   - Would I trust this if I received it?

## Structure Templates

### Internal Team (Slack/Short)

```
[What happened] — [Why it matters to the team]

What this means for you: [Specific impact]

Questions? [Where to ask]
```

### Company-Wide (Email)

```
Subject: [Clear description of news]

[One sentence: What's happening]

[2-3 sentences: Context and why]

What this means:
- [Impact point 1]
- [Impact point 2]

Next steps: [What happens now / what they should do]
```

### Customer Announcement

```
[Headline: Benefit or news]

[What's new — one paragraph]

[What this means for you — specific benefits or changes]

[How to get started / what to expect]

[Where to learn more or get help]
```

## Example

### Input

> We're sunsetting the legacy API (v1) in 6 months. v2 has been available for 2 years. About 15% of customers still use v1. Need to announce to customers.

### Output

**Subject: Action Required: Legacy API (v1) retiring March 2025**

We're retiring API v1 on March 15, 2025. If you're using v1, you'll need to migrate to v2 before this date.

**What's changing:**
API v1 will stop accepting requests on March 15, 2025. All integrations using v1 endpoints will need to update to v2.

**Why:**
v2 has been our primary API for over two years, with better performance, security, and features. Consolidating to a single API lets us focus on improvements that benefit everyone.

**What you need to do:**

1. Check if you're using v1 (guide: [link])
2. Review the migration guide: [link]
3. Complete migration before March 15, 2025

**Need help?**
Our team is available for migration support. Contact us at [support channel] or book a migration call: [link]

---

_Why this works:_

- Bad news is stated directly, not buried
- Timeline is clear and repeated
- Acknowledges reader's effort (migration)
- Provides specific resources
- Doesn't over-apologize or over-explain

## Anti-Patterns

- **Spin over substance** — "We're excited to announce this amazing improvement" when it's a price increase
- **Burying the lede** — Three paragraphs of context before the actual news
- **Vague timelines** — "Soon" or "in the coming weeks" when you know the date
- **Missing the "so what"** — Announcing a change without explaining impact
- **Wrong tone for audience** — Formal press-release language for a team Slack
- **Forced excitement** — Not everything needs to be celebrated

## Quality Checks

Before sending:

- [ ] The news is in the first sentence
- [ ] A reader knows what this means for them within 10 seconds
- [ ] Tone matches the audience and channel
- [ ] If there's bad news, it's stated directly (not buried or spun)
- [ ] Timeline and next steps are specific, not vague
- [ ] Action items (if any) are clear
- [ ] Length is appropriate for the channel
- [ ] You would trust this announcement if you received it
