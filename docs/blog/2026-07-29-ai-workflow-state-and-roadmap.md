---
title: "Current State, Roadmap, and Projects as Code"
description: What is proven, what is experimental, what is planned, and the target model the whole workflow is converging on.
slug: ai-workflow-state-and-roadmap
authors:
  - subzerodev
date: 2026-07-29T08:30:00
---

*Part 6 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

## Current state

### Proven or actively used

<!-- truncate -->

- Repository bootstrap instructions
- Repository-embedded agent guidance
- Markdown specifications and value-ranked milestones
- Opus/Codex cross-review
- Codex or Sonnet high-effort implementation
- Draft pull requests and Qodo review
- Codex remediation of review comments
- GitHub automation and project metadata
- Git-backed blog publishing
- YAML transformation and validation
- GitHub Pages delivery
- Terraform-managed Cloudflare DNS
- Protocol extraction after successful tasks

### Active experiments

- Portable project development images
- Dropbox-based multi-machine workspace transport
- Parallel work across machines
- More formal workflow analytics
- Declarative project definitions

### Planned

- Blog authoring skill with create, preview, and publish commands
- Public blog MCP
- Automator or NPX publishing plugin
- Terraform runner plugin
- Broader GitHub management through Terraform
- Automated handoff snapshots
- Automated publication of lessons from the living document

## Roadmap

### Near term

1. Keep this document current as the operating model changes.
2. Implement and prove `/create-blog`, `/preview`, and `/publish`.
3. Publish a first workflow article from this source.
4. Confirm Claude and Codex quota behavior through dated observations.
5. Begin recording cycle-time and review-effectiveness metrics.
6. Keep active project concurrency at two, with three as the normal ceiling.

### Next stage

1. Build the thin Terraform runner plugin.
2. Move GitHub repository configuration and Cloudflare DNS into reusable Terraform
   modules.
3. Define a minimal declarative project schema.
4. Separate organization-wide standards from generic bootstrap behavior.
5. Add safe preview and approval boundaries before infrastructure changes.
6. Automate work-session handoff and recovery checkpoints.

### Longer term

1. Make the project definition the canonical desired state.
2. Have specialized plugins claim and reconcile parts of that state.
3. Keep AI clients as thin conversational interfaces over public capabilities.
4. Detect drift in infrastructure, repository settings, documentation, and agent
   protocols.
5. Turn repeated successful workflows into reusable skills and plugins.
6. Publish selected lessons automatically from the private living record.

## Target model: Projects as Code

The natural endpoint is a repository that describes not only the software, but the
complete system around it:

- What the project is
- How the repository is configured
- How infrastructure is provisioned
- How agents operate
- How work is prioritized
- How code is reviewed
- How documentation and content are generated
- How the system is deployed
- How lessons are captured and published

In that model, the workflow becomes:

```text
Intent
  → declarative project definition
  → AI-assisted planning and review
  → Terraform and specialized executors
  → implementation
  → automated quality gates
  → verified deployment
  → observations
  → refined protocols
  → publication
```

The repository becomes the operational contract. Models can change, machines can
change, and individual tools can be replaced without losing the process.

## One-sentence definition

> An AI-assisted software engineering operating system in which
> repository-defined protocols, specialized models, automated review gates, and
> declarative infrastructure turn ideas into reviewed, reproducible, shipped
> projects with progressively less coordination friction.

---

*Back to [the series index](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*
