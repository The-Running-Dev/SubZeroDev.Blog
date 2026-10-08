---
title: "My Developers Are in the Cloud. I Have No Idea How Many I Employ."
description: "Codex cloud, Claude cloud, and the ambition to coordinate an elastic engineering department whose only permanent employee still has to review everything."
slug: my-developers-are-in-the-cloud
authors:
  - subzerodev
date: 2026-10-08T09:00:00Z
tags:
  - ai
  - development
  - automation
  - absurd
---

There is a version of my future where somebody asks how many developers work for me and I have to open three dashboards before answering.

"Currently?"

"Roughly."

"Define currently."

This is what happens when you give a man access to cloud coding agents before he has finished configuring the first cloud coding agents.

<!-- truncate -->

## Human Resources Would Like a Word

I had already been using Codex in the cloud. Then Claude's cloud sessions and a $250 promotional credit offer entered the conversation.

At which point a perfectly reasonable engineering idea began developing an unreasonable organizational chart.

One agent working locally.

Another working remotely.

A task split into smaller tasks.

Somebody reviewing what somebody else produced.

Somewhere in the middle, me, trying to remember which window contains the important conversation.

This is the operation I want to make possible. It is not a report that I have already connected all of these pieces into a working fleet.

**The shared environment setup is still unfinished.**

At present, the imaginary HR department has more complete paperwork than some of the actual onboarding.

Which, to be fair, would make it a remarkably realistic company.

## The Employee Handbook Is a Repository

A useful remote agent needs more than my enthusiasm.

It needs to know how the project works. How to install its dependencies. Which checks matter. What it may change. What it must leave alone.

It needs a way to get from a fresh checkout to a working environment without asking which mysterious thing I installed on my laptop eleven months ago.

That is the environment work I started and still need to finish.

The target is a repeatable starting point: repository configuration, setup steps, instructions, and a way to prove the setup actually works.

Then, when I hand a task to a remote agent, I want the handoff to be boring.

Here is the repository.

Here is the task.

Here is what done means.

Bring back a reviewable change and the checks you ran.

If it needs a forty-minute oral history of my machine before it can start, I have not finished onboarding it.

I have just hired a remote developer whose first ticket is to reconstruct my laptop from folklore.

## Two Clouds, One Set of Intentions

The appeal of having both Codex cloud and Claude cloud available is that I can choose where to send a piece of work.

I want the repository to carry enough of the project with it that the choice does not require reinventing the project every time.

That does not mean both services will run identical setup files unchanged. I still need to test the actual environments and account for their differences.

It means I want one understandable project, with whatever service-specific setup is necessary to make it usable in each place.

The dependencies do not become optional because I like the model.

The tests do not become decorative because the machine is somewhere else.

And "it worked in the other cloud" would be a spectacularly annoying new version of a sentence software engineers already know.

I would prefer to avoid founding an international consultancy specializing in that sentence.

## Then the Org Chart Starts Breeding

Running tasks in the cloud is one thing.

Coordinating multiple agents is where the headcount joke starts paying rent.

Suppose I have two independent changes. Each gets its own branch, its own scope, and its own checks. While one runs, I can inspect the result of the other.

That sounds useful.

Now suppose I tell several agents to "improve the architecture" at the same time.

By dinner, I could have several incompatible architectures, each explained with tremendous confidence.

I would also have dinner, assuming I remembered to make it.

This is why the part I care about is the coordination.

Which task belongs to which agent? Which files or decisions are shared? What has to finish before the next task starts? Who brings the results together?

If two tasks depend on the same decision, starting them simultaneously does not settle that decision.

It gives the disagreement a second computer.

So the workflow I want has boundaries. Separate work where it can be separate. A clear handoff where it cannot. A visible record of what each agent changed and what remains unresolved.

The headcount can fluctuate.

Ownership should be easier to find than that.

## I Have Outsourced the Typing and Kept the Consequences

There is a lovely fantasy buried in all this.

I describe a problem. The computers go away. The computers return with a solution. I accept it and carry on with my life.

Sometimes the task may be simple enough for that to feel almost true.

But somebody still has to judge the result.

Did it solve the intended problem? Did it quietly broaden the scope? Are the checks relevant? Does it fit the project I am actually trying to build?

That somebody is still me.

If I eventually get several agents producing changes in parallel, I will also get several changes waiting for review.

I can already imagine the notification:

> Your developers have finished.

All of them?

At once?

Excellent.

I have automated myself into a queue.

So "more agents" cannot be the only measure of progress. I need work finishing at a rate I can understand, review, and integrate.

Otherwise I have acquired a distributed system for making me feel behind.

I could have achieved that with email.

## The Laptop Can Close. The Job Still Needs an Owner.

The part that keeps pulling me toward this is the possibility of separating execution from whichever computer I happen to be using.

I want to prepare a task, send it to a suitable environment, and come back to something concrete. A branch. A diff. Test results. A precise explanation of what got stuck.

A remote agent with a reproducible environment could make that much more practical.

Several carefully assigned agents could make independent work move together.

That is worth finishing the boring setup for.

It is also worth resisting the temptation to declare victory because I drew a diagram with two cloud logos and an arrow.

The next useful milestone is modest: finish the environment configuration and prove a bounded task can go through it cleanly.

Then repeat it. Then try another environment. Then increase concurrency where the work actually allows it.

Eventually, perhaps, somebody really will ask how many developers I have.

I will check the dashboards.

Count the active tasks.

Notice one agent has finished and another has started.

And give the only stable answer in the entire organization:

**"One person responsible for the result. Unfortunately, he's also the IT department."**
