---
title: The AI-Assisted Software Engineering Workflow
description: The living record of the operating model behind SubZeroDev projects, published in full across a six-part series.
slug: ai-assisted-engineering-workflow
authors:
  - subzerodev
date: 2026-07-29T09:00:00
tags:
  - ai-assisted-engineering
  - automation
  - projects-as-code
---

**Status:** Living document  
**Last updated:** July 29, 2026  
**Maturity:** Actively used and rapidly evolving

## Executive Summary

This workflow treats AI systems as specialized members of a software engineering
team rather than as interchangeable coding assistants. Repository conventions,
specifications, ranked milestones, reusable protocols, automated reviews, and
infrastructure-as-code provide the operating structure. Short commands such as
“do the next milestone” work because the repository already describes how the
agent should operate.

<!-- truncate -->

The current process has already supported shipping roughly three to
three-and-a-half usable projects in about a week, alongside additional design
work. The main constraint is no longer writing code. It is selecting priorities,
maintaining context, coordinating agents, reviewing results, and deciding what to
automate next.

The emerging architectural idea is **Projects as Code**: a project’s source,
infrastructure, documentation, workflows, agent behavior, publishing, and
governance should be declarative, version-controlled, reproducible, and
increasingly automated.

## Core Operating Principles

1. **Specialize AI roles.** Use each model or tool where it performs best instead
   of searching for one universally “best” AI.
2. **Keep operational knowledge in the repository.** Agent instructions,
   specifications, milestones, reports, and conventions are versioned project
   assets.
3. **Inspect before changing.** Agents discover the repository’s existing
   structure and applicable instructions before acting.
4. **Plan and review independently.** For consequential work, one model plans and
   another challenges the plan before implementation.
5. **Rank work by value.** Specifications are decomposed into ordered milestones
   so an agent can select the next highest-value task.
6. **Codify proven work.** Complete a complex task successfully once, then have
   the AI extract the successful process into a reusable protocol.
7. **Automate repeated friction.** Recurring setup or coordination work becomes
   code, configuration, a protocol, a skill, or a plugin.
8. **Prefer files and build pipelines.** Markdown, YAML, JSON, Git, and generated
   artifacts are favored over unnecessary databases and services.
9. **Keep execution local when tooling matters.** Local development currently
   provides the full toolchain and the easiest inspection loop.
10. **Measure outcomes.** Quota use, cycle time, review effectiveness, rework, and
    project concurrency should be tracked empirically.

## The Series

The rest of the record is published in six parts. It is one document, split only
so that each part is readable on its own.

1. [Roles and the end-to-end workflow](https://blog.subzerodev.com/ai-workflow-roles-and-pipeline)
   — which model or tool owns which job, and the nine stages from bootstrap to
   protocol extraction.
2. [Architecture, the Terraform runner, and publishing](https://blog.subzerodev.com/ai-workflow-architecture)
   — the split between declarative external state and repository artifacts, the
   thin Terraform runner plugin, and the content pipeline behind this blog.
3. [Development environments and mobility](https://blog.subzerodev.com/ai-workflow-environments)
   — why execution stays local for now, what the cloud environments lacked,
   portable project images, and multi-machine transport.
4. [Observations and operating limits](https://blog.subzerodev.com/ai-workflow-observations-and-limits)
   — who gets the multiplier, how the human role expanded, the concurrency
   ceiling, and dated quota observations.
5. [Metrics to track](https://blog.subzerodev.com/ai-workflow-metrics)
   — delivery, quality, AI efficiency, and human load, plus the workflow
   comparisons worth running.
6. [Current state, roadmap, and Projects as Code](https://blog.subzerodev.com/ai-workflow-state-and-roadmap)
   — what is proven, what is experimental, what is planned, and the target model
   the whole thing is converging on.
