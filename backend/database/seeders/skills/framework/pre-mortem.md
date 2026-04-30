---
name: pre-mortem
description: Conduct a pre-mortem analysis using Gary Klein's prospective hindsight technique. Use when planning a project, initiative, or major decision to identify potential failure modes before they happen. Helps teams surface risks they might otherwise overlook by imagining the project has already failed.
featured: true
---

# Pre-Mortem

Apply Gary Klein's pre-mortem technique to identify how a project might fail before it starts. The goal is to surface failure modes that teams typically miss due to optimism bias and groupthink.

## The Methodology

**Source:** Gary Klein, "Performing a Project Premortem" (Harvard Business Review, 2007)

The pre-mortem inverts traditional risk analysis. Instead of asking "what could go wrong?", you assume the project has already failed and ask "what did go wrong?"

This flip matters. Klein's research shows that prospective hindsight—imagining an event has already occurred—increases the ability to identify reasons for outcomes by 30%.

**The key insight:** Teams are bad at predicting failure while planning because optimism bias suppresses concerns. By declaring failure as a given, you give people permission to voice doubts.

### The Core Mechanism

1. **Assume failure** — The project is complete. It failed spectacularly.
2. **Generate reasons** — Why did it fail? What went wrong?
3. **Prioritize threats** — Which failures are most likely and damaging?
4. **Develop mitigations** — How do we prevent or detect these failures?

## Process

### 1. Set the Scene

State the project clearly:

- What is being attempted?
- What does success look like?
- What's the timeline and scope?

Then declare: "It is [future date]. The project has failed. It was a disaster."

### 2. Generate Failure Modes

Ask: "Looking back, what went wrong?"

Prompt across categories:

| Category             | Prompt                                                         |
| -------------------- | -------------------------------------------------------------- |
| **Execution**        | What broke in delivery? Missed deadlines? Quality issues?      |
| **Dependencies**     | What external factors killed us? Other teams? Vendors? Market? |
| **Scope**            | Did we try to do too much? Too little? Wrong thing?            |
| **People**           | Who left? Who burned out? What conflicts derailed us?          |
| **Stakeholders**     | Who withdrew support? Who blocked us? What politics emerged?   |
| **Assumptions**      | What did we believe that turned out false?                     |
| **Unknown Unknowns** | What surprised us completely?                                  |

Generate at least 8-12 distinct failure modes. Be specific—not "team issues" but "lead engineer left in month 3, no one else knew the codebase."

### 3. Rate Each Failure

For each failure mode, assess:

| Dimension      | Scale                                    |
| -------------- | ---------------------------------------- |
| **Likelihood** | 1 (unlikely) to 5 (probably will happen) |
| **Impact**     | 1 (minor setback) to 5 (project-killing) |

Calculate **Risk Score = Likelihood x Impact**

### 4. Prioritize Threats

Sort by risk score. The top 3-5 threats are your priority focus.

For each priority threat, ask:

- Are there early warning signs we can watch for?
- What would trigger this failure?
- How quickly would it become visible?

### 5. Develop Mitigations

For each priority threat, define:

| Element        | Description                                  |
| -------------- | -------------------------------------------- |
| **Prevention** | What can we do now to reduce likelihood?     |
| **Detection**  | How will we know if it's starting to happen? |
| **Response**   | If it happens, what's our contingency?       |

Mitigations should be concrete actions, not vague intentions.

### 6. Integrate Into Plan

The pre-mortem isn't a document to file away. Integrate findings:

- Add prevention actions to the project plan
- Add detection signals to project check-ins
- Document contingencies for reference

## Example

**Project:** Launch mobile app in 6 months

**Failure Modes Generated:**

| Failure Mode                                     | L   | I   | Risk |
| ------------------------------------------------ | --- | --- | ---- |
| iOS approval takes 6 weeks, miss holiday launch  | 4   | 5   | 20   |
| Backend team prioritizes other work, API delayed | 4   | 4   | 16   |
| Scope creep from stakeholder feature requests    | 3   | 4   | 12   |
| Performance issues discovered in beta            | 3   | 4   | 12   |
| Key mobile dev takes another job                 | 2   | 5   | 10   |
| Design-engineering handoff creates rework        | 3   | 3   | 9    |
| Analytics integration harder than expected       | 2   | 2   | 4    |

**Priority Threats & Mitigations:**

**1. iOS approval delay (Risk: 20)**

- Prevention: Submit 8 weeks early, not 4. Pre-review with Apple guidelines.
- Detection: Submit test build to Apple early to catch issues.
- Response: Prepare web fallback for holiday traffic.

**2. Backend API delays (Risk: 16)**

- Prevention: Get backend commitment now, add to their OKRs.
- Detection: Weekly API milestone check-ins starting month 1.
- Response: Identify external API alternatives for critical paths.

**3. Scope creep (Risk: 12)**

- Prevention: Document v1 scope now, get stakeholder sign-off.
- Detection: Track feature requests, review weekly.
- Response: Defer list ready; clear "v2" bucket.

## Quality Checks

Before delivering the pre-mortem, verify:

- [ ] Failure is framed as already having happened ("what went wrong" not "what could go wrong")
- [ ] At least 8 distinct failure modes identified
- [ ] Failures are specific and concrete, not vague categories
- [ ] Each failure has likelihood and impact ratings
- [ ] Top 3-5 threats have prevention, detection, and response mitigations
- [ ] Mitigations are actionable (who does what, when), not platitudes
- [ ] Multiple categories covered (execution, dependencies, people, assumptions)
- [ ] Findings are integrated back into recommendations

## Output Format

Deliver:

1. **Project Summary**: What's being attempted and timeline
2. **Failure Modes**: Table with all failures, ratings, and risk scores
3. **Priority Threats**: Top 3-5 with detailed mitigations
4. **Integration Recommendations**: Specific actions to add to project plan
5. **Early Warning Signals**: What to watch for in the first 30 days
