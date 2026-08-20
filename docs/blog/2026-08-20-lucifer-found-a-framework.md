---
title: "I Tried to Reuse a Landing Page. Lucifer Found a Framework."
description: "A simple attempt to abstract some React UI quietly became a static-site toolkit, application framework, deployment system, and possibly a recursive UI platform."
slug: lucifer-found-a-framework
authors:
  - subzerodev
date: 2026-08-20T12:00:00Z
tags:
  - ai
  - react
  - architecture
  - subzerodev
  - lucifer
  - absurd
---

Lucifer looked over my shoulder.

> "What are you building?"

"A reusable landing-page component."

He examined the repository.

> "This has a CLI."

"Yes."

> "And its own Vite build system."

"Apparently."

> "It generates routes, metadata, changelogs, deployment artifacts, and entire websites."

"That sounds excessive when you list it like that."

<!-- truncate -->

## The Original Idea

I did not begin with a grand architectural vision.

I had already built a couple of landing pages and noticed that parts of them could be abstracted.

The complete design document was approximately:

> "I should reuse this."

That was it.

I wanted a React gadget — something I could:

- render independently;
- inject into another application;
- compose inside a dashboard;
- configure at build time or runtime;
- publish as a standalone site with its own flavor;
- and eventually nest inside other reusable components.

A normal person might have extracted a React component.

I am apparently not involved in that workflow.

## The Component Escapes

The repository became:

`SubZeroDev.Platform.UI.LandingPage`

At first, this seemed like a perfectly reasonable name.

Then it acquired:

- README-driven rendering;
- changelog generation;
- structured JSON data sources;
- runtime data exposure;
- custom TypeScript adapters;
- multiple routes;
- static metadata generation;
- Open Graph and social metadata;
- its own internal Vite configuration;
- build, development, preview, and validation commands;
- deployment-tree merging;
- a reusable GitHub Action;
- a reusable Pages workflow;
- and enough tests to suggest that someone should have intervened.

Nobody intervened.

At some point, the abstraction changed.

The intended architecture had been:

```text
Application
└── LandingPage component
```

What I actually built was:

```text
LandingPage framework
└── Entire application
```

I had extracted the application lifecycle instead of the UI.

Perfectly understandable mistake.

Could happen to anyone.

## The Evidence Was Already Running

The funniest part is that I did not realize what I had built until I looked at how SubZeroDev.GameEngine uses it.

The Game Engine site owns:

- its React applications;
- its pages;
- its content;
- its styles;
- its assets;
- its interactions;
- its tests;
- and its questionable sense of humor.

It does not import some giant prebuilt `<LandingPage />` component.

Instead, it hands the LandingPage package a configuration that effectively says:

> "Here are my application entry points. Build them."

The package then:

- creates the HTML shells;
- generates the route metadata;
- runs the Vite build;
- bundles the custom React applications;
- verifies the output;
- merges the result with the documentation site;
- and prepares the combined artifact for deployment.

So the Game Engine owns the site.

LandingPage owns reality around the site.

That is not a component.

That is a small framework wearing a component's name tag and hoping nobody checks its identification.

## Enter Portfolio

Naturally, while discovering that LandingPage had escaped containment, I began building:

`SubZeroDev.Platform.UI.Portfolio`

Portfolio is closer to the original concept: a reusable piece of React UI that can become whatever the surrounding application requires.

It can be:

- rendered as a React component;
- injected into an existing application;
- served independently;
- published as a standalone portfolio site;
- composed inside a higher-level dashboard;
- or embedded inside another SubZeroDev UI module.

LandingPage can contain Portfolio.

Portfolio can potentially contain other modules.

A higher-level component can contain both.

That composition can then become another standalone site.

We have now left component reuse and entered recursive application territory.

Lucifer returned.

> "Can the landing page contain the portfolio?"

"Yes."

> "Can the portfolio be served as its own site?"

"Yes."

> "Can they both be injected into another application?"

"Yes."

> "Can they contain each other?"

"Technically."

Lucifer stared at the architecture diagram.

> "You have built Russian nesting dolls with React and CI."

Finally, someone understood.

## Wu Wei-Driven Development

None of this began with:

> "I am going to create a static-site framework and composable UI platform."

That would have been suspicious.

It began with a vague concept:

> "This should be reusable."

Then I followed the next concrete requirement.

And the next one.

And the next one.

No business plan.

No market analysis.

No twelve-month framework roadmap.

Just continuous removal of whatever friction appeared directly in front of me.

Eventually, I looked up and discovered that the path of least resistance had somehow passed through:

- package publishing;
- build orchestration;
- runtime injection;
- structured-data composition;
- static-site generation;
- deployment assembly;
- and recursive UI architecture.

Wu wei, apparently.

Effortless action.

Except for all the tests.

## Then There Is AI

People can continue arguing about whether AI writes "real code."

I do not care.

Doing this without AI would have taken months.

Not because AI invented the original concept.

It did not notice the reuse opportunity.

It did not decide which boundaries mattered.

It did not wake up one morning and demand a recursive SubZeroDev UI platform.

That particular failure of restraint was mine.

What AI changed was the cost of following the idea.

The loop became:

```text
idea
→ contract
→ implementation
→ tests
→ real consumer
→ abstraction breaks
→ abstraction improves
→ release
→ somehow another product
```

Without AI, enormous amounts of time would have disappeared into repetitive implementation, tooling, test scaffolding, debugging, integration, and deployment work.

Eventually, the cost would have forced the exploration to stop.

With AI, I could keep asking:

> "Well... why not?"

Unfortunately, the AI kept answering.

## Current Situation

I wanted a reusable landing-page gadget.

I now appear to have:

- a reusable static-site application framework;
- a repository-driven publishing mode;
- a custom React application host;
- a build and deployment toolchain;
- an upcoming reusable Portfolio module;
- the beginnings of a composable dashboard system;
- and UI packages capable of operating as components, applications, hosts, children, or standalone sites.

This was not the plan.

There was no plan.

The abstraction simply kept walking until it found architecture.

Lucifer closed the repository.

> "What happens when the platform hosts the dashboard that edits the configuration used to build the platform?"

I opened a new issue.

Because apparently nobody has learned anything.
