---
title: "Your AI Is Not Your Project Memory"
description: "Why a project should survive a fresh conversation, a different model, and the loss of six months of chat history."
slug: your-ai-is-not-your-project-memory
authors:
  - subzerodev
date: 2026-10-07T00:00:00Z
draft: true
tags:
  - ai
  - llm
  - knowledge-management
  - workflow
---

Suppose you've been working on a project with Sonnet and want to try Opus.

The immediate question is whether switching models will preserve enough understanding to continue.

Reasonable question.

But here's the one I care about more:

**Can this project survive opening a new fucking conversation?**

<!-- truncate -->

If six months of decisions exist only inside one enormous chat, the model switch is the least interesting part of the problem.

You've made a conversation into critical infrastructure.

Congratulations. Your architecture now has an emotional support scrollbar.

## Working Memory and Project Memory

A conversation is useful working memory.

We can explore options, argue about tradeoffs, inspect a failure, try something, discover why it was stupid, and change direction. Keeping that local context together can be valuable.

But a transcript records the journey. It does not reliably identify the current destination.

We considered option A. Rejected it. Tried B. Discovered a constraint. Returned to a modified A. Somebody said “yes” after a paragraph containing three separate proposals.

Which part is authoritative?

The project needs an answer that doesn't require archaeological interpretation of my Tuesday mood.

That answer belongs in maintained artifacts:

- The repository contains the implementation and version history.
- The brief and design describe the intended result and boundaries.
- Contracts define the behavior other parts of the system can depend on.
- Tests provide executable checks of selected requirements.
- Decision records explain what was chosen, why, and which alternatives were rejected.
- A current work record says what is finished, what is unfinished, and what happens next.

These have different jobs. A test passing doesn't prove the brief is correct. A design document doesn't prove the implementation matches it. Their disagreements are useful evidence, provided somebody actually checks.

**The conversation is disposable. The project state isn’t.**

## The Entire Transcript Is Not a Free Briefing

Long context can help when the task actually needs it. A giant context window doesn't make every old message relevant.

The exact billing depends on the service, model, and caching arrangement. I'm not claiming every turn charges the entire history at the same rate. I'm saying that context has costs worth measuring: input processing, available capacity, and the work of finding the relevant signal among abandoned ideas.

Cheap noise is still noise.

If I need one contract, sending the contract plus fifty discussions about earlier versions doesn't automatically improve the request.

And asking for a shorter answer doesn't remove the input I already sent.

I want to spend context on the problem in front of the worker. I want the durable record to be concise enough to navigate and detailed enough to resolve the decisions that matter.

That requires maintenance. Dumping the entire conversation into a Markdown file and naming it `project-memory.md` is the same landfill wearing a different hat.

## A Handoff Someone Can Actually Use

Before ending a session, record the state needed to resume. Something like this, with real paths and references filled in:

```text
Objective: Add the agreed retry behavior.
Starting point: Branch and commit identifying the work.
Read first: Brief, retry contract, relevant implementation.
Decision: Retry only the failures named in the contract.
Completed: Implementation and timeout cases.
Validation: Exact checks run, results, and checks not run.
Unfinished: Cancellation case has not been verified.
Next: Reproduce cancellation, then add the missing case.
```

The new worker reads the relevant artifacts and inspects the actual branch. It doesn't treat the handoff's “completed” line as proof. Commits, diffs, test results, and current source provide evidence.

When a decision changes, update its authoritative home. When an approach is rejected for a reason someone might rediscover expensively, preserve the reason. When something remains unverified, write that down plainly.

“Everything should be fine” is not a handoff.

It's how horror films introduce the basement.

## AgentKit Is My Practical Example

My [AgentKit](https://github.com/The-Running-Dev/SubZeroDev.AgentKit) puts the design pipeline into explicit artifacts: a brief, a design, a contract, implementation slices, and decision records.

That is the useful part here. The next worker has somewhere to read what the project is supposed to be and which piece of work it should perform.

The kit also separates shared rules, repository rules, and lessons learned. Those aren't substitutes for code inspection. They are entry points that make a new session less dependent on the personality and memory of the previous one.

You don't need my exact filenames or commands to apply the principle. You need an agreed home for each kind of state, and a habit of updating it when reality changes.

A stale document is not made authoritative by its excellent filename.

## Replace the Worker

Model portability doesn't mean every model performs equally well, or that every application can import another application's chat history.

It means the project can be understood without that history.

A different worker can read the same contract, inspect the same repository, attempt the same bounded task, and have its result checked against the same requirements. It may need different instructions. It may fail. You evaluate that from the work.

You can also return to the previous model. Nothing requires a lifelong commitment because one of them was particularly helpful in March.

> “The worker may leave. Keep the fucking blueprints.”
>
> — Archivus Persistus

The practical test is simple: start fresh, provide the maintained entry points, and see what is missing.

Then fix the missing project state.

Don't keep the old chat alive on a ventilator.
