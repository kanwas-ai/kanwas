---
name: launch-readiness
description: Assess whether a feature or product is ready to ship by orchestrating context gathering, checklist generation, gap identification, and go/no-go recommendation. Use when preparing for a launch to ensure nothing critical is missed and stakeholders have clear information to make the launch decision.
---

# Launch Readiness

Orchestrate a structured launch readiness assessment. Gather context, generate a tailored checklist, identify gaps, and provide a clear go/no-go recommendation with reasoning.

## What This Orchestrates

1. **Context gathering** — Understand what's launching, scope, audience, and stakes
2. **Checklist generation** — Build a launch checklist tailored to the specific launch
3. **Gap identification** — Assess current state against the checklist
4. **Risk assessment** — Evaluate severity of gaps and mitigation options
5. **Go/no-go recommendation** — Synthesize into actionable decision support

## Process

### 1. Gather Feature Context

Understand what's being launched:

**Core questions:**

- What is being launched? (Feature, product, change)
- Who is affected? (Users, segments, internal teams)
- What's the rollout plan? (Big bang, phased, feature flag)
- What's the timeline and flexibility?
- What's the blast radius if something goes wrong?

**Classify the launch:**

| Launch Size | Characteristics                                                   | Checklist Depth       |
| ----------- | ----------------------------------------------------------------- | --------------------- |
| Small       | Single feature, limited users, easily reversible                  | Essential items only  |
| Medium      | Significant feature, broader audience, some complexity            | Standard checklist    |
| Large       | Major launch, wide audience, hard to reverse, external visibility | Full checklist review |

### 2. Generate Tailored Checklist

Build checklist based on launch size and type. Not all items apply to all launches.

**Engineering readiness:**

- [ ] Code complete and merged
- [ ] Tests passing (unit, integration, e2e as appropriate)
- [ ] Performance validated under expected load
- [ ] Rollback plan documented and tested
- [ ] Feature flags or kill switches in place
- [ ] Monitoring and alerting configured
- [ ] Error handling covers edge cases

**Product readiness:**

- [ ] Acceptance criteria met
- [ ] Edge cases identified and handled (or documented as known limitations)
- [ ] User flows tested end-to-end
- [ ] Accessibility requirements met
- [ ] Copy and content finalized

**Operational readiness:**

- [ ] Support team briefed
- [ ] Documentation updated (help center, internal docs)
- [ ] Escalation path defined
- [ ] On-call coverage confirmed for launch window

**Communication readiness:**

- [ ] Stakeholders informed of launch timing
- [ ] User communication prepared (if applicable)
- [ ] Changelog or release notes drafted
- [ ] Marketing coordination complete (if applicable)

**For large launches, add:**

- [ ] Load testing at 2-3x expected traffic
- [ ] Incident response plan documented
- [ ] War room or rapid response team identified
- [ ] External dependencies confirmed (third-party services, partners)
- [ ] Legal/compliance review complete
- [ ] Security review complete

### 3. Assess Current State

For each checklist item, determine status:

| Status      | Meaning                                      |
| ----------- | -------------------------------------------- |
| Done        | Complete, verified                           |
| In Progress | Being worked, expected completion date known |
| Not Started | Not yet addressed                            |
| N/A         | Not applicable to this launch                |
| Blocked     | Cannot proceed without resolution            |

Create a gap summary:

```
Checklist Item: [Item]
Status: [Done | In Progress | Not Started | N/A | Blocked]
Notes: [Details, owner, expected completion]
Risk if skipped: [What could go wrong]
```

### 4. Identify and Assess Gaps

For items not marked "Done" or "N/A":

**Categorize each gap:**

| Gap Type | Description                    | Example                 |
| -------- | ------------------------------ | ----------------------- |
| Blocker  | Must be resolved before launch | No rollback plan        |
| Risk     | Launch possible but risky      | Load testing incomplete |
| Debt     | Acceptable for now, fix soon   | Docs not updated        |

**For each gap, assess:**

- What's the worst case if we launch without this?
- Can it be mitigated? How?
- What's the effort to close the gap vs. delay?

### 5. Make Go/No-Go Recommendation

Synthesize findings into a clear recommendation:

**Go:**

- All blockers resolved
- Risks identified with mitigations in place
- Team confident in rollback plan
- Debt items documented for follow-up

**Conditional Go:**

- Specific conditions must be met (list them)
- Timeline for conditions
- Who decides if conditions are met

**No-Go:**

- Blockers remain unresolved
- Risks too high without mitigation
- Recommend revised timeline or scope

**Recommendation format:**

```
Recommendation: [Go | Conditional Go | No-Go]

Summary:
- [Key point 1]
- [Key point 2]
- [Key point 3]

Blockers: [List or "None"]
Open Risks: [List with mitigations]
Debt for follow-up: [List]

If Conditional Go, conditions:
- [ ] [Condition 1]
- [ ] [Condition 2]
```

## Adapts To

**Launch size:**

- Small launches: Abbreviated checklist, lighter process
- Large launches: Full checklist, more stakeholders, formal sign-off

**Risk tolerance:**

- High-risk contexts (payments, security, compliance): More rigorous, more sign-offs
- Lower-risk contexts (internal tools, beta features): Faster, fewer gates

**Team maturity:**

- Established processes: Reference existing checklists, fill gaps
- Less mature: Build checklist from scratch, educate on purpose

**Timeline pressure:**

- Time available: Thorough assessment, address all gaps
- Urgent: Focus on blockers, accept documented risks

**Rollout strategy:**

- Big bang: Higher bar, more scrutiny
- Phased/feature-flagged: Lower bar, can iterate

## Decision Points

At each stage, decide:

**After context gathering:**

- Is this a small/medium/large launch?
- Which checklist sections apply?

**After checklist generation:**

- Are there additional domain-specific items to add?
- Does the team have existing checklists to incorporate?

**After gap identification:**

- Which gaps are blockers vs. risks vs. debt?
- Are any gaps actually acceptable given context?

**At go/no-go:**

- Is the recommendation clear?
- Who needs to sign off?
- What's the escalation path if there's disagreement?

## Quality Checks

- [ ] Context is specific (not generic "we're launching something")
- [ ] Checklist is tailored to launch size and type
- [ ] Each gap has a clear status and owner
- [ ] Blockers are distinguished from nice-to-haves
- [ ] Risks have mitigations identified
- [ ] Recommendation is clear and actionable
- [ ] Debt items are documented for follow-up
- [ ] Stakeholders know who has final decision authority
