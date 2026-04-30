---
name: risk-register
description: Transform vague risk descriptions into structured risk register entries with likelihood, impact, and mitigation plans. Use when documenting project risks to ensure consistent format, complete assessment, and actionable mitigation strategies that can be tracked and reviewed.
---

# Risk Register

Transform risk observations into structured entries that enable tracking, prioritization, and action.

## What Good Looks Like

- **Specific risk statement** — Names what could go wrong, not vague worry
- **Clear trigger conditions** — When would this risk materialize?
- **Calibrated likelihood** — Based on evidence, not gut feeling
- **Impact across dimensions** — Schedule, cost, scope, quality, reputation
- **Actionable mitigation** — Concrete steps, not "be careful"
- **Owner assigned** — Someone accountable for monitoring and response
- **Review cadence** — When to reassess

## Process

1. **Extract the core risk** — What specific thing could go wrong?
   - Strip vague language: "things might slip" becomes "API integration may miss Q2 deadline"
   - Separate causes from effects
   - One risk per entry (split compound risks)

2. **Define trigger conditions:**
   - What observable event would indicate this risk is materializing?
   - What early warning signs exist?

3. **Assess likelihood:**
   | Rating | Meaning | Evidence required |
   |--------|---------|-------------------|
   | High | >70% chance | Has happened before, or multiple contributing factors present |
   | Medium | 30-70% chance | Some indicators present, outcome uncertain |
   | Low | <30% chance | Possible but unlikely given current conditions |

4. **Assess impact:**
   Rate each dimension affected (High/Medium/Low/None):
   - Schedule: Will it delay delivery?
   - Cost: Will it increase spend?
   - Scope: Will it force feature cuts?
   - Quality: Will it degrade the product?
   - Reputation: Will it damage trust?

5. **Calculate priority:**
   - Priority = Likelihood x Highest Impact
   - Critical: High x High
   - High: High x Medium, Medium x High
   - Medium: Medium x Medium, High x Low, Low x High
   - Low: remaining combinations

6. **Define mitigation:**
   - **Avoid**: Eliminate the risk entirely (change approach)
   - **Reduce**: Lower likelihood or impact (add buffer, prototype)
   - **Transfer**: Shift to another party (insurance, vendor SLA)
   - **Accept**: Acknowledge and monitor (document decision)

   Each mitigation must have:
   - Specific action (not "mitigate the risk")
   - Owner
   - Due date or trigger

7. **Set contingency** — If the risk occurs despite mitigation, what's the response plan?

## Output Format

```markdown
## Risk: [Specific risk statement]

**ID:** RISK-[number]
**Category:** [Technical / Schedule / Resource / External / Scope]
**Status:** [Open / Mitigating / Closed / Occurred]

### Assessment

**Trigger conditions:** [What would indicate this risk is materializing]

**Likelihood:** [High/Medium/Low] — [Evidence or reasoning]

**Impact:**

- Schedule: [H/M/L/None] — [explanation]
- Cost: [H/M/L/None] — [explanation]
- Scope: [H/M/L/None] — [explanation]
- Quality: [H/M/L/None] — [explanation]
- Reputation: [H/M/L/None] — [explanation]

**Priority:** [Critical/High/Medium/Low]

### Response

**Strategy:** [Avoid/Reduce/Transfer/Accept]

**Mitigation actions:**

1. [Action] — Owner: [name] — Due: [date]
2. [Action] — Owner: [name] — Due: [date]

**Contingency plan:** [If risk occurs, we will...]

**Review cadence:** [Weekly/Biweekly/Monthly]

---

_Last updated: [date] | Next review: [date]_
```

## Example

### Before (raw input)

> "I'm worried about the vendor. They've been slow to respond and we depend on their API for launch."

### After (structured entry)

```markdown
## Risk: Vendor API delivery delays launch

**ID:** RISK-007
**Category:** External
**Status:** Open

### Assessment

**Trigger conditions:** Vendor misses next milestone (Feb 15) or response time exceeds 5 business days

**Likelihood:** Medium — Vendor has missed 2 of 4 milestones by 1-2 weeks. Current response time is 3-4 days.

**Impact:**

- Schedule: High — Launch blocked until API is available
- Cost: Medium — Team idle time, potential contractor extensions
- Scope: Low — Could launch with reduced integration
- Quality: None
- Reputation: Medium — Promised launch date to stakeholders

**Priority:** High

### Response

**Strategy:** Reduce + Accept

**Mitigation actions:**

1. Schedule weekly sync with vendor PM — Owner: Sarah — Due: This week
2. Document fallback: manual data entry flow — Owner: Dev team — Due: Feb 1
3. Add 2-week buffer to launch timeline — Owner: PM — Due: Next planning

**Contingency plan:** If API unavailable by Feb 28, launch with manual workflow and vendor integration in v1.1

**Review cadence:** Weekly until resolved

---

_Last updated: Jan 15 | Next review: Jan 22_
```

## Quality Checks

Before finalizing:

- [ ] **Risk is specific** — Not "things could go wrong" but what exactly could go wrong
- [ ] **Likelihood has evidence** — Rated based on facts, not anxiety
- [ ] **Impact is dimensional** — Assessed across relevant categories, not just "bad"
- [ ] **Mitigations are actionable** — Specific actions with owners and dates
- [ ] **Contingency exists** — Response plan if risk occurs despite mitigation
- [ ] **Single risk per entry** — Compound risks split into separate entries
- [ ] **No solution masquerading as risk** — "We need more testing" is not a risk

## Common Mistakes

**Vague risk statements:**

- Bad: "Technical issues"
- Good: "Database migration may corrupt legacy records"

**Missing trigger conditions:**

- Bad: [No trigger defined]
- Good: "Migration test on staging shows >0.1% record errors"

**Unactionable mitigation:**

- Bad: "Monitor the situation"
- Good: "Run daily migration tests on staging subset, alert if error rate >0.01%"

**Confusing risks with issues:**

- Issue: Something that has happened (track in issue log)
- Risk: Something that might happen (track in risk register)

**Anxiety-driven likelihood:**

- Bad: "High — this keeps me up at night"
- Good: "High — similar integration failed on last two projects"
