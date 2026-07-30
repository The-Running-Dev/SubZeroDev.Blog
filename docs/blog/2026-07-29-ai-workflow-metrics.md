---
title: "Metrics to Track"
description: Delivery, quality, AI efficiency, and human load — plus the workflow comparisons worth running against each other.
slug: ai-workflow-metrics
authors:
  - subzerodev
date: 2026-07-29T08:35:00
tags:
  - ai-assisted-engineering
  - automation
---

*Part 5 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

## Metrics to Track

### Delivery

<!-- truncate -->

- Idea to initialized repository
- Repository to reviewed plan
- Plan to first working implementation
- First implementation to draft pull request
- Draft pull request to merge
- Merge to deployed result
- Shipped projects or milestones per week

### Quality

- Defects found during planning review
- Defects found by Qodo
- Valid findings versus false positives
- Review comments requiring human interpretation
- Rework after implementation
- Escaped defects after merge

### AI Efficiency

- Model and effort level by task type
- Planning and implementation usage
- Follow-up prompts per milestone
- Review cycles per pull request
- Manual edits required
- Outcome quality relative to quota consumed

### Human Load

- Concurrent active projects
- Time spent restoring project context
- Waiting or blocked time
- Decisions requiring manual intervention
- Satisfaction with the result

Useful workflow comparisons include:

- Codex only
- Opus → Codex
- Opus → Sonnet
- Codex → Opus review → Codex
- Implementation with and without the Qodo gate

---

*Next: [Current state, roadmap, and Projects as Code](https://blog.subzerodev.com/ai-workflow-state-and-roadmap).*
