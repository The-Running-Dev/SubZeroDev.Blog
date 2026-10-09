---
title: "I Made Codex Shut the Fuck Up Too"
description: "How I configured Codex to keep the engineering depth, shrink tool and skill overhead, control subagents, compact context, and stop turning every completion into a retrospective."
slug: i-made-codex-shut-the-fuck-up-too
authors:
  - subzerodev
date: 2026-09-22T14:00:00Z
tags:
  - ai-assisted-engineering
  - llm
  - development
---

# I Made Codex Shut the Fuck Up Too

I already made Claude Code shut the fuck up.

Then I looked at Codex.

Same job.

Different knobs.

The goal is still not:

> Make the coding agent stupid enough to fit inside a fortune cookie.

The goal is:

> Keep the engineering depth. Stop wasting the context window explaining the engineering depth back to me.

<!-- truncate -->

Codex should still inspect the repository.

It should still understand the contract.

It should still make the change, run the tests, catch the failure, and avoid detonating everything unrelated.

I just don't need it to follow that with a twelve-part oral history of the afternoon.

So I configured the same separation I wanted from Claude:

```text
Think properly.
Use tools deliberately.
Keep the useful evidence.
Throw away the noise.
Tell me what happened.
Then stop.
```

# The Five-Minute Version

Codex keeps its user configuration here:

```text
~/.codex/config.toml
```

On Windows, that normally means:

```text
C:\Users\YourName\.codex\config.toml
```

The important settings are these:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "medium"
model_verbosity = "low"
model_reasoning_summary = "none"

tool_output_token_limit = 3000
model_auto_compact_token_limit = 100000
model_auto_compact_token_limit_scope = "total"

[skills]
max_context_tokens = 4000

[agents]
enabled = true
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 4
```

That gets most of the way there.

The rest is removing tools you don't use and putting your actual engineering rules in `AGENTS.md`.

Not forty pages of motivational prose.

Rules.

# Step 1: Separate Thinking From Talking

This is the most important part of the entire configuration:

```toml
model_reasoning_effort = "medium"
model_verbosity = "low"
model_reasoning_summary = "none"
```

Those are not three spellings of the same setting.

They control three different things.

```text
model_reasoning_effort
    How much work the model does on the problem.

model_verbosity
    How much prose it tends to produce in the answer.

model_reasoning_summary
    Whether it emits a summary of the reasoning process.
```

My first instinct was to set reasoning to `low` because I wanted economical sessions.

That was the wrong lever.

Low reasoning doesn't merely make Codex quieter.

It can make Codex think less.

That is not what I wanted.

I want the model to notice that the innocent-looking field is part of a public contract. I want it to find the test that proves the behavior. I want it to realize that the obvious fix breaks batch invariance three layers away.

I don't want it to spend another six paragraphs congratulating itself for noticing.

So the useful combination is:

```text
medium reasoning
low verbosity
no reasoning summary
```

That is the Codex version of:

> Do the full job. Give me the small report.

# Step 2: Stop Tool Output Becoming Permanent Furniture

The agent's own prose is not the only thing eating the context window.

Tools are often worse.

A build system can produce ten thousand lines explaining that nine thousand nine hundred and ninety-eight things worked before placing the actual failure at the bottom.

An MCP server can return an entire object graph when I needed one field.

A repository scan can lovingly enumerate every `node_modules` file known to mankind.

Codex has a direct limit for how much of each tool result stays in history:

```toml
tool_output_token_limit = 3000
```

The exact number isn't holy scripture.

Mine used to be `6000`.

That still allowed every noisy tool call to leave a six-thousand-token corpse in the conversation.

Three thousand is enough for useful errors, targeted search results, test summaries, and ordinary command output.

When a result is bigger than that, the answer is usually not:

> Wonderful. Preserve more of it forever.

The answer is:

> Narrow the command. Search the file. Read the relevant section. Save the full artifact outside the conversation if it actually matters.

Tool output needs a budget.

Otherwise the agent is concise while its machinery screams into the transcript.

# Step 3: Compact the Context You Actually Have

My Codex setup uses:

```toml
model_auto_compact_token_limit = 100000
model_auto_compact_token_limit_scope = "total"
```

Compaction lets a long-running session preserve the useful state without carrying every raw interaction forever.

The second line matters.

Codex can count either:

```text
total
```

or:

```text
body_after_prefix
```

`body_after_prefix` ignores the carried prefix when deciding whether the new body has reached the threshold.

That sounds efficient until your supposedly one-hundred-thousand-token session also has a large carried prefix, a large instruction stack, a skill catalog, tool schemas, and half the known history of your repository sitting in front of it.

I want the threshold to describe the actual active context.

So I use:

```toml
model_auto_compact_token_limit_scope = "total"
```

Again, compaction is not permission to generate garbage.

Garbage collection is useful.

Producing less garbage is better.

# Step 4: Stop Loading a Tool Shed for Every Screw

This is where Codex has a particularly interesting form of context waste.

The cost isn't only tool **output**.

There is also tool **availability**.

Every enabled plugin, MCP server, connector, and skill may bring names, descriptions, schemas, and instructions into the environment.

That means you can waste context before the first useful action happens.

My configuration had all of these at once:

```text
Browser plugin
Computer Use plugin
Unified Computer Use plugin
Playwright MCP
Filesystem MCP
OpenAI documentation MCP
GitHub MCP
Blog MCP
Node REPL MCP
```

Some are useful.

Some overlap.

Some are there because I used them once and then apparently decided they deserved permanent residency.

So I disabled the redundant ones without deleting their configuration:

```toml
[mcp_servers.playwright]
enabled = false

[mcp_servers.filesystem]
enabled = false

[mcp_servers.openaiDeveloperDocs]
enabled = false
```

Playwright is still available when I specifically need raw Playwright tools.

The filesystem MCP is still available when a workflow requires that interface.

The documentation server can come back for MCP testing.

They just don't all need to report for duty every time I ask Codex to change a sentence.

The same rule applies to plugins:

```toml
[plugins."pdf@openai-primary-runtime"]
enabled = false

[plugins."presentations@openai-primary-runtime"]
enabled = false

[plugins."template-creator@openai-primary-runtime"]
enabled = false
```

This is not minimalism as a personality disorder.

It is a working-set decision.

Load the capabilities that belong in your normal workflow.

Leave the rest installed but asleep.

# Step 5: Put a Budget on Skill Discovery

Codex can discover installed skills.

That is useful.

I have a lot of them.

That is less useful when their catalog starts behaving like the opening crawl of a very bureaucratic Star Wars film.

So I put a ceiling on the skill catalog:

```toml
[skills]
max_context_tokens = 4000
```

This does not limit the instructions inside a skill after Codex selects it.

It limits how much context the available-skills catalog gets to consume up front.

Four thousand is not a universal truth.

Set it too low and Codex may have trouble discovering the right skill.

Set it too high and every session begins with an encyclopedia of capabilities you aren't using.

The important thing is that the catalog has a budget at all.

# Step 6: Put a Ceiling on Agent Reproduction

I use subagents in Codex too.

They are useful for genuinely independent work:

```text
one agent inspects the implementation
one agent checks the tests
one agent audits the documentation contract
```

They are not useful when the primary agent delegates opening a file because delegation sounds sophisticated.

My configuration is:

```toml
[agents]
enabled = true
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 4
interrupt_message = true
```

That gives me a deliberate concurrency ceiling.

Codex does not currently give me the same direct recursion-depth switch I used in Claude Code.

So the behavioral half belongs in my agent instructions:

```markdown
Delegate only independent, substantial work.

Do not spawn agents for simple lookups, sequential work, or tasks the primary
agent can complete directly.

Subagents may not delegate unless explicitly requested.
```

Configuration sets the mechanical maximum.

Instructions define when delegation is appropriate.

You need both.

Otherwise a missing semicolon gets a steering committee and four workstreams.

# Step 7: Put the Environment in `AGENTS.md`

Claude Code gave me an environment block in its settings.

With Codex, I put durable engineering context in `AGENTS.md`.

That is where I describe things like:

```text
What the repository owns
What another repository owns
Which directories contain authored source
Which files are generated
Which commands validate the work
Which operations are destructive
Which public contracts must not drift
Where secrets may exist
When the agent must stop and ask
What a useful completion report contains
```

This prevents the agent from rediscovering the same world on every task.

But there is an obvious trap.

If `AGENTS.md` becomes a sixty-page constitution containing every lesson ever learned by anyone, you have replaced rediscovery with mandatory rereading.

That is not context engineering.

That is context hoarding with headings.

Put stable facts and enforceable rules there.

Move detailed procedures into skills or workflow files that are loaded only when relevant.

Delete advice that no longer changes behavior.

The best instruction is not the most eloquent one.

It is the shortest instruction that reliably prevents the expensive mistake.

# Step 8: Keep Secrets Out of the Configuration

This one is less about token economy and more about not doing something catastrophically stupid while optimizing token economy.

An HTTP MCP server can use:

```toml
bearer_token_env_var = "SUBZERODEV_BLOG_MCP_TOKEN"
```

That value is the **name of an environment variable**.

It is not the bearer token.

The actual secret belongs in the environment or a proper secret store.

Not in `config.toml`.

Not in the repository.

Not in the blog post where you proudly explain your configuration to the internet.

If you accidentally put a real token in that field, rotate it.

Do not rename it `EXAMPLE_TOKEN` and hope the universe respects the edit history.

# Step 9: Understand the Autonomy Settings Before Copying Them

My machine is configured for a highly autonomous local workflow:

```toml
sandbox_mode = "danger-full-access"
approval_policy = "never"

[windows]
sandbox = "elevated"
```

Do not copy that because it appeared in a code block on the internet.

Those settings mean what they look like they mean.

They are appropriate only when the surrounding environment, repository rules, hooks, backups, and personal tolerance for consequences make them appropriate.

Token economy and autonomy are separate controls.

Reducing approval interruptions does not reduce context safely by magic.

It increases what the agent may do without stopping.

If you want the economical settings without the autonomy, use the normal sandbox and approval defaults.

The useful lesson is not:

> Turn off all the guardrails.

It is:

> Know which setting controls conversation cost and which setting controls blast radius.

Those should never be confused.

# The Useful Starting Configuration

If I were starting from scratch, I would use this:

```toml
# ~/.codex/config.toml

model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "medium"
model_verbosity = "low"
model_reasoning_summary = "none"
service_tier = "default"

tool_output_token_limit = 3000
model_auto_compact_token_limit = 100000
model_auto_compact_token_limit_scope = "total"

[skills]
max_context_tokens = 4000

[agents]
enabled = true
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 4
interrupt_message = true
```

Then I would:

1. Disable MCP servers I don't use routinely.
2. Disable plugins I don't need in ordinary coding sessions.
3. Put stable repository facts in `AGENTS.md`.
4. Put detailed procedures in skills that load only when relevant.
5. Run real work for a while before tuning the thresholds again.

That gets most of the benefit without turning `config.toml` into another software product you now have to maintain.

# Test It

Start a new Codex task after changing the configuration.

Give it a real engineering job.

Not:

> Say hello.

Something that requires repository inspection, an edit, and verification.

Then look for four things.

First, did it still do enough reasoning to understand the task?

Second, did it retain the important failure output without keeping the entire build log?

Third, did it use subagents only when the work was actually parallel?

Fourth, was the completion report useful and short?

You want:

```text
Changed: Corrected timeout classification without changing retry semantics.
Tests: PASS — 184 tests.
```

You do not want:

```text
I have successfully completed the requested task.

First, I examined the repository structure...

Then, I identified several possible approaches...

Here is a detailed breakdown of the implementation...

In summary...
```

If you need the explanation, ask for it.

That is still the entire point:

**information on demand.**

Not information sprayed into permanent context because the agent was afraid silence might look unhelpful.

# What This Actually Changes

Before:

```text
TASK
 ↓
Large instruction prefix
 ↓
Every installed tool introduces itself
 ↓
Agent investigates
 ↓
Tool dumps full output
 ↓
Subagents multiply
 ↓
Agent edits
 ↓
Agent tests
 ↓
Agent explains everything twice
 ↓
All of it becomes the next turn's input
```

After:

```text
TASK
 ↓
Relevant instructions and tools
 ↓
Agent investigates
 ↓
Bounded evidence
 ↓
Agent edits
 ↓
Agent tests
 ↓
Changed: ...
Tests: PASS
```

The engineering process did not become shallower.

The working set became smaller.

That distinction matters.

# Why This Matters More Than It Looks

Every unnecessary output becomes future input.

Every giant tool result becomes something the model has to navigate around later.

Every unused tool schema competes with the code and instructions that actually matter.

Every verbose completion report gets carried into the next task, where it becomes a historical document nobody asked to preserve.

Then the context fills.

Then compaction runs.

Then useful details are compressed alongside a mountain of ceremonial prose.

Then people conclude that long-running agents are unreliable.

Some of that unreliability is unavoidable.

Some of it is self-inflicted.

If the conversation contains the repository contract, the relevant code, the failure, the change, and the test result, that is useful context.

If it also contains six versions of the agent explaining that it carefully considered the repository contract, that is decorative sediment.

Context is a resource.

Tool schemas consume it.

Tool output consumes it.

Instructions consume it.

Reports consume it.

Treat all four like they cost something.

Because they fucking do.

# This Is Still Context Engineering

The Claude configuration and the Codex configuration do not have identical switches.

They do have the same conceptual controls:

```text
Reasoning depth
Visible verbosity
Reasoning summaries
Tool-output retention
Tool-catalog size
Skill-catalog size
Subagent concurrency
Delegation policy
Environment knowledge
Safety boundaries
Context compaction
```

Once those are separate, the agent stops being one mysterious slider labeled `SMART`.

I can say:

> Think at medium depth.

> Speak briefly.

> Don't narrate the reasoning.

> Keep three thousand tokens of each tool result.

> Compact the total context at one hundred thousand.

> Load the capabilities I actually use.

> Use no more than four subagents.

> Follow the repository contract.

> Tell me what changed and whether it worked.

Those are different instructions because they solve different problems.

The mistake is trying to solve all of them with:

> Be concise.

That is not configuration.

That is a wish.

# The Shortest Possible Version

If you don't give a shit about the explanation and just want the result:

```text
1. Open ~/.codex/config.toml.
2. Keep reasoning at medium.
3. Set verbosity to low.
4. Disable reasoning summaries.
5. Bound retained tool output.
6. Compact against the total active context.
7. Cap the skill catalog.
8. Disable MCP servers and plugins you don't routinely use.
9. Bound subagent concurrency and delegation.
10. Put stable environment rules in AGENTS.md.
11. Keep secrets in environment variables.
12. Let Codex do the full job.
13. Make it shut the fuck up when the job is done.
```

That is my Codex setup.

Not less engineering.

Less conversational exhaust.

There is a very large difference.
