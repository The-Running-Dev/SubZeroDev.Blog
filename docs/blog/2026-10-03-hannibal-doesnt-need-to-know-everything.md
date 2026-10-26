---
title: "Hannibal Doesn't Need to Know Everything"
description: "On Derivco's A-Team, refusing the eight-hour sports-betting course, delegating specialist knowledge, and starting with the reusable abstraction."
slug: hannibal-doesnt-need-to-know-everything
authors:
  - subzerodev
date: 2026-10-03T07:41:00Z
tags:
  - ai-assisted-engineering
  - architecture
  - automation
  - stories
---

# Hannibal Doesn’t Need to Know Everything

Years ago I worked for Derivco Sports.

With a D.

Sports betting.

I knew fuck-all about sports betting.

This did not particularly concern me.

<!-- truncate -->

At some point the product owner decided that, since I was leading a team working on sports-betting software, the logical thing to do was enroll me in an **eight-hour sports-betting course**.

Eight hours.

To learn sports betting.

I said:

**No thank you.**

Not because sports betting was beneath me.

Not because domain knowledge is useless.

Because I already had people who knew sports betting.

What the fuck was I going to accomplish by spending eight hours becoming the least knowledgeable sports-betting expert in the building?

My job wasn’t to become all of them.

My job was to bring them together.

I called that team the **A-Team**.

And I was Hannibal.

Hannibal doesn’t need to be B.A.

He doesn’t need to be Face.

He definitely doesn’t need to be Murdock.

Hannibal needs to know what everybody can do, put the right people together, point them at the right problem, and then stand there at the end with a cigar saying:

**I love it when a plan comes together.**

Apparently I’ve been doing this for most of my life.

Today I realized I’m now doing exactly the same thing with AI.

I needed an automatic updater.

Windows applications.

Linux applications.

.NET.

And this time I didn’t even bother with the usual software-development ritual.

Normally it goes something like this:

Build feature.

Need feature somewhere else.

Copy feature.

Realize duplication is getting ugly.

Extract abstraction.

Regret previous decisions.

Refactor everything.

Invent package.

Pretend this was the architecture all along.

Fuck that.

I started with the abstraction.

I told the AI, essentially:

**I need an updater. I’m going to reuse this updater. So make the fucking updater a reusable package.**

And now I have:

**SubZeroDev.Platform.Updater**

A reusable package I can stick into different Windows and Linux applications.

It uses some other package underneath.

Velikos.

Venya.

Velopack?

Fuck if I know.

I have no idea.

And here is the important part:

**I don’t need to know.**

I need to know what *my* abstraction does.

I need to know its contract.

I need to know where it belongs.

I need to know that I can reuse it.

Whatever implementation package underneath handles the ugly bits can continue living its little package life without me enrolling in an eight-hour course about it.

This is apparently the exact same thing I was doing at Derivco.

I didn’t know sports betting.

The people around me did.

So I delegated the shit out of sports betting.

Now I don’t know the internals of whatever update framework the AI selected.

Fine.

The AI does.

Or at least it knows enough to wire the fucking thing together, write the code, test it, package it, and hand me the abstraction I asked for.

My contribution is not memorizing every API it touched.

My contribution is saying:

**No. Don’t weld this functionality directly into this application. We’re going to need it again. Build the reusable thing now.**

That’s architecture.

And it turns out this same pattern works outside software too.

My BMW needs an engine.

Can I evaluate an M62TUB44 by listening to it?

Absolutely fucking not.

So I know a BMW guy who can.

Can I cheaply transport an engine across Bulgaria?

Not particularly.

The same BMW guy knows people who can.

Can I install the engine?

Fuck no.

I know somebody who can.

So I don’t need to become a BMW mechanic.

I need Vasil.

I don’t need to become a sports-betting expert.

I need people who understand sports betting.

I don’t need to memorize the internals of every package my software uses.

I need to understand the system I’m building.

There is a strange idea in technical work that competence means personally knowing everything.

It doesn’t.

That becomes increasingly impossible as systems get larger anyway.

Eventually the useful skill becomes knowing **what needs to exist**, what the boundaries are, what can be delegated, and who—or now what—can reliably own each piece.

Twenty-something years ago it was engineers and domain experts.

Now some of those specialists are AI agents.

Same architecture.

Different team.

Hannibal still doesn’t need to weld the fucking van.

He just needs to make sure nobody welds it to the building.
