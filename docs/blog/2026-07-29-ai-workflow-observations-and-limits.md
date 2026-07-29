---
title: "Observations and Operating Limits"
description: Who gets the multiplier, how the human role expanded, the project concurrency ceiling, and dated observations of quota behavior.
slug: ai-workflow-observations-and-limits
authors:
  - subzerodev
date: 2026-07-29T08:40:00
---

*Part 4 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

## Observations and operating limits

### Experienced engineers receive the largest multiplier

“Vibe coding” is real in this workflow, but it is not effortless button-pushing.

<!-- truncate -->

The multiplier comes from combining high-volume AI execution with experienced
judgment about architecture, priorities, correctness, and tradeoffs.

### The human role has expanded

AI has reduced the amount of manual, routine coding while expanding the operator
into several roles:

- CEO or product owner
- Architect
- Technical lead
- Software engineer
- QA lead
- DevOps engineer
- Automation engineer
- Project coordinator

The work has not disappeared. The bottleneck has moved from typing code to
directing, reviewing, integrating, and improving the system.

### A very small AI-first company is plausible

The workflow suggests that one experienced operator can coordinate capabilities
that previously required several specialized roles. This does not mean a company
has no people; it means a small number of highly capable people can orchestrate a
larger volume and variety of work.

### Human context is the concurrency limit

The tools can support several simultaneous projects, but human context switching
becomes costly around four or five active projects.

Current operating guideline:

- **Preferred:** 2 active projects
- **Practical maximum:** 3
- **Beyond 3:** use only when work is clearly isolated and coordination is
  lightweight

### Observed quota behavior

These are empirical observations and should be distinguished from official
product guarantees.

**Claude Max**

- Appears to use a weekly allocation.
- The observed reset is on Sunday around 1:00 a.m. local time, but the exact time
  still needs confirmation.
- Opus planning, long contexts, high-effort work, and repeated iterations consume
  the quota aggressively.

**Codex**

- Appears to use a rolling or frequently replenished usage window.
- Capacity returned to 100% after being nearly exhausted the previous day.
- The displayed date shifts, suggesting usage falls out of a moving window.
- More observation is needed to distinguish a true rolling window from daily or
  hybrid replenishment.

**Qodo**

- Provides useful automated review.
- Has a monthly limit, so review capacity should be spent on work where the gate
  adds value.

---

*Next: [Metrics to track](https://blog.subzerodev.com/ai-workflow-metrics).*
