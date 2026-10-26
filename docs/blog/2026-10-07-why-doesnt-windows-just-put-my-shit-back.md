---
title: "Why Doesn't Windows Just Put My Shit Back?"
description: "A modest request for Windows: remember my apps, remember my windows, and stop making me rebuild my desktop after every restart."
slug: why-doesnt-windows-just-put-my-shit-back
authors:
  - subzerodev
date: 2026-10-07T09:33:00Z
draft: true
tags:
  - windows
  - programming
  - projects
---

# Why Doesn't Windows Just Put My Shit Back?

I have a revolutionary feature request for Windows.

Remember where I put my fucking windows.

That is it.

That is the breakthrough.

I am available for consulting.

<!-- truncate -->

I use multiple applications.

I arrange them in particular places.

Some go on one monitor.

Some go on another.

Some are sized a certain way because that is how I work.

Then something restarts.

Or Windows restarts.

Or an application crashes.

And suddenly the operating system behaves as though we have never met.

> "Oh, you had a preferred layout?"

Yes.

Every day.

For years.

Thank you for noticing.

## Windows Sort Of Does This

This is what makes it annoying.

The pieces exist.

Windows can restart certain registered applications.

Some applications restore their own sessions.

Explorer remembers some things.

Modern apps have various mechanisms.

There are startup entries.

There are virtual desktops.

There are tools that remember layouts.

There are utilities that almost solve the problem.

Almost.

What I want is not a bag of unrelated almost-features.

I want:

**Save my working session.**

Then:

**Restore my working session.**

That is the feature.

## Hibernate, the Forgotten Solution

This is why I still use hibernate.

People forget hibernate exists.

I turn that shit on.

Why?

Because hibernate does not reconstruct my session.

It simply freezes the whole damn machine and brings it back.

Memory.

Processes.

Windows.

Everything.

It is the brute-force solution to session management.

Instead of remembering what I was doing, Windows remembers the entire universe.

Effective.

Not elegant.

Hibernate has limitations.

You preserve stale state.

You preserve whatever weirdness was already accumulating.

Memory state has to be written out and restored.

Sometimes what I actually want is a clean restart.

But I do not want a clean restart badly enough to spend ten minutes reconstructing my workspace like a fucking archaeological exhibit.

## The Session Manager I Actually Want

The state is not conceptually complicated.

For each application:

- what was running;
- where its windows were;
- which monitor they were on;
- their size;
- maybe which desktop or workspace;
- maybe enough application-specific information to restore meaningful state.

Before restart, save it.

After restart, give Windows time to stop thrashing around.

Then restore it.

Launch applications in a sane order.

Delay the heavy stuff if necessary.

Put the windows back.

If I always want that behavior, do it automatically.

If I want a choice, ask:

> "Restore previous session?"

Yes.

Thank you.

We have achieved civilization.

## Window Placement Is the First Half

This is already creeping into my HotCorners project.

Because of course it is.

The next obvious feature is persistent window placement.

I put an application somewhere.

The system remembers.

Next time the app launches, it goes back there.

That alone solves a surprisingly irritating part of daily Windows usage.

But once you know where the windows belong, session restoration becomes the obvious next step.

Now the project stops being "hot corners."

It becomes desktop state management.

And suddenly I am looking at twenty years of Windows shell behavior thinking:

> "Fine. I'll do it myself."

## I Do Not Want More Automation

This is the funny part.

I do not want some giant AI assistant guessing what my desktop should look like.

I already know what it should look like.

I put it there yesterday.

The computer's job is not to infer my intent.

The computer's job is to remember the fucking coordinates.

Sometimes software does not need intelligence.

Sometimes it needs memory.

That may be the most offensive part of the problem.

We have machines generating code, images, music, simulations, summaries, and entire applications.

And after a restart I still have to drag my terminal back to the monitor where it has lived since the Bronze Age.

So yes.

I am probably building this.

Because apparently Windows cannot just put my shit back.
