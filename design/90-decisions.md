# Decision log

Append-only. Newest at the top. The rejected alternatives are the point — without them, every future session relitigates the same choice.

`MILESTONES.md` is the delivery roadmap for the repository as a whole. This log records choices made *within* a design cycle. They are different documents at different scopes; do not merge them.

## Open
<Things noticed mid-slice that were deliberately not acted on. `/track` turns each into a GitHub issue and removes it from here. An item that is a *decision* rather than a *todo* belongs below as an entry, not in an issue.>

---

### 2026-08-04 — Kit catch-up install; the resolve-carve-out sentence does not apply here
Context: The 2026-08-03 install captured the kit through commit `da5d1f7`. Re-running it to catch up to `dcd0d8f` (five commits: human-first issues, fenced agent blocks, stable criterion ids, `/verify`/`/pr`/`/resolve`, and a new `AGENTS.md` sentence — "resolving or replying to a review thread is not carved out, the issue-opening exception covers nothing else"). Everything else copied over cleanly, additive, with no target content lost.
Chosen: Add the three new commands, the two issue templates, and the missing `AGENTS.md`/command-file content. Skip the resolve-carve-out sentence specifically: it contradicts the standing decision above — this repository already delegates thread resolution to the agent as a standing, non-gated step in the auto-merge pipeline (`AGENTS.md`, *Git and pull requests*, "After a validated fix directly satisfies a review thread, resolve that thread"). Per the installer's own rule, the target's existing rule wins on a same-subject conflict.
Rejected: **Add the kit sentence anyway, softened to note the exception** — rejected because a hedged version of a rule this repository has already deliberately inverted just relitigates the auto-merge decision in a second place.
Reversibility: cheap

### 2026-08-04 — Adopted the kit's new agent.md lesson on flaky-test fixes
Context: The kit's seed gained "a fix that only changed the odds is not a fix" (intermittent failure traced to a stale connection-pool schema snapshot, found by a tight repro loop rather than trusting reduced test parallelism) since this repository's `agent.md` was last reconciled. Per the installer, a maintained `agent.md` wins wholesale and new kit lessons are offered individually, not merged in bulk.
Chosen: Add it. It is a general flaky-test lesson, not stack-specific, and this repository's `tools/blog-mcp` vitest suite is exactly the kind of surface it applies to.
Rejected: **Skip it** — the lesson wasn't earned in this repository, and every kept lesson is a permanent context cost; rejected because the lesson is generic enough to be worth that cost regardless of where it was earned.
Reversibility: cheap

### 2026-08-03 — Auto-merge stays; the kit's external-writes rule is scoped around it
Context: Installing the agent kit. The kit requires explicit authorization before merging or deploying. This repository instructs the opposite in eight places — open a ready pull request and enable automatic squash merge, with a draft only on explicit request — so an agent ships to GitHub Pages without a human gate by standing policy. Both rules cannot sit in one file.
Chosen: This repository's practice wins, as the installer requires. The kit's external-writes rule installs with merge and deploy carved out, and the carve-out says *why*: the gate here is the two required checks plus conversation resolution, enforced by branch protection, not a human reading the diff. Stated explicitly so a future reader does not "correct" it back.
Rejected: **Adopt the kit's rule and drop auto-merge** — puts a human between an agent and a live site, and matches the sibling engine repository; rejected because 100+ merged pull requests and the whole `tools/blog-mcp` publishing pipeline are built around auto-merge, and the required checks are the real gate. **Split by change type** — auto-merge for posts, authorization for code; already half-present in the existing wording, but a conditional rule is the one an agent misapplies under pressure.
Reversibility: cheap

### 2026-08-03 — The full design chain installs; `MILESTONES.md` stays the roadmap
Context: `design/` was free — no `plans/`, no `adr/`. `tools/blog-mcp` is 132 files of TypeScript with no contract document, which is the clearest candidate in the repository for one. `MILESTONES.md` is 39 KB of milestones carrying acceptance criteria, which looks like an overlap with `design/30-slices.md`.
Chosen: All five design documents install. `MILESTONES.md` remains the repository-wide delivery roadmap; `design/30-slices.md` holds vertical slices for a single design cycle. The distinction is recorded in `AGENTS.md` and at the top of this file.
Rejected: **Map `30-slices.md` onto `MILESTONES.md`** — avoids two documents that both list work with acceptance criteria, but milestones are delivery phases, not runnable vertical slices, so `/slices` and `/slice` would be writing into a document with the wrong shape. **Skip `design/` until a real design cycle starts** — least clutter, but `/design` and `/contract` then have nowhere to write and arrive inert.
Reversibility: cheap

### 2026-08-03 — Three homes for agent procedures, documented rather than merged
Context: Installing `.claude/commands/` created a third place procedures live, alongside `.agents/workflows/` (2 files, 25 KB) and `AGENT-SETUP.md` (23.6 KB, referenced by nothing).
Chosen: They coexist and `AGENTS.md` carries a table saying which is which — the design pipeline, blog publishing, one-time bootstrap. `AGENT-SETUP.md` is marked non-authoritative unless explicitly invoked, which is the fix for the orphan regardless of the rest.
Rejected: **Fold `.agents/workflows/` into `.claude/commands/`** — one home, discoverable as slash commands; rejected as a real migration whose path is cited from `AGENTS.md` today, and the two sets serve different jobs. **Install and leave the others alone** — smallest change, but leaves a fresh agent three unexplained places to look and an orphan that reads as binding.
Reversibility: cheap
