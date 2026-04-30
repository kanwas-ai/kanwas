---
name: user-interview-orchestrator
description: Orchestrates the full user interview workflow from research goals through synthesis. Use when preparing for user interviews, needing an interview guide, supporting live note-taking during interviews, or synthesizing insights afterward. Handles discovery interviews, validation interviews, and usability testing sessions.
---

# User Interview Orchestrator

Orchestrate user interviews from prep through synthesis. This is a multi-phase workflow that adapts to where you are in the process.

## Phases

**Phase 1: Prep**

- Clarify research goals (what decisions will this inform?)
- Review participant context (role, background, prior interactions)
- Generate interview guide with goal-aligned questions

**Phase 2: Execution Support**

- Live note-taking assistance
- Suggested follow-up questions
- Flag moments to probe deeper

**Phase 3: Synthesis**

- Extract key insights from notes
- Tag themes and patterns
- Identify quotes worth sharing
- Summarize actionable findings

## Process

### 1. Establish Research Goals

Ask:

- What decisions will this research inform?
- What hypotheses are we testing (if any)?
- What do we already believe/assume?

If goals are vague, push for specificity. "Learn about users" is not a goal. "Understand why trial users don't convert" is.

### 2. Review Participant Context

Gather:

- Role and background
- How they were recruited
- Prior interactions with product (if any)
- Any known pain points or context

Adjust question depth based on participant expertise.

### 3. Create Interview Guide

Structure:

```
Opening (5 min)
- Intro, consent, context-setting

Warm-up (5 min)
- Background questions, rapport-building

Core Questions (30-40 min)
- Goal-aligned questions, open-ended
- Probes for each question

Closing (5 min)
- Anything else to add?
- Thank you, next steps
```

Question principles:

- Open-ended, not leading
- Behavior-focused ("tell me about a time") over hypothetical ("would you...")
- Specific before general
- Include probes: "Tell me more", "Why?", "What happened next?"

### 4. Support Live Note-Taking

During interview:

- Capture verbatim quotes (mark with quotation marks)
- Note behaviors, emotions, hesitations
- Flag surprising moments with [!]
- Mark follow-up opportunities with [?]

Format:

```
[timestamp] Topic: observation or quote
[12:34] Onboarding: "I had no idea what to click first" [!]
[15:20] Navigation: Mentioned using search instead of menu [?probe: why?]
```

### 5. Synthesize Insights

After interview:

**Extract themes:**

- Group related observations
- Look for patterns across responses
- Note contradictions or surprises

**Tag by type:**

- Pain point
- Need/desire
- Behavior pattern
- Mental model
- Quote (shareable)

**Structure findings:**

```
## Key Insights

### [Theme 1]
- Observation
- Supporting quote
- Implication

### [Theme 2]
...

## Actionable Findings
- [Finding] → [Suggested action]

## Open Questions
- Questions raised for future research
```

## Adapts To

**Interview type:**

- Discovery: Focus on broad exploration, more warm-up, follow the thread
- Validation: Focus on specific hypotheses, structured probes, watch for confirmation bias
- Usability: Focus on task completion, think-aloud protocol, note friction points

**Participant expertise:**

- Experts: Deeper technical questions, less explanation needed
- Novices: More context-setting, simpler language, more probes

**Research timeline:**

- Quick turnaround: Abbreviated prep, rapid synthesis
- Thorough research: Full guide, detailed synthesis, cross-interview patterns

**Interview mode:**

- Live support: Real-time note formatting, suggested follow-ups
- Post-interview: Full synthesis from provided notes/transcript

## Quality Checks

- [ ] Research goals are specific and decision-oriented
- [ ] Interview guide has open-ended, non-leading questions
- [ ] Questions trace back to stated research goals
- [ ] Probes included for each core question
- [ ] Notes capture verbatim quotes, not just summaries
- [ ] Synthesis separates observation from interpretation
- [ ] Insights are actionable, not just descriptive
- [ ] Surprising findings are highlighted, not buried
