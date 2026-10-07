---
title: "I Accidentally Built Another Platform"
description: "I needed a portfolio. Then hot corners. Then window state. Then session restore. This is how infrastructure happens."
slug: i-accidentally-built-another-platform
authors:
  - subzerodev
date: 2026-10-07T09:32:00Z
draft: true
tags:
  - programming
  - projects
  - stories
---

# I Accidentally Built Another Platform

Apparently I have a problem.

I cannot just build the thing.

I build the thing.

Then I notice that the thing could be reused.

Then I componentize the thing.

Then I add a data model.

Then I add a pipeline.

Then six hours later I have accidentally created infrastructure.

Again.

<!-- truncate -->

## The Portfolio That Became a Portfolio System

A while ago I wanted a portfolio.

Normal people would make a website.

I did make a website.

It was pretty fucking cool, actually.

Then I made the portfolio itself into a reusable platform UI component.

It can run standalone.

It can be embedded into another application.

The project data lives in YAML.

The tooling converts it to JSON.

The publishing pipeline handles the rest.

So now when I finally bother to add the twenty-ish projects I have built since I last updated it, maintaining the portfolio is basically data entry.

Which means I solved the interesting problem and immediately stopped caring about maintaining it.

Excellent.

Another project completed.

## Then I Wanted Hot Corners

I have always liked hot corners on the Mac.

I have seen Windows implementations.

I did not like them.

A couple of weeks ago I thought:

> "Why don't I just make a proper Hot Corners app for Windows?"

Two weeks later I had version one.

A real one.

Working.

Not a demo.

Not a todo list tutorial with AI sprinkled on it.

A thing I actually use.

Then I added Linux support.

Because why not?

That is apparently the phrase that destroys my weekends.

## Then Windows Annoyed Me Again

I always arrange my applications in particular places.

This goes here.

That goes there.

This monitor gets these windows.

That monitor gets those.

Then I restart something and Windows goes:

> "Interesting layout. It would be a shame if somebody forgot all of it."

So now the next version needs window state management.

Launch an application.

Remember where I put it.

Next time it launches, put it back.

This seems like a deeply reasonable request from a computer in 2026.

Apparently we remain on speaking terms with chaos instead.

## Then I Remembered Sessions Exist

Of course window placement is not enough.

Another Windows annoyance:

Some applications restore after restart.

Some do not.

Windows has pieces of session restoration.

Some apps register for restart.

Some remember their own state.

Some wake up wherever they fucking feel like.

What I want is simple:

Before restart, save what is running.

After restart, wait for the system to settle down.

Launch the same applications.

Restore them to the same places.

Done.

Now HotCorners is no longer really HotCorners.

It is becoming a window manager.

Or a session manager.

Or a desktop manager.

Wonderful.

## Fuck It, Maybe a Desktop Environment

Then my brain did the thing.

I remembered LiteStep.

AfterStep.

Enlightenment.

That wonderful era when people looked at a desktop environment and said:

> "No. I reject your entire philosophy of rectangles."

And suddenly I am thinking about replacing more of the Windows shell.

Or taking Linux, not writing a kernel because I am not clinically insane, and building my own desktop layer on top of the kernel and existing userspace.

Why rewrite drivers?

Why rewrite networking?

Why rewrite filesystems?

The hard infrastructure already exists.

I want the desktop behavior.

So now the progression is:

**Hot corners.**

Then:

**Window placement.**

Then:

**Session restore.**

Then:

**Desktop management.**

Then:

**Maybe my own Linux environment.**

This is how platforms happen.

Not because somebody sits down and says:

> "Today I shall create a platform."

That sounds exhausting.

Platforms happen because somebody gets irritated by the same problem three times and eventually says:

> "Fuck it. This should be a component."

## This Is Apparently What I Do

I used to think I built applications.

I am increasingly suspicious that I build reusable machinery because I am offended by duplication.

If something might exist twice, my first instinct is to pull it apart and make it reusable.

A page becomes a component.

A workflow becomes a tool.

A game mechanic becomes an engine system.

A portfolio becomes a platform component.

A hot-corner utility starts eyeing the operating system suspiciously.

The immediate task gets solved.

Then the abstraction survives.

Then the abstraction becomes the interesting part.

And six months later I am staring at another repository wondering:

> "When the fuck did this become infrastructure?"

Apparently somewhere around the second time I said:

> "Because why not?"
