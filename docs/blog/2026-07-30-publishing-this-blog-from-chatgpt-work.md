---
title: "Publishing This Blog from ChatGPT Work"
description: "How a conversation in ChatGPT Work became a fully automated, repository-driven publishing pipeline."
slug: publishing-this-blog-from-chatgpt-work
authors:
  - subzerodev
date: 2026-07-30T16:59:52Z
tags:
  - ai-assisted-engineering
  - automation
  - site-updates
  - blog-publishing
---

This blog is Git-backed, but that does not mean I need to sit at a desktop to publish something.

The authoring surface is ChatGPT Work. I can start from my phone, describe an idea in a normal conversation, refine it naturally, and let a repository-aware agent carry the work from Markdown all the way to production.

The interesting part is that ChatGPT is not the publishing system.

The repository is.

<!-- truncate -->

## It Started as an Experiment

The original goal was simple: write blog posts without sitting in front of a computer.

I expected to build APIs, webhooks, mobile shortcuts, maybe even an MCP server or a custom GPT.

Instead, I discovered something much simpler.

By giving the repository explicit publishing instructions, the AI could inspect the repository, understand its conventions, and execute the existing engineering workflow.

The phone became nothing more than the conversation interface.

The repository remained the source of truth.

## The Division of Responsibility

The conversational side is where every article begins.

I supply:

- the story
- the idea
- the argument
- the technical content
- the editorial direction

The LLM helps shape that into a coherent article while preserving the discussion context.

The repository owns everything else.

It defines:

- front matter
- author identifiers
- controlled tag vocabulary
- filename conventions
- validation commands
- CI requirements
- deployment rules
- merge policy

The agent discovers those rules before making changes instead of assuming them.

That distinction turned out to be incredibly important.

The AI doesn't know how my blog works.

The repository teaches it.

## The Workflow Today

The current workflow is dramatically simpler than I expected.

1. I open ChatGPT Work on my phone.
2. I describe the story or technical topic naturally.
3. We refine the article together until it says what I actually mean.
4. I invoke the repository publishing workflow.
5. The agent inspects the repository before changing anything.
6. It creates the Markdown post using the repository conventions.
7. It validates the repository.
8. It creates a branch.
9. It commits and pushes.
10. It opens a ready Pull Request.
11. It enables automatic squash merge.
12. It monitors CI.
13. It fixes any repository validation issues if necessary.
14. After all required checks pass, GitHub merges automatically.
15. The deployment runs.
16. The agent verifies the published HTTPS route.

There is no "copy this into GitHub."

There is no manual branch management.

There is no opening VS Code just to publish an article.

The entire engineering workflow executes from a conversation.

## Repository First

The biggest realization was that the workflow is not ChatGPT-specific.

Everything important lives in the repository.

- AGENTS.md
- publishing workflows
- templates
- CI
- Docusaurus configuration
- validation rules
- controlled tag vocabulary

That means any future client could drive the same workflow.

Today it happens through ChatGPT Work.

Tomorrow it could be:

- Claude
- Codex
- a local CLI
- an automation service
- a Docker container
- another AI client entirely

The repository remains the operational contract.

The client becomes interchangeable.

## More Than Blog Posts

While building this workflow, I realized I wasn't really building blog automation.

I was building a publishing pipeline.

The exact same workflow can eventually publish:

- release announcements
- changelog summaries
- architecture articles
- project updates
- development journals
- technical documentation
- conversation summaries

The content changes.

The pipeline doesn't.

## CI Becomes the Publisher

Another interesting consequence is that repositories can eventually publish for themselves.

Every project already knows:

- what version was released
- which issues were closed
- what changed
- which commits were included
- what the generated release notes contain

After a successful release, CI can invoke the same publishing workflow automatically.

Instead of manually writing release posts, the repository already has nearly everything required to generate them.

The LLM simply turns structured engineering data into readable prose.

## Why This Works

None of this bypasses engineering discipline.

Quite the opposite.

The AI is deliberately **not** trusted to invent repository rules.

It must inspect the repository first.

Validation still belongs to CI.

GitHub still owns protected branches.

Production deployment still happens through the existing pipeline.

The AI writes.

The repository governs.

GitHub verifies.

## Two Days Later

The most surprising part of this experiment wasn't the technology.

It was the speed.

Within two days:

- the blog was live
- multiple posts had already been published
- the publishing workflow had been streamlined
- automatic merge and deployment were working
- publishing from ChatGPT Work had become routine
- a landing page for the Game Engine was online
- there was already enough content to make the whole experiment feel ridiculous

I started trying to automate writing blog posts.

I accidentally built a repository-driven publishing system.

The phone became the interface.

The repository became the product.
