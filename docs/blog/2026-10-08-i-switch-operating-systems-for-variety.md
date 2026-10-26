---
title: "I Switch Operating Systems for Variety"
description: "A maxed-out 2018 machine, three operating systems, Parallels sitting right there, and the completely reasonable decision to boot all of them bare metal anyway."
slug: i-switch-operating-systems-for-variety
authors:
  - subzerodev
date: 2026-10-08T09:45:00+03:00
tags:
  - development
  - stories
  - absurd
  - well-why-not
---

# I Switch Operating Systems for Variety

I have a machine from 2018.

That sentence normally means:

> Old laptop. Probably time to replace it.

Except I maxed the fucking thing out when I bought it.

Four-terabyte SSD.

Thirty-two gigs of RAM.

Highest CPU I could get in it.

Years later, the thing is still a beast.

And at one point I looked at this perfectly functional machine and thought:

> I want Windows on it.

Fine.

Then:

> I want Linux on it too.

Also fine.

Then:

> Obviously it still needs macOS.

And that is how I ended up with one machine booting three different operating systems.

<!-- truncate -->

There was no grand architectural need.

There was no enterprise requirement.

Nobody handed me a ticket that said:

> **Acceptance criteria: laptop must become whichever computer Ben feels like using today.**

I just wanted all three.

Sometimes I wanted Windows.

Sometimes Linux.

Sometimes macOS.

Sometimes I got tired of one and switched to another.

Sometimes I switched purely for variety.

That sentence is ridiculous enough that it deserves to stand alone:

> **I switch operating systems for variety.**

Most people change wallpaper.

Maybe a browser.

Maybe they rearrange the desktop.

I apparently change the entire operating system.

## Parallels Was Already Installed

The especially stupid part is that I had Parallels.

Virtualization existed.

The practical, normal-person answer was already installed on the machine.

Need Windows?

Boot a VM.

Need Linux?

Boot another VM.

Keep macOS underneath.

Done.

Problem solved.

Except I looked at that perfectly reasonable solution and thought:

> Fuck that. I want bare metal.

Because if I am going to run Windows, I want the machine to be Windows.

If I am going to run Linux, I want Linux talking directly to the hardware.

No guest.

No host underneath it.

No abstraction layer quietly reminding me that the "other computer" is still just a process inside this one.

Could I have done everything I needed in Parallels?

Probably.

Did that matter?

Apparently not.

## Because I Can, but Also Because It Is Practical

This is one of those weird stages I get into.

The thought starts with:

> Can I do this?

Then immediately becomes:

> Well, why the fuck wouldn't I?

And then, annoyingly, there is usually a practical argument hiding underneath the absurdity.

One machine.

Three environments.

The software, tooling, behavior, and weird edge cases of each one available directly.

If I need something Windows-specific, reboot.

Want Linux for a while, reboot.

Want macOS again, reboot.

It is simultaneously unnecessary and useful.

That combination is dangerous.

Purely unnecessary things eventually bore me.

Purely practical things are often boring from the beginning.

But give me something that is both technically unnecessary **and** operationally useful?

Now we have a project.

## The Machine Is Not the Operating System

I think this is the part that gets me.

People tend to buy a machine and accept the identity printed on the box.

This is a Mac.

This is a Windows PC.

This is a Linux machine.

Sure.

Until I decide otherwise.

The hardware does not care about the branding nearly as much as the product story does.

The hardware has a CPU.

Memory.

Storage.

Radios.

Ports.

A display.

Everything above that is layers.

Useful layers.

Sometimes excellent layers.

Still layers.

So once I know the hardware can do something, "this is what it is supposed to run" stops being a particularly compelling argument.

That does not mean every unsupported configuration is smart.

It means support boundaries and capability boundaries are not the same thing.

I care a lot more about the second one.

## The Operational Excuse

I can make this sound very responsible.

And, annoyingly, it would not even be bullshit.

I work across operating systems.

I test things.

I build things.

I occasionally need native behavior.

Different filesystems matter.

Different shells matter.

Different networking behavior matters.

Different APIs matter.

Bare metal can matter.

All true.

Very professional.

Excellent justification.

There is just one problem.

I also did it because I fucking wanted to.

That is the actual architecture document.

## Well, Why Not?

A lot of my technical life seems to live in this exact intersection:

> **Do it because you can. Also do it because it is practical.**

The first half creates the experiment.

The second half keeps it from being pointless.

That is how a maxed-out 2018 machine ends up triple-booting.

That is how virtualization can be sitting right there, working perfectly, while I decide the proper solution is repartitioning drives and convincing three operating systems to coexist on the same hardware.

It is not rebellion against virtualization.

I use virtualization.

It is not even rebellion against simplicity.

I like simple systems.

It is just that sometimes the cleanest answer to me is not:

> One operating system plus virtual machines.

Sometimes it is:

> This machine can be three different machines.

And once that idea gets into my head, the outcome is more or less predetermined.

Windows.

Linux.

macOS.

Bare metal.

Because I can.

Because it is useful.

And, occasionally, because Tuesday needed a different operating system.
