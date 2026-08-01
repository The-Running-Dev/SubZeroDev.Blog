---
title: "GitOps Isn't Just for Infrastructure Anymore"
description: "GitOps has quietly evolved beyond Kubernetes. AI agents, GitHub, and CI/CD now allow entire software workflows to be driven from a single Git commit."
slug: gitops-isnt-just-for-infrastructure-anymore
authors:
  - subzerodev
date: 2026-08-01T19:27:00Z
tags:
  - ai
  - automation
  - development
  - projects-as-code
---

# GitOps Isn't Just for Infrastructure Anymore

When most people hear **GitOps**, they think Kubernetes.

<!-- truncate -->

Git repository.

ArgoCD.

Flux.

Terraform.

Infrastructure.

That's where the term became popular.

But I think we're quietly entering a much bigger era.

## Git Is Becoming the Universal Source of Truth

For years my workflow looked like every other developer's:

```
Laptop
    ↓
IDE
    ↓
Git
    ↓
CI
    ↓
Production
```

Nothing unusual.

But over the past few weeks, something changed.

Not because of a new programming language.

Not because of a new framework.

Because of AI.

## My Phone Is Now a Development Console

Today I can pull out my phone.

Open ChatGPT.

Select my custom development assistant.

Tell it:

> "Pull this repository and add this feature."

The AI can:

- clone the repository;
- understand the architecture;
- make the change;
- create a commit;
- open a pull request;
- let CI validate everything;
- and deploy the result.

Meanwhile I'm standing in a supermarket.

Or walking the dog.

Or drinking coffee.

My phone isn't editing code.

It's dispatching engineering work.

That feels like a surprisingly fundamental shift.

## The New Workflow

The old workflow looked like this:

```
Phone
    ↓
Remote Desktop
    ↓
Laptop
    ↓
IDE
    ↓
Git
```

Now it increasingly looks like this:

```
Phone
    ↓
AI Agent
    ↓
GitHub
    ↓
Pull Request
    ↓
CI
    ↓
Production
```

GitHub has become the operating system.

The repository is the source of truth.

Everything else is automation.

## GitOps for Everything

This realization changed how I've started designing my own tools.

Instead of building applications that own data, I build applications that automate repositories.

The repository already contains:

- source code;
- documentation;
- blog posts;
- infrastructure;
- configuration;
- workflows.

Why duplicate it?

Instead, automate around it.

That idea led me to a new platform concept.

Imagine connecting your GitHub account.

Clicking **Create Blog**.

Five minutes later you have:

- a repository;
- Docusaurus configured;
- CI/CD;
- GitHub Actions;
- Cloudflare Pages;
- SEO;
- search;
- RSS;
- AI instructions;
- an MCP server;
- a REST API;
- and a local CLI.

The repository belongs to you.

The platform simply builds it.

## Multiple Interfaces, One Repository

Once Git becomes the source of truth, every interface becomes interchangeable.

You can publish from:

- a web UI;
- a CLI;
- an MCP server;
- a REST API;
- a local file watcher;
- or directly from Git.

They're all doing the same thing:

Creating commits.

Everything else is just a different front end.

## AI Changes the Economics

This is where it becomes really interesting.

Developers have spent decades building tools that humans operate.

Now we're building tools that AI operates.

Instead of designing a beautiful interface for clicking buttons, we design clean APIs, good specifications, deterministic workflows, and safe automation.

Humans become supervisors.

AI becomes the operator.

## The Repository Is the Product

One lesson I've learned while building these tools is surprisingly simple:

Don't own the customer's content.

Own the automation.

If someone stops using my platform, they should still have:

- their repository;
- their history;
- their Markdown;
- their CI;
- and their infrastructure.

No lock-in.

Just convenience.

Ironically, I think that's what makes people more willing to trust a platform.

## Where This Is Going

A few years ago the idea of deploying production software from your phone sounded absurd.

Today it isn't.

The phone isn't the computer anymore.

It's the command console.

The real work happens somewhere else:

GitHub.

AI agents.

CI pipelines.

Automation.

GitOps started as a way to manage infrastructure.

I think it's quietly becoming a way to manage everything.
