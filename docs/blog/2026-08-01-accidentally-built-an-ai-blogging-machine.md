---
title: "I Accidentally Automated Myself Into Being a Blogger"
description: "I set out to make publishing easier. Somewhere along the way I accidentally built a fully automated AI-assisted publishing pipeline."
slug: accidentally-built-an-ai-blogging-machine
authors:
  - subzerodev
date: 2026-08-01T10:00:00Z
tags:
  - ai
  - development
  - automation
  - productivity
---

# I Accidentally Automated Myself Into Being a Blogger

<!-- truncate -->

Lucifer was staring at my GitHub activity.

Again.

He wasn't angry.

He looked...concerned.

> "Ben."

"Yeah?"

> "I thought you were building a game engine."

"I am."

> "Then why did you spend half the week building a blogging platform?"

"So I could write about building the game engine."

Lucifer nodded slowly.

> "Reasonable."

He paused.

> "Why did you then build an API for the blogging platform?"

"So I don't have to open GitHub."

> "Naturally."

Another pause.

> "Then why did you build an MCP server?"

"So AI can publish the blog."

Lucifer pinched the bridge of his nose.

> "Of course."

---

## It Started Innocently

Like all dangerous projects.

I wanted a blog.

Not WordPress.

Not Medium.

Not some SaaS that decides next Tuesday my account violates paragraph 14, subsection C.

Just Markdown.

Git.

GitHub.

Docusaurus.

Simple.

Write.

Commit.

Push.

Done.

---

## Then I Got Lazy

Opening GitHub is exhausting.

You have to...

- create a file;
- remember the naming convention;
- copy front matter;
- check tags;
- preview it;
- commit it;
- wait for CI;
- hope you didn't forget a colon somewhere.

This is at least **thirty-seven seconds** of completely unnecessary human involvement.

Unacceptable.

---

## Version Two

So naturally...

I built an API.

Now instead of opening GitHub...

I send Markdown.

API creates the file.

Done.

Lucifer watched quietly.

> "You're still writing the Markdown."

"Correct."

> "I don't like where this is going."

---

## Version Three

Now Claude and ChatGPT can generate the Markdown.

API publishes it.

CI builds it.

Cloudflare serves it.

Humans are becoming increasingly optional.

---

## Version Four

Then I thought...

> "Why does the AI need to call an API?"

That's ridiculous.

So...

I added an MCP server.

Now the AI can simply say:

> "Publish this."

The tooling figures out the rest.

Lucifer looked up toward Heaven.

> "Father..."

> "Yes?"

> "He's teaching the machines how to write documentation."

God smiled.

> "Excellent."

Lucifer frowned.

> "You don't sound worried."

---

## Then Something Weird Happened

I wrote a blog post.

ChatGPT converted it into my usual Lucifer voice.

Added Docusaurus front matter.

Generated the Markdown.

I pasted it into my repository.

Committed.

Pushed.

Thirty seconds later...

It was live.

On the public internet.

I sat there for a second.

Not because the AI wrote it.

That's almost expected now.

Because I realized...

**The writing wasn't the difficult part anymore.**

The entire pipeline had disappeared.

---

## The Real Project Was Never the Blog

The blog was just an excuse.

The real project became reducing friction.

First:

```
Idea
↓

Open editor
↓

Write
↓

Format
↓

Create file
↓

Copy front matter
↓

Commit
↓

Push
↓

Wait
↓

Publish
```

Now:

```
Idea
↓

Talk to AI
↓

Commit
↓

Done.
```

Soon it'll become:

```
Idea
↓

"Publish."
↓

Done.
```

---

## This Is the Interesting Part

Everyone keeps asking whether AI writes code.

Wrong question.

The interesting question is:

> **How many tiny pieces of friction can disappear?**

Every individual improvement saves almost nothing.

Five seconds here.

Thirty seconds there.

A minute somewhere else.

None of them matter.

Until one day...

You realize an idea became a published article before your coffee cooled down.

---

## The Funny Part

This whole thing has become self-reinforcing.

I build tools.

The tools help me build better tools.

Those tools help me write about the tools.

The blog documents the tools.

The documentation becomes instructions for AI.

The AI improves the tools.

Repeat.

It's a feedback loop powered almost entirely by curiosity.

Lucifer stared at the whiteboard.

There were arrows everywhere.

Boxes.

Containers.

Agents.

Discord webhooks.

GitHub Actions.

MCP servers.

Docker.

CI.

Blogs.

Notifications.

He looked at me.

> "Do you actually have a plan?"

I thought about it.

"Not really."

> "Then how did all this happen?"

I shrugged.

"It seemed like the next obvious step."

Lucifer sighed.

Then smiled.

> "I hate how often that works."

And somewhere in the distance...

Another side project was already being born.
