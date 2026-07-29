---
title: "Development Environments and Mobility"
description: Why execution stays local for now, what the vendor cloud environments lacked, portable project images, and moving unfinished work between machines.
slug: ai-workflow-environments
authors:
  - subzerodev
date: 2026-07-29T08:45:00
---

*Part 3 of [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).*

## Development environments and mobility

### Current default: local execution

Local development remains the best fit because it provides:

<!-- truncate -->

- Docker CLI and the complete development toolchain
- Straightforward inspection of changes
- Direct access to local services and resources
- Easier testing and integration

### Cloud environment findings

**Codex cloud environments:** setup friction is too high for the current
workflow.

**Claude cloud environments:** marginally better because containers can resume,
but missing tools and awkward local inspection reduce their value.

The current conclusion is not that cloud execution is unusable, but that
vendor-controlled cloud workspaces do not yet fit a heavily tooled local
workflow.

### Bring-your-own portable environment

The more promising experiment is a project-owned development container:

- A common base image contains shared tools and interfaces.
- A project image layers dependencies and project-specific services.
- Source may be mounted or baked into selected images.
- Existing container hosting can provide a remote, reproducible workspace.

Open design questions include:

- Baked source versus mounted source
- Git and credential handling
- Secrets management
- Docker access from the development container
- Remote editor experience
- Propagating base-image updates
- Persistence and backup of in-progress work

### Multi-machine synchronization

Dropbox currently transports unfinished work between machines without requiring a
WIP commit for every handoff. Git remains authoritative version control.

This is convenient but requires discipline:

- Do not edit the same workspace concurrently on multiple machines.
- Wait for synchronization before changing machines.
- Treat conflicts and partial synchronization as operational risks.
- Continue using commits for durable, meaningful history.

A future improvement is an automatic handoff snapshot: save, optionally validate,
create a recoverable checkpoint, and synchronize or push to a temporary branch.

### Distributed execution

Remote-capable tools allow one machine to run planning or analysis while another
handles interactive implementation and review. This can separate contexts and
overlap long-running work, but it is an optional organizational technique rather
than a fundamental capability multiplier.

---

*Next: [Observations and operating limits](https://blog.subzerodev.com/ai-workflow-observations-and-limits).*
