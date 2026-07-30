---
title: "Architecture, the Terraform Runner, and Publishing"
description: Declarative external state and repository artifacts as two control layers, a thin Terraform runner plugin, and the content pipeline behind this blog.
slug: ai-workflow-architecture
authors:
  - subzerodev
date: 2026-07-29T08:50:00Z
tags:
  - ai-assisted-engineering
  - automation
  - projects-as-code
---

*Part 2 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

## Architecture

The workflow is converging on two complementary control layers.

<!-- truncate -->

### Declarative External State

Terraform owns infrastructure and service configuration, including:

- GitHub repositories and settings
- Branch protection or rulesets
- GitHub Pages
- Actions variables and secrets where appropriate
- Cloudflare DNS records
- Hosting and other provider-backed resources

Terraform contributes planning, state management, drift detection, idempotency,
and the ability to use a large provider ecosystem.

### Repository Artifacts and Intelligent Work

Agents and Automator own content and engineering artifacts, including:

- README files
- Agent instructions
- Specifications
- Milestones and tasks
- Documentation
- Reports
- Blog posts
- Reusable protocols

The intended division is:

```text
Desired project state
├── Terraform
│   └── External infrastructure and service configuration
└── Agents / Automator
    └── Repository content, reasoning, planning, and generated artifacts
```

The AI’s long-term role is primarily planner and operator: interpret intent,
update the desired state, preview changes, invoke deterministic systems, and
review the outcome.

## Terraform Runner Plugin

Rather than building separate imperative integrations for GitHub, Cloudflare,
hosting platforms, and future providers, Automator needs a thin Terraform runner
plugin.

Its initial interface can remain small:

- `init`
- `validate`
- `plan`
- `apply`
- `output`
- `destroy` with explicit safeguards

Terraform providers supply domain-specific integrations. Automator coordinates
them. This keeps the platform focused on orchestration instead of rebuilding
mature infrastructure tooling.

## Content and Blog Publishing

The blog is live and was brought online in approximately 30 minutes. It is
Git-backed and deliberately avoids a database.

The content pipeline is:

```text
YAML source
  → transform
  → validate
  → generate JSON and/or Markdown
  → commit and push
  → serve through GitHub Raw / GitHub Pages
  → website consumes the published data
```

The authoring interface is intentionally small:

- `/create-blog` — create a draft and required metadata
- `/preview` — render, inspect, and validate
- `/publish` — commit, push, and trigger deployment

The planned delivery path is:

1. Implement and prove the workflow as an AI skill.
2. Expose the capability through a public MCP interface.
3. Package it as an Automator plugin or NPX command.
4. Keep client-specific skills as thin adapters over the shared capability.

The living workflow document is the source material; blog entries are curated,
publishable outputs from that knowledge.

---

*Next: [Development environments and mobility](https://blog.subzerodev.com/ai-workflow-environments).*
