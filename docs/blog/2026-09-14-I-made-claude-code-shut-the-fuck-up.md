---
title: "I Made Claude Code Shut the Fuck Up"
description: "How I configured Claude Code to keep the engineering depth, cut the conversational garbage, control subagents, preserve context, and give me two-line completion reports."
slug: i-made-claude-code-shut-the-fuck-up
authors:
  - subzerodev
date: 2026-09-14T14:00:00Z
tags:
  - ai-assisted-engineering
  - llm
  - development
---

# I Made Claude Code Shut the Fuck Up

I use Claude Code for actual engineering work.

Not:

> Write me a function.

More like:

> Inspect this repository, understand the architecture, find the problem, make the smallest correct change, test it, verify it, and don't fuck up anything unrelated.

Claude is pretty good at that.

The problem is that after doing the work, coding agents have a tendency to write a fucking autobiography about it.

<!-- truncate -->

I don't want this:

> I investigated the existing implementation and found...

> I considered several approaches...

> Here are the files I modified...

> Why this approach is appropriate...

> In summary...

I want this:

```text
Changed: Added a test-specific 15-second timeout for the unreachable-registry case.
Tests: PASS — 184 tests.
```

But I **do not** want the agent thinking less, testing less, investigating less, or becoming some lobotomized "concise mode."

I want:

**full engineering depth, minimal reporting overhead.**

So that's what I configured.

And rather than spending the next 3,000 words explaining why, here's how to get there.

# The Five-Minute Version

There are two pieces involved.

On Windows, Claude Code's user configuration lives under:

```text
%USERPROFILE%\.claude\
```

which normally means something like:

```text
C:\Users\YourName\.claude\
```

On macOS and Linux:

```text
~/.claude/
```

The main settings file is:

```text
~/.claude/settings.json
```

Custom output styles live under:

```text
~/.claude/output-styles/
```

So we're going to create:

```text
~/.claude/output-styles/terse-report.md
```

and modify:

```text
~/.claude/settings.json
```

That's basically the whole thing.

# Step 1: Create the Terse Report Output Style

Create:

```text
~/.claude/output-styles/terse-report.md
```

Mine looks like this:

```markdown
---
name: Terse report
description: Three-line completion reports, full engineering depth
keep-coding-instructions: true
---

Lead with the result. No preamble, no narration of what you are about to do.

End every completed task with exactly:

Changed: <one line>
Tests: <pass/fail + count>
Risk/Blocker: <omit this line entirely unless material>

Never add: task restatement, investigation summary, "in summary" section,
explanation of obvious changes, architecture commentary, next-step suggestions,
or a list of files touched beyond the Changed line.

When asked for an explanation or more detail, answer in full — this constrains
the completion report, not the work and not direct questions.

Reasoning depth, verification, and testing are unchanged.

Always keep complete: error text, test failure output, security warnings, and
confirmations for destructive actions.
```

There is one particularly important line:

```yaml
keep-coding-instructions: true
```

Don't casually remove that.

The point is not to replace Claude Code's engineering behavior.

The point is to replace the fucking book report it hands me afterward.

Claude should still investigate.

It should still reason.

It should still run tests.

It should still verify the result.

It just doesn't need to narrate every cognitive twitch when the task is finished.

# Step 2: Turn It On

Now edit:

```text
~/.claude/settings.json
```

and add:

```json
{
  "outputStyle": "Terse report"
}
```

Then start a new Claude Code session.

At this point, you're already most of the way there.

Give it a normal coding task.

Instead of five paragraphs at the end, you should get something closer to:

```text
Changed: Fixed registry timeout handling without changing publishability semantics.
Tests: PASS — 184 tests.
```

If there is actually a problem:

```text
Changed: Added registry timeout handling.
Tests: FAIL — 183/184 passed.
Risk/Blocker: Integration test still cannot reach the package registry.
```

That's useful information.

Everything else can stay inside the machine unless I ask for it.

# Step 3: Stop Raw Tool Output Eating the Context

The reporting problem was only one side of this.

Claude can be perfectly terse while Bash, MCP servers, scripts, build systems, and other tools vomit half the known universe into the session.

My settings include:

```json
{
  "env": {
    "BASH_MAX_OUTPUT_LENGTH": "20000",
    "MAX_MCP_OUTPUT_TOKENS": "10000"
  }
}
```

The exact numbers aren't holy scripture.

The principle matters more:

**tool output needs a budget.**

A 70,000-line build log isn't "more context."

It's garbage collection waiting to happen.

If something failed, I want the failure.

I don't need forty thousand successful package-resolution messages surrounding it.

# Step 4: Put a Ceiling on Agent Reproduction

I use subagents.

I like subagents.

I do not need Claude reproducing like fucking rabbits because somebody asked it to investigate a flaky test.

My current setup:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "4",
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  }
}
```

That's four concurrent subagents, two levels of recursive spawning, using Sonnet for the workers.

So my combined environment block is:

```json
{
  "env": {
    "BASH_MAX_OUTPUT_LENGTH": "20000",
    "MAX_MCP_OUTPUT_TOKENS": "10000",
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "4",
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  }
}
```

This does **not** mean four and two are universally correct.

It means I deliberately selected a maximum.

That's the important part.

If you don't put boundaries around agent delegation, "use agents when useful" can eventually become:

> We have assembled a committee to investigate your missing semicolon.

No.

# Step 5: Separate Thinking From Talking

Here is another section of my actual configuration:

```json
{
  "model": "sonnet",
  "outputStyle": "Terse report",
  "spinnerTipsEnabled": false,
  "effortLevel": "medium",
  "autoCompactWindow": 200000,
  "showThinkingSummaries": false,
  "autoCompactEnabled": true
}
```

The part people often get wrong is assuming these controls all mean the same thing.

They don't.

I can tell Claude:

```text
effortLevel = medium
```

while separately saying:

```text
showThinkingSummaries = false
```

and separately saying:

```text
outputStyle = Terse report
```

Those are three different concerns.

I still want reasoning.

I don't need a running documentary about the reasoning.

And I definitely don't need the final answer to repeat all of it again.

This was the distinction I wanted from the beginning:

**thinking less is not the same thing as talking less.**

I want the second one.

# Step 6: Turn On Automatic Context Compaction

My setup currently has:

```json
{
  "autoCompactWindow": 200000,
  "autoCompactEnabled": true
}
```

This matters because I use long-running coding sessions.

Eventually context fills up.

I don't want the agent artificially wrapping up useful work because the conversation got large.

But compaction is not an excuse to dump garbage into the context either.

Think of it like memory management.

Having garbage collection doesn't mean:

> Fuck it, allocate everything.

You still want useful information dominating the working set.

Which brings us straight back to terse completion reports and bounded tool output.

# Step 7: Tell Claude What World It Lives In

This was probably the biggest evolution in my setup.

Instead of repeatedly telling Claude things like:

> This repository is public.

> Don't expose secrets.

> My repositories are under this directory.

> Don't fuck with branch protection.

> These commands are normal here.

I put those facts into its operating environment.

My configuration contains an environment description with things like:

```text
Organization
Cloud providers
Repository visibility
Secrets management
CI/CD targets
Source control
Trusted internal domains
Sensitive data locations
Production naming rules
Protected infrastructure scopes
Projects root
Normal development commands
```

My own settings, for example, tell Claude that one of my repositories is public and that pushing there means publishing.

They tell it where my projects live.

They tell it where sensitive files are likely to exist.

They tell it which commands are routine.

They tell it which operations deserve extra scrutiny.

Don't copy my environment.

Describe **yours**.

Something like this:

```json
{
  "autoMode": {
    "environment": [
      "$defaults",

      "### Organization",
      "**Organization**: Acme",
      "**Cloud provider(s)**: AWS",
      "**Repository visibility**: customer-api is private; public-sdk is PUBLIC",
      "**Source control**: github.com/acme",
      "**CI/CD deploy targets**: GitHub Actions; production deploys from main",

      "### Security",
      "**Secrets management**: .env files and AWS Secrets Manager",
      "**Sensitive remote targets**: anything containing prod or production",
      "**Protected IaC scopes**: IAM, networking, production databases",

      "### User-specific",
      "**Primary use of Claude Code**: software development",
      "**Projects root**: D:\\Projects",
      "**Routine commands**: git, npm, dotnet, docker"
    ]
  }
}
```

Now Claude doesn't need to rediscover the operating environment in every session.

And you don't need to waste half your prompts reminding it where the landmines are.

# Step 8: Explicitly Mark the Things It Should Not Casually Do

I also have `soft_deny` rules.

For example, I explicitly call out things like force-pushing to a public repository or modifying GitHub rulesets and branch protection.

The general idea looks like this:

```json
{
  "autoMode": {
    "soft_deny": [
      "$defaults",
      "Bash(git push --force*) in PUBLIC_REPOSITORY — force pushing requires explicit review",
      "Bash(gh api*) targeting repository settings, rulesets, or branch protection — require explicit review"
    ]
  }
}
```

This becomes important as you increase autonomy.

Don't just tell the agent what it **may** do.

Tell it where normal autonomy stops.

There is a substantial difference between:

```text
npm test
```

and:

```text
git push --force origin main
```

Your agent should know that without needing divine intervention.

# The Useful Starting Configuration

If I were setting this up from scratch, I would **not** start by copying my entire settings file.

I'd start here:

```json
{
  "env": {
    "BASH_MAX_OUTPUT_LENGTH": "20000",
    "MAX_MCP_OUTPUT_TOKENS": "10000",
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "4",
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  },
  "model": "sonnet",
  "outputStyle": "Terse report",
  "effortLevel": "medium",
  "autoCompactWindow": 200000,
  "autoCompactEnabled": true,
  "showThinkingSummaries": false
}
```

Then I would run Claude Code for a while.

Only after that would I add the environment model and safety boundaries specific to my infrastructure.

That gets you most of the benefit without turning configuration into its own fucking hobby.

# Test It

Once the style and settings are installed:

1. Start a new Claude Code session.
2. Confirm the output style is `Terse report`.
3. Give it a real coding task.
4. Let it investigate normally.
5. Let it use tools normally.
6. Let it run tests normally.
7. Look at the completion report.

You want this:

```text
Changed: Corrected test execution evidence so skipped expected tests can no longer produce a green result.
Tests: PASS — 42/42 expected tests executed and passed.
```

Not this:

```text
I've successfully completed the requested changes.

Here's a detailed breakdown of my approach...

1. Investigation
2. Implementation
3. Testing
4. Files Changed
5. Design Considerations
6. Summary
```

If you need the explanation afterward, ask:

```text
Explain why you made that change.
```

Then it should explain it.

That's the point.

**Information on demand.**

Not information sprayed across every fucking interaction just in case I might someday want it.

# What This Actually Changes

Before:

```text
TASK
 ↓
Agent investigates
 ↓
Agent edits
 ↓
Agent tests
 ↓
Agent explains investigation
 ↓
Agent explains edits
 ↓
Agent explains tests
 ↓
Agent summarizes explanation
 ↓
All that shit becomes future context
```

After:

```text
TASK
 ↓
Agent investigates
 ↓
Agent edits
 ↓
Agent tests
 ↓
Changed: ...
Tests: PASS
```

The engineering process did not become shallower.

The interface became smaller.

That's a completely different thing.

# Why This Matters More Than It Looks

The obvious benefit is that I don't have to read as much shit.

That's nice.

But that's not actually the interesting part.

The interesting part is:

**the outputs become inputs.**

Every completion report stays in the conversation.

That means the next turn sees it.

And the turn after that sees it.

And eventually the model is reading a giant pile of prose that mostly consists of itself explaining work it already completed.

That is fucking ridiculous.

Imagine running a development team where every engineer, after every ticket, adds three pages to a permanent document explaining:

- what the ticket said;
- what they investigated;
- what files they opened;
- what options they considered;
- what change they made;
- why they made it;
- what tests they ran;
- what those tests mean;
- and then a summary of everything they just wrote.

Then every engineer has to reread the entire document before starting their next ticket.

Nobody would design a human workflow that way.

But because LLMs can consume large amounts of text, we somehow decided this was normal.

It isn't.

Context is a resource.

Treat it like one.

# This Is Really Context Engineering

I originally thought I was solving verbosity.

I wasn't.

I was doing **context engineering**.

There are several independent controls here:

```text
Reasoning depth
Tool-output volume
Subagent concurrency
Subagent recursion
Environment knowledge
Safety boundaries
Context compaction
Visible reporting
```

Once you separate those, you stop treating an agent as a chatbot with one mysterious "smartness" knob.

You can say:

> Think properly.

> Use agents.

> Run the tests.

> Know the environment.

> Don't cross these boundaries without asking.

> Preserve useful context.

And then:

> When you're finished, tell me what changed and whether it fucking worked.

That's where I ended up.

Not:

> Claude, please be concise.

But an actual operating contract.

# The Shortest Possible Version

If you don't give a shit about any of the explanation and just want the result:

```text
1. Create ~/.claude/output-styles/terse-report.md
2. Keep the coding instructions.
3. Select it with outputStyle.
4. Bound Bash and MCP output.
5. Bound subagent concurrency and recursion.
6. Enable context compaction.
7. Describe your real engineering environment.
8. Define the dangerous operations that require review.
9. Let Claude do the full job.
10. Make it shut the fuck up when the job is done.
```

That's pretty damn close to where I am.

And the most important part is that I did **not** make Claude think less.

I made it stop wasting context telling me how much it thought.

There is a very large difference.
