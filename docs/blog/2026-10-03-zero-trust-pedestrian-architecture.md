---
title: "Zero-Trust Pedestrian Architecture"
description: "A Bulgarian zebra crossing, three drivers, one Ridgeback, and the difference between right of way and observable reality."
slug: zero-trust-pedestrian-architecture
authors:
  - subzerodev
date: 2026-10-03T00:00:00Z
tags:
  - stories
  - bulgaria
  - absurd
---

# Zero-Trust Pedestrian Architecture

There is a pedestrian crossing.

The road markings are right there.

The law can say whatever the law says.

The paint can be as white as fucking snow.

None of that means the approaching car is going to stop.

This is why I operate pedestrian crossings in Bulgaria under a zero-trust security model.

<!-- truncate -->

## The Specification

The specification is straightforward.

Pedestrian approaches zebra crossing.

Driver sees pedestrian.

Driver stops.

Pedestrian crosses.

Beautiful.

Clean interface.

Simple protocol.

Now we deploy it into production.

## The Runtime Environment

I was walking back from coffee with the Ridgeback.

Two-way road.

One lane each direction.

Marked pedestrian crossing.

I crossed the first half and stopped before stepping into the oncoming lane.

Two cars came from the other direction.

Both drivers could see me.

Both drove straight through.

Fine.

Expected behavior at this point.

Then a third car came along.

This motherfucker appeared to consider stopping.

For a glorious moment, the implementation approached the specification.

Then I heard tires.

**SCREEECH.**

Some little shitbox was braking hard enough to announce the decision to the entire neighborhood.

And then, apparently, the driver reconsidered.

He stopped stopping.

Kept driving.

I looked at him.

Started laughing.

> Whatever, buddy.

And he continued down the road.

## Right of Way Is Not a Force Field

This is the part I never understand when people talk about pedestrian priority as though it settles the matter.

Yes.

I understand the rule.

I am not confused about the little white stripes on the road.

The problem is that **being entitled to cross does not make the car disappear.**

I have seen enough stories about pedestrians getting hit where they were supposed to be safe that I do not outsource my continued existence to painted road markings.

So I wait.

I stand on the sidewalk beside the crossing.

Either there are no cars coming, or somebody demonstrably stops.

Not "looks like he might stop."

Not "surely he sees me."

Not "the law says he has to."

Stops.

Vehicle velocity approximately zero.

Excellent.

We have one useful data point.

## Then Check the Asshole Behind Him

Unfortunately, the first stopped car is not the whole system.

Because there is always the possibility that the motherfucker behind him decides:

> Why is this idiot stopped?

And goes around.

Now the car that did the correct thing is hiding the pedestrian from the genius overtaking it.

So even when somebody stops, I still look.

Past the car.

Behind the car.

Other direction.

Everything.

Dog or no dog.

## Then Sprint

And when I finally cross, I do not stroll.

I fucking sprint.

The Ridgeback gets an unexpected interval workout.

We are not stopping to admire the road markings.

We are not celebrating legal priority.

We are traversing an untrusted execution environment and minimizing time inside the blast radius.

This is not elegance.

This is operational experience.

## Trust the Protocol. Verify the Implementation.

Software people have spent years learning not to confuse a specification with a running system.

The API documentation says one thing.

Production says another.

The firewall rule exists.

The packet still gets through.

The health check says green.

The service is on fire.

The zebra crossing says:

> Pedestrians have priority.

Wonderful.

Show me the brake lights.

Show me the stopped wheels.

Then I will proceed.

The specification matters.

But reality gets final say.

So my pedestrian architecture remains simple:

Wait.

Observe.

Verify.

Cross quickly.

Keep watching.

Because the road markings are documentation.

**And Bulgarian traffic is production.**
