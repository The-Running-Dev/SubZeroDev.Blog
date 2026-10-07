---
title: "It’s a Goddamn Tool, People"
description: "Hallucinated tickets, discarded tests, ignored support, and the management miracle of blaming the tool afterward."
slug: its-a-goddamn-tool-people
authors:
  - subzerodev
date: 2026-10-07T00:00:00Z
draft: true
tags:
  - ai
  - development
  - workflow
---

Take this scenario.

An AI invents a ticket that doesn't exist. Somebody acts on it. Nobody checks the tracker.

The conclusion?

> “AI is unreliable.”

Yes. That is useful information about the tool.

Now explain the part where an imaginary ticket became real work without anybody checking whether the fucking ticket existed.

<!-- truncate -->

That second question keeps disappearing.

We identify a failure in the output, then behave as though the entire system between output and consequence was a perfectly innocent length of pipe.

It wasn't.

People chose how that output would be used. Someone decided what needed checking. Someone decided who could act on it and how far the mistake could travel.

The hallucination is a model failure. Accepting it as authoritative is a process failure. Both can exist in the same sentence without civilization collapsing.

## No Time for Tests

Here is another completely unsurprising sequence of events.

Management wants more code.

AI produces more code.

Testing becomes an obstacle to the magnificent upward movement of the line on the dashboard.

> “We don't have time for tests.”

Support starts reporting problems.

Support is ignored because support has an unfortunate habit of discussing what happens after the metric has already turned green.

More code ships. More defects arrive. Customers become involuntary participants in the quality-assurance department.

Then somebody announces:

> “The problem is AI-generated code.”

Motherfucker, you removed the brakes because the car was going faster.

## Let's Discuss the Car

Imagine buying a faster car.

You drive faster. Stop maintaining it. Ignore the warning lights. Decide checking the tyres is unnecessary overhead. When somebody says you should slow down, you explain that slowing down would hurt the velocity numbers.

Then you crash.

> “Cars are dangerous.”

Correct.

Which is why the maintenance, warning lights, tyres, brakes, and person paying attention were part of the fucking arrangement.

A defective car deserves investigation. So does a model that fails in a particular way. You may need a different tool, a narrower task, or a decision not to use it at all.

But “the car was involved” does not explain why you were doing 140 through a hedge.

## Acceleration Works Both Ways

AI can accelerate a good process.

It can also accelerate a shitty process.

If requirements are vague, you can now implement the wrong thing more efficiently. If review is ceremonial, you can approve more mistakes. If nobody listens to support, you can generate complaints faster than support can explain them.

That is throughput.

It just isn't progress.

The useful questions are embarrassingly ordinary. What is this supposed to do? What evidence would show it works? Who checks that evidence? What happens when it doesn't work? Can we limit the damage and undo the change?

For the ticket, look in the tracker. For the code, test the behavior against a requirement that wasn't reverse-engineered from the code. For the customer complaint, investigate the actual failure instead of admiring the number of closed tickets.

> “A green dashboard cannot hear the screaming.”
>
> — Publius Velocitus

You still have to engineer the system around the tool.

That includes accounting for how the tool fails. “It's just a tool” is not permission to stop thinking. It's the reason the thinking is still your responsibility.

If AI produces garbage, call it garbage. Fix it, reject it, change the workflow, change the tool.

But if management demanded speed, deleted verification, ignored the people reporting damage, and rewarded everyone for continuing, the postmortem needs a few more names than the one on the model subscription.

It's a goddamn tool, people.

The organization chart remains operational.
