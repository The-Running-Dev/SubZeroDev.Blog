---
title: "Roles and the End-to-End Workflow"
description: Which model or tool owns which job, and the nine stages from repository bootstrap to protocol extraction.
slug: ai-workflow-roles-and-pipeline
authors:
  - subzerodev
date: 2026-07-29T08:55:00
tags:
  - ai-assisted-engineering
  - automation
---

*Part 1 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

<!-- truncate -->

## AI and Automation Roles

| Role | Current tool or approach |
|---|---|
| Repository bootstrap | Reusable Codex agent/setup instructions |
| Primary planner | Opus or Codex |
| Independent architecture reviewer | Whichever of Opus or Codex did not produce the first plan |
| Primary implementer | Codex at high effort or Sonnet at high effort |
| Pull-request reviewer | Qodo |
| Review remediation | Codex agent |
| Project and issue automation | GitHub integrations and Markdown-driven metadata |
| Infrastructure reconciliation | Terraform and provider ecosystem |
| Publishing interface | AI skill first; public MCP and Automator/NPX plugin planned |
| Final judgment and prioritization | Human operator |

Copilot automatic code review was removed because it consumed too much of the
available Pro quota. Qodo currently provides the dedicated automated review gate,
subject to its monthly limit.

## End-to-End Workflow

### 1. Bootstrap the Project

A reusable setup agent initializes or inspects a repository and brings it to a
standard baseline. A typical invocation can be as short as:

> Read and inspect, then follow the agent setup. Git is already set up and the
> remote is linked. The name is `blog.subzerodev.com`.

The bootstrap process can cover:

- Repository and workspace structure
- README and documentation
- `AGENTS.md` or equivalent agent guidance
- CI and GitHub workflows
- Pull-request conventions and repository settings
- Report locations
- Project metadata
- Initial specifications and milestone structure
- Documentation and GitHub Pages conventions

The setup instructions are portable: after proving them in one repository, they
can be copied into another and supplied with only project-specific variables.

### 2. Describe the Work

The repository contains the context agents need to operate consistently:

```text
project/
├── AGENTS.md
├── README.md
├── specifications/
├── milestones/
├── reports/
├── protocols/
└── project configuration
```

Specifications are broken into milestones and ranked by value. This supports
compact commands such as:

- “Do the next milestone.”
- “Do the highest-value milestone.”
- “Close this PR and do the next one.”
- “Address the review comments.”

The intelligence is distributed across the repository and its operating
conventions, not concentrated in a single large prompt.

### 3. Plan

Two planning patterns are in active use:

**Opus-first**

1. Opus develops requirements, architecture, edge cases, and an implementation
   plan.
2. Sonnet or Codex implements the plan.

**Codex-first with cross-review**

1. Codex inspects the repository and drafts the plan.
2. Opus independently reviews it for architectural gaps and missed constraints.
3. Codex incorporates valid findings.
4. The review loop repeats when the project justifies it.

This moves expensive discoveries earlier, when changing a plan is cheaper than
reworking an implementation.

### 4. Implement

Implementation normally goes to:

- **Codex at high effort**, especially for repository-aware work, or
- **Sonnet at high effort** as an alternative implementation path.

The implementer follows the reviewed plan, repository instructions, and milestone
definition. Agents may work on separate projects or separate stages in parallel,
but human context capacity governs the practical concurrency limit.

### 5. Open a Draft Pull Request

Work is placed in a draft pull request early enough for automated review. The
draft state is part of the review protocol rather than merely a final publishing
step.

### 6. Run the Automated Review Gate

Qodo reviews the draft pull request. The review is evaluated for:

- Correct defects
- Architectural issues
- Security or reliability problems
- Maintainability concerns
- False positives
- Issues that duplicate earlier review stages

### 7. Address Findings

Codex inspects the review comments, makes justified changes, verifies the
implementation, and updates the pull request. Human judgment remains responsible
for deciding which comments are valid and whether the result is ready.

### 8. Merge and Ship

After verification and final review, the pull request is merged and deployment
proceeds through the repository’s normal automation.

### 9. Extract and Improve the Protocol

When a new or complex workflow succeeds:

1. Complete and verify it.
2. Ask the AI to reconstruct the instructions it followed.
3. Review the generated instructions against what actually worked.
4. Save them as a reusable, version-controlled protocol.
5. Use the protocol directly on the next project.
6. Automate it further when the value is established.

This is process extraction from proven execution, not speculative process design.

---

*Next: [Architecture, the Terraform runner, and publishing](https://blog.subzerodev.com/ai-workflow-architecture).*
