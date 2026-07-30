---
title: "Publishing This Blog from ChatGPT Work"
description: "The actual client-to-pull-request workflow used to turn a conversation into a reviewed blog post without opening a desktop."
slug: publishing-this-blog-from-chatgpt-work
authors:
  - subzerodev
date: 2026-07-30T00:00:00
tags:
  - ai-assisted-engineering
  - automation
  - site-updates
---

This blog is Git-backed, but that does not mean I need to sit at a desktop to publish something.

The authoring surface can be ChatGPT Work. I can start from an iPhone, describe the post in a normal conversation, correct the wording as we go, and have an agent carry the repository work through a draft pull request. The repository and its checks remain the source of truth. The LLM client is the conversational front end.

<!-- truncate -->

## The Division of Responsibility

The conversational side is where the post begins:

- I supply the subject, story, argument, or rough material.
- The LLM helps turn it into a publishable draft and keeps the discussion context available while I refine it.
- I decide what stays, what changes, and whether the result represents what I meant.

The repository side is deliberately stricter:

- Blog instructions, front-matter rules, author keys, tag vocabulary, and validation commands live in version control.
- A GitHub-connected agent reads those rules before changing anything.
- The post is committed on a focused branch and opened as a draft pull request.
- GitHub Actions performs the production validation.
- Nothing is merged until I explicitly authorize it.

That split matters. ChatGPT is useful because it lets the authoring process be conversational. Git and CI are useful because they make the published result reviewable, reproducible, and independently checked.

## What I Actually Do

At the moment, the practical flow is this:

1. In ChatGPT Work, I ask to create a blog post and name the repository: `The-Running-Dev/SubZeroDev.Blog`.
2. I give the agent the story or the topic, then shape the draft in conversation. This is editing, not a blind content-generation pipeline.
3. I give it the repository publishing instructions. They require the agent to inspect `AGENTS.md`, the post template, existing posts, `tags.yml`, the Docusaurus configuration, and the CI workflow before it writes.
4. The agent creates a date-prefixed Markdown post on a new branch, with the required metadata, a controlled tag set, and a useful `<!-- truncate -->` excerpt.
5. It validates the post as far as the available environment permits, commits it, pushes the branch, and opens a draft PR.
6. The production documentation checks run against that exact PR commit.
7. I review the result, decide whether any review feedback is valid, and explicitly authorize the PR to be marked ready and merged.

The result is not a magic “publish whatever the model said” button. It is a short, mobile-friendly conversation that drives a normal repository delivery path.

## Why Work Mode Fits

Work mode carries the wider project context: the blog repository, the publishing rules, earlier articles, my preferences about how much editorial rewriting is acceptable, and the fact that the final approval is mine.

That means I do not have to restate the whole operational contract every time I have a thought worth publishing. I still provide the substance. The client supplies continuity and an interface for the repository-aware agent.

For a personal story, I can tell it as I would tell it to a person and revise the draft until it sounds like me. For a technical post, I can start with a rough observation or a specification and ask for a factual, structured article. In both cases, the same downstream checks apply.

## The Current Interface and the Intended One

The target interface is intentionally small:

- `/create-blog` creates the draft and required metadata.
- `/preview` renders and validates it.
- `/publish` commits, pushes, opens or updates the PR, and follows the repository’s delivery process.

Right now, those steps can be performed through a repository-aware agent using explicit workflow instructions and GitHub-connected tools. The next step is to make the commands a reusable skill, then expose the shared capability through MCP and an Automator or NPX plugin.

The point is not to make ChatGPT the permanent owner of the publishing system. The point is to make every LLM client a thin interface over the same controlled capability. ChatGPT Work is simply the first interface I am using because it lets me create and direct posts from the device already in my hand.

## Guardrails

A few boundaries keep this useful instead of reckless:

- The agent must not invent repository conventions; it reads them first.
- Tags and front matter must match the controlled configuration, or the Docusaurus build rejects the post.
- The post stays in a draft PR until checks and review are complete.
- CI, not the model’s confidence, is the build authority.
- The LLM may draft and edit, but I retain editorial judgment and merge authority.
- No publishing credentials, tokens, or private configuration belong in the conversation or post.

That is how a conversational client becomes a practical publishing interface without replacing the systems that make publication safe.

For the repository-level rules behind the last mile, see [Writing Posts](https://blog.subzerodev.com/docs/writing-posts/). For the larger AI-assisted engineering model this sits inside, see [The AI-Assisted Software Engineering Workflow](https://blog.subzerodev.com/ai-assisted-engineering-workflow).
