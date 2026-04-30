---
name: decision-doc
description: Create structured decision documents when facing choices with multiple viable options and unclear tradeoffs. Use when stakeholders need to align on a path forward, when decisions need to be recorded for future reference, or when the reasoning behind a choice matters as much as the choice itself.
featured: true
---

# Decision Doc

Transform ambiguous decision contexts into structured documents with clear options, tradeoffs, and recommendations.

## Process

1. **Frame the decision**
   - State what needs to be decided in one sentence
   - Identify what's driving the decision now (deadline, blocker, opportunity)
   - Note constraints (budget, timeline, technical, political)

2. **Map stakeholders**
   - Decision-maker: Who has final authority?
   - Consulted: Who provides input?
   - Informed: Who needs to know the outcome?

3. **Define options (2-4)**
   - Each option must be genuinely viable
   - Include "do nothing" if it's a real option
   - Name options clearly (not "Option A" — use descriptive names)

4. **Analyze tradeoffs**
   - For each option: benefits, risks, costs, timeline
   - Use consistent criteria across all options
   - Be explicit about unknowns

5. **State recommendation**
   - Lead with the recommendation
   - Provide 2-3 sentences of rationale
   - Note what would change your recommendation

6. **Document reversibility**
   - One-way door: Hard or impossible to undo
   - Two-way door: Can revisit if wrong

## Output Structure

```markdown
# [Decision Title]

## Context

[1-2 paragraphs: What's being decided and why now]

## Decision-Maker

[Name/role]

## Stakeholders

- Consulted: [names/roles]
- Informed: [names/roles]

## Options

### [Option 1 Name]

**Summary:** [One sentence]

| Dimension | Assessment             |
| --------- | ---------------------- |
| Benefits  | [bullets]              |
| Risks     | [bullets]              |
| Cost      | [estimate or relative] |
| Timeline  | [estimate]             |

### [Option 2 Name]

[Same structure]

### [Option 3 Name] (if applicable)

[Same structure]

## Recommendation

**[Recommended option name]**

[2-3 sentences: Why this option, given the constraints and tradeoffs]

If [condition], reconsider [alternative option].

## Reversibility

[One-way door / Two-way door] — [brief explanation]

## Decision

- **Status:** [Proposed / Decided / Superseded]
- **Decided:** [Date, if decided]
- **Outcome:** [Selected option, if decided]
```

## Example

### Before (messy input)

> We need to figure out what to do about the auth system. The current one is getting slow and Sarah's team keeps complaining. We could upgrade it, or maybe switch to Auth0, or just add caching. Jake wants to decide by Friday because Q2 planning. Budget is tight.

### After (structured decision doc)

```markdown
# Auth System Performance

## Context

The current auth system latency has increased 3x over the past quarter, causing friction for Sarah's team (primary internal users). Jake needs a decision by Friday to include in Q2 planning. Budget constraints limit options requiring significant new spend.

## Decision-Maker

Jake (Engineering Director)

## Stakeholders

- Consulted: Sarah (Platform Lead), Auth team
- Informed: Security, Finance

## Options

### Upgrade Current System

**Summary:** Vertical scaling and query optimization of existing auth service.

| Dimension | Assessment                                       |
| --------- | ------------------------------------------------ |
| Benefits  | Preserves existing integrations, lower risk      |
| Risks     | May only delay the problem, team capacity needed |
| Cost      | ~$5k infrastructure + 2 sprints eng time         |
| Timeline  | 4-6 weeks                                        |

### Migrate to Auth0

**Summary:** Replace custom auth with managed Auth0 service.

| Dimension | Assessment                                                |
| --------- | --------------------------------------------------------- |
| Benefits  | Offloads maintenance, built-in scaling, security features |
| Risks     | Migration complexity, vendor dependency, cost at scale    |
| Cost      | ~$2k/month + 3-4 sprints migration                        |
| Timeline  | 8-12 weeks                                                |

### Add Caching Layer

**Summary:** Implement Redis caching for auth tokens and session data.

| Dimension | Assessment                                            |
| --------- | ----------------------------------------------------- |
| Benefits  | Quick win, addresses immediate latency, low risk      |
| Risks     | Doesn't solve root cause, adds operational complexity |
| Cost      | ~$500/month + 1 sprint                                |
| Timeline  | 2-3 weeks                                             |

## Recommendation

**Add Caching Layer**

Given budget constraints and the Friday deadline, caching provides the fastest path to relieving immediate pain. This buys time to properly evaluate the upgrade-vs-migrate decision in Q3 when budget opens up.

If latency issues persist after caching, reconsider Upgrade Current System as next step.

## Reversibility

Two-way door — Caching can be removed if we later choose a different approach. The infrastructure investment is minimal.

## Decision

- **Status:** Proposed
- **Decided:** —
- **Outcome:** —
```

## Quality Checks

Before delivering, verify:

- [ ] Decision framed as a clear question
- [ ] 2-4 options, each genuinely viable
- [ ] No "straw man" options included just to be dismissed
- [ ] Tradeoffs use consistent dimensions across options
- [ ] Recommendation leads with the choice, then rationale
- [ ] Reversibility explicitly stated
- [ ] Stakeholder roles are specific (names or roles, not "the team")
- [ ] Document is actionable — someone could decide based on this alone

## Anti-Patterns

Avoid these common failure modes:

- **Analysis paralysis:** More than 4 options, or endless sub-options
- **False balance:** Presenting a weak option as if it's equal to strong ones
- **Hidden recommendation:** Burying the recommendation in analysis
- **Missing constraints:** Options that violate stated constraints
- **Vague stakeholders:** "Leadership" or "the team" instead of specific roles
- **Overcomplicated tables:** Dimensions that don't help differentiate options
