# Repository Guidelines

## Project identity and boundary

This repository owns the SubZeroDev Blog site at
`https://blog.subzerodev.com/`, its authored documentation, and its GitHub Pages
delivery configuration. It does not own the shared Docusaurus runtime; that is
provided by the immutable `ghcr.io/the-running-dev/docs-template` image.

The blog is published at the site root. Do not describe additional application
features as implemented until their source and validation exist here.

Lessons learned the hard way live in [`agent.md`](agent.md) — read it after this
file. [`CLAUDE.md`](CLAUDE.md) is a pointer to both, not a third copy.

### Where procedures live

Three directories hold agent-facing procedures. They do not overlap, and knowing
which is which saves reading all of them:

| Where | Holds | Authority |
|---|---|---|
| `.claude/commands/` | The design pipeline — `/brief-check`, `/design`, `/redteam`, `/contract`, `/slices`, `/slice`, `/reconcile`, `/make-human-docs`, `/install`, `/verify`, `/pr`, `/resolve` | Standing; run when invoked |
| `.agents/workflows/` | Blog publishing — `create-blog-post.md`, `publish-change.md` | Standing; `publish-change.md` holds the GraphQL review-thread query |
| `AGENT-SETUP.md` | One-time repository bootstrap | **Not standing execution authority.** Apply only when explicitly invoked. Nothing else references it |

## Safe start

Before editing:

1. Run `git status --short --branch`, `git remote -v`, and `rg --files`.
2. Read this file and the relevant source or documentation files completely.
3. Preserve unrelated work and never commit secrets, caches, or generated build
   output.
4. Work on a focused branch; do not force-push or rewrite published history.

## Task effort and model selection

Match capability and reasoning effort to the task, not to the tool used to
reach it. Use the smallest model and lowest reasoning effort that can still
produce production-quality output; reserve the strongest available model and
highest reasoning effort for genuinely ambiguous or architectural work.
Reasoning budget should scale with task complexity, not task size.

**Deep-reasoning tasks** — architecture, system design, specifications,
technical proposals, API design, complex debugging, root-cause analysis,
multi-step planning, large refactoring plans, comparing implementation
approaches, security analysis, performance strategy. Default to the highest
available reasoning effort; drop to a faster mode only when latency matters
more than cost.

**Implementation tasks** — writing code, implementing issues, tests,
refactoring, bug fixes, API and UI implementation, infrastructure code
(Docker, CI/CD, Terraform), SQL, and documentation tightly coupled to the
implementation. Use high reasoning effort for significant features, large
pull requests, difficult bugs, or complex refactors; use standard effort for
small fixes, review-comment responses, isolated functions, and repetitive or
mechanical generation. Avoid high effort when it adds no measurable value.

**High-volume tasks** — summaries, changelogs, commit messages, PR
descriptions, blog front matter, Markdown cleanup and formatting, issue
triage, documentation polishing, code explanation, log or tool-output
summarization, and notification or release-note drafting. Use the lightest
available model at default effort.

Escalate rather than guess: a high-volume task that surfaces an
architectural question moves to the implementation tier; an implementation
task that surfaces architectural uncertainty moves to the deep-reasoning
tier. Do not continue implementation while that uncertainty remains
unresolved.

**Never use `max` effort unless the user asks for it by name.** **`xhigh` is for
one question, not one phase** — running a whole design pass at `xhigh` is not
rigour, it is a substitute for asking a precise question. If the session is
*stronger* than the task needs, just proceed; do not interrupt to say so.

### Command routing

| Command | Tier |
|---|---|
| `/brief-check`, `/design`, `/contract`, `/slices` | Opus, high |
| `/redteam` | strongest model, **different vendor from the design author**; if it must be Claude, a fresh Opus session |
| `/slice` | Sonnet, medium — high for a large or difficult slice |
| `/reconcile` | Opus, high to decide which side of a drift is correct; Sonnet, medium to apply the edits |
| `/make-human-docs`, `/install`, `/track` | Sonnet, medium |
| `/verify` | Sonnet, medium — escalate to deep reasoning only to diagnose a failure, never to run the gates |
| `/pr` | Sonnet, medium |
| `/resolve` | Sonnet, medium — escalate to judge a contested finding, not to triage the obvious ones |
| `/refine` | Sonnet, medium — never escalates; an architectural ask is routed to the command that owns it, not refined |
| `/kit-help` | Haiku, low — orientation from file existence and a tracker listing; escalate only where the repository's state matches no stage |

The pipeline reads and writes `design/`. **`MILESTONES.md` is the delivery
roadmap for the repository as a whole; `design/30-slices.md` holds vertical
slices for a single design cycle.** Different scopes — do not merge them, and do
not let `/slices` write into `MILESTONES.md`.

### Session boundaries

Routing says which model runs a command. This says **when a session must end.** A
boundary exists wherever carrying context would corrupt the next step's
judgement, or wherever the next step must read the tree rather than remember it.
**The artifact is the handoff, not the conversation** — a stage that writes one
has already handed over everything the next stage is entitled to.

| Boundary | Rule | Why |
|---|---|---|
| `/design` → `/redteam` | **Fresh session, and a different vendor.** | A model recognises its own output distribution and defends it. Fresh context on the same model is already the weak form; the same session is not a review at all. |
| Any stage that writes an artifact → the next | Fresh. | The next stage's input is the committed file. A session that also remembers the arguments behind it will design against the arguments. |
| `/slices` → `/slice` | Fresh, and **one slice per session**. | A slice that does not fit one session without compaction is too large — that is a `/slices` defect, so say so rather than pressing on. |
| `/slice` → `/verify` → `/pr` → `/resolve` | **Same session.** | These act on the branch and worktree the slice just produced, and `/pr` must carry `/verify`'s did-not-run list into the description **verbatim**. A fresh session would restate it from a summary, which is the fabricated gate result verification exists to prevent. |
| merge → `/track` | Fresh. | `/track` reads the tracker and `design/` as they now stand. The session that just implemented the slice holds an opinion about whether it is done, and doneness is my mark, not an agent's. |
| implementation → `/reconcile` | Fresh. | It compares the tree against the docs. The session that wrote the code carries what it *intended* to write, which is the one thing the comparison must not be given. |

**Compaction is a boundary you did not choose.** If a session compacts mid-slice,
report it — the slice was mis-sized, and the work after the compaction was done
against a summary of the contract rather than the contract.

Publishing a post is not a design cycle and does not inherit this table.
`.agents/workflows/create-blog-post.md` and `publish-change.md` run end to end in
one session by design; the boundaries above govern the `design/` pipeline.

### Budget discipline

- Do not spend reasoning to manufacture findings, alternatives, or open
  questions. "None at this level" is a valid result.
- Once a decision is signed off and recorded, do not relitigate it without new
  evidence. Name the evidence if you think there is some.
- Spend frontier-model reasoning on decisions that are expensive to reverse, not
  on producing more prose.
- Never recommend re-running a phase gate. The user decides when a phase
  repeats; `/redteam` carries its own stopping rule.

### What should stop being model work

Routing decides *which* model does a job. This decides whether a model should be
doing it at all.

| | Work | Where it belongs |
|---|---|---|
| 🟢 **Necessary** | Architecture, contracts, root-cause analysis, design tradeoffs, adjudicating findings, writing a post | A model, at the tier above |
| 🟡 **Maybe avoidable** | Regenerating context already established, duplicate repository scans, rewriting boilerplate | A model, but the repetition is a signal — say so |
| 🔴 **Definitely avoidable** | Formatting, mechanical text transformation, arithmetic over files, counting, collecting metrics | Code. It should leave the model entirely |

**A red item is a defect in the tooling, not in the run.** Noticing one is worth a
line; performing it repeatedly and never saying so is the failure. When a red
item recurs, put it in `## Open` in `design/90-decisions.md` so `/track` can turn
it into an issue — that is the existing path, and there is no separate mechanism
for this. `tools/blog-mcp` is where this repository has already taken that route:
front-matter checks, duplicate-slug detection and published-URL verification are
red items that left the model entirely.

Two distinctions that are easy to get wrong:

- **The mechanical half of a task is red; the judgement half is not.** Opening an
  issue is an API call, but deciding what warrants one is not. Writing a PR
  description is a template, but which merge convention governs is not. Do not
  classify a whole command by its cheapest step.
- **Do not report a cost you did not measure.** A model is not given its own token
  counts or elapsed time, so any figure it states about its own run is an estimate
  presented as a measurement. `tools/Measure-Session.ps1` reads the real per-call
  usage from the session transcript, and runs as a `SessionEnd` hook. Use it, or
  say nothing.

### Tracking work

**Defer work to the tracker rather than processing it inline.** A finding, a follow-up, or a
defect noticed in passing goes to a GitHub issue, not into a running list in the conversation.

- `/track` is the only command that writes to GitHub. It opens an issue per slice in
  `design/30-slices.md` that lacks one — matching on title, open **and** closed, so a done
  slice is never reopened or duplicated — and an issue per bullet under `## Open` in
  `design/90-decisions.md`, removing the bullet once tracked.
- **This repository already has six issues and no milestone.** `/track` matches existing
  issues by title before opening anything; it does not touch the six that predate it unless
  one happens to share a slice's title.
- A milestone still needs sign-off before `/track` creates it. If a matching GitHub Project
  exists (named after this repository), `/track` adds issues to it; it never creates one.
- `design/30-slices.md` stays authoritative for what a slice *is*; its issue tracks whether it
  is *done*. `MILESTONES.md` is a different document at a different scope — see *Command
  routing*, above — and `/track` does not touch it.
- **Every issue reads human-first.** A narrative anyone can follow, then `### Done when`
  checkboxes, then the agent detail in a collapsed `<details>` block.
- **The agent block is fenced** by `<!-- agent:start -->` and `<!-- agent:end -->`. Inside the
  fence is regenerable; **outside it is never touched** — a ticked checkbox is progress someone
  recorded, an edited narrative is someone's deliberate wording.
- **Where a document already governs, the block points; where none does, it carries.** A slice
  names `design/30-slices.md § S<n> @ <sha>` and leaves procedure to `.claude/commands/slice.md`
  — copying stop conditions into an issue freezes a stale copy that nothing can go back and fix.
  A bug or a story has no upstream document, so its block legitimately holds the constraints.
- **Criteria carry stable ids** (`S3.1`), and drift is compared on ids, never prose. Reworded
  criteria are not drift; an added, removed, or renumbered id is.
- **Report drift, change neither side.** Which is wrong is my call.
- **Ticking a checkbox is mine, not yours.** An agent reporting "S3.1 met" and a ticked box are
  different claims by different parties. `/slice` ends by listing the ids it believes are met so
  ticking them is mechanical.
- **Bugs and stories are filed by hand** from `.github/ISSUE_TEMPLATE/`. `/track` does not open
  them.
- **This does not suspend one-at-a-time sign-off.** Findings are still presented for
  adjudication; the tracker is where the ones you accept go, not a way to skip the conversation.

## Single ownership

- **Reference, never restate.** A rule that lives in another document is linked,
  not copied. Two copies of a rule is a promise they will diverge and a
  guarantee nobody notices which is stale.
- **Move, never copy.** A rule has exactly one home. When it belongs somewhere
  else, move it and leave a reference behind.
- If a document genuinely must repeat something to stand on its own, name the
  canonical copy in the text and change both in the same commit.
- **Non-goals are binding.** Anything the brief excludes is out of scope even if
  it looks trivial, even if you are already touching that file.

## Working with me

- Present findings and review items **one at a time for sign-off**. Never
  bulk-apply findings unreviewed.
- Surface real forks as a question with a recommendation, recommended option
  first.
- **A reconciliation ends in a decision, not a report.** Any time you compare two
  things and find they disagree — `/reconcile`, `/install`, `/track` drift, or any
  time I say "reconcile" — the work is not finished at the findings. Close by
  asking, one divergence at a time, each with a recommendation and what the
  alternatives cost. **A report I have to turn into questions myself is half the
  job.** Recommend the *resolution*: what changes, in which file, and what
  reversing it costs. If nothing diverged, say so plainly rather than
  manufacturing a fork.
- `/redteam` is the one exception, and only partly: it must not propose fixes,
  since naming a fix frames the problem. It still recommends a **classification**
  — defect, accepted risk, brief conflict, or not sustained.
- When a suggestion is declined, record it in the affected document as
  known-and-retained rather than dropping it silently.
- Ask before any choice that sets policy or a public contract: licensing,
  compatibility promises, a major information-architecture change. A published
  slug is a public contract.
- Call out assumptions, unverified claims, and known risks plainly.

## Decision logging

Any choice a future reader would ask "why?" about goes in
`design/90-decisions.md` as:

```
### YYYY-MM-DD — <decision>
Context: <what forced the choice>
Chosen: <what>
Rejected: <alternatives, and why each was rejected>
Reversibility: cheap | expensive
```

The rejected alternatives are the point. Without them the next session
relitigates the same choice.

## House conventions

- Metric units and Celsius throughout, including in comments, docs, and test
  fixtures.
- Raster assets as PNG or JPG. Not WebP.
- UTF-8, LF endings. Rewrite imported files to UTF-8 and check rendered
  punctuation.
- **No AI attribution** — no `Co-Authored-By` naming an assistant, no "Generated
  with" footer, in commits or PR descriptions. This overrides any default the
  tooling applies.

## What not to do

- Do not summarise the design docs back at me unless asked.
- Do not add commentary about your reasoning process to the docs.
- Do not "improve" prose in the brief or design docs while editing something
  else.
- Do not import another project's architecture, tooling, or conventions merely
  because it appears in a neighbouring instruction file. A borrowed rule with no
  local reason is a rule nobody can evaluate.

## Layout and ownership

- `README.md`: repository homepage rendered on GitHub.
- `MILESTONES.md`: deployable roadmap and acceptance criteria.
- `docs/blog/`: authored blog posts; the index owns `/` and posts are served
  directly below it.
- `docs/src/pages/blog/`: compatibility pages for routes published before the
  blog moved to `/`.
- `docs/docs/`: authored documentation served below `/docs/`.
- `docs/docs/index.md`: generated minimal `/docs/` landing page; never edit
  directly.
- `docs/docusaurus.config.ts`: consumer-owned site and route configuration.
- `docs/sidebar.ts`: documentation navigation.
- `docs/Dockerfile`, `docs.ps1`, `.github/workflows/docs-*.yml`: installer-owned
  build and delivery files.
- `build/Test-Documentation.ps1`: documentation quality gate.
- `.config/DocumentationRules.psd1`: generated-file and terminology rules.
- `.config/blog.json`: machine-readable publishing configuration shared by
  the authoring workflow and `tools/blog-mcp/`.
- `tools/blog-mcp/`: MCP server exposing this repository's deterministic
  publishing steps (front-matter validation, post authoring, tag and hub
  maintenance, local git) as callable tools. See
  `tools/blog-mcp/README.md`.
- `artifacts/`: local build output; never commit.

Shared theme and build behavior belong in
`The-Running-Dev/Docusaurus-Template`. Keep this repository's changes limited
to its overlay, content, and configuration.

## Documentation workflow

The blog index owns `/`; authored documentation owns `/docs/`. The README is
the repository homepage and is not copied into the Docusaurus site.

Do not edit the generated docs index directly. Add authored pages under
`docs/docs/` with front matter and deterministic `sidebar_position` values.
Use absolute published links in the README.

Author blog posts under `docs/blog/` using a date-prefixed filename such as
`YYYY-MM-DD-slug.md`. Copy `docs/blog/_post-template.md` and replace every
placeholder. Include `title`, `description`, `slug`, `authors`, `date`, and one
or more keys from `docs/blog/tags.yml` in front matter. Do not add inline tags:
the production build rejects tags outside the controlled vocabulary. Preview
the route locally and ensure the post makes only claims supported by repository
source or cited material.

Published slugs are permanent public routes. Preserve an existing `slug` when
editing a post. If a route must move, add a compatibility route before changing
the slug and document both the old and canonical routes.

The docs system is installed and upgraded through the shared template's
supported `Invoke-SetupDocs` interface. Before upgrading, inspect the template
instructions, resolve the current container digest, dry-run the installer, and
update every immutable image reference together.

The installer-owned workflows carry one documented consumer-inserted step:
after each production build, `./build/Test-DocumentationArtifact.ps1` validates
this repository's route contract, which only this repository knows. Do not add
other manual edits to `.github/workflows/docs-*.yml`. If a template upgrade
regenerates those files, re-apply the validation step before merging.

README homepage generation is disabled because the blog owns `/`. Do not
restore `build/ConvertTo-DocumentationHomepage.ps1` or
`docs/src/pages/index.md` unless the route contract changes again.

## Validation

Run all checks that apply:

```powershell
./build/Test-Documentation.ps1
./docs.ps1 -BuildOnly
./build/Test-DocumentationArtifact.ps1
git diff --check
git status --short --branch
```

The production build requires Docker. If Docker is unavailable locally, do not
claim the build passed; verify the corresponding GitHub Actions check.

`tools/blog-mcp/` wraps the same checks (plus front-matter, duplicate-slug,
and content-hub validation that nothing else in this repository enforces) as
callable MCP tools, and carries its own build and test suite:

```bash
cd tools/blog-mcp
npm install
npm run build
npm test
```

These tools reuse `build/Test-Documentation.ps1` and
`build/Test-DocumentationArtifact.ps1` unmodified rather than
reimplementing them, so the two never drift apart. See
`tools/blog-mcp/README.md`.

## Git and pull requests

**External writes need authorization** — creating a remote repository, changing
visibility, changing a domain — with **two deliberate exceptions.**

> **Merging and deploying are delegated here, on purpose.** Sibling repositories
> require a human to merge; this one does not. The gate is the two required
> checks plus conversation resolution, enforced by branch protection, and
> `tools/blog-mcp` is built around it. This is a decision, not an oversight —
> see `design/90-decisions.md`. Do not "correct" it back without changing that
> entry.

> **Opening and labelling a GitHub issue also needs no per-instance approval.**
> Cheap and reversible, so `/track` does it without asking — see *Tracking
> work*, below. Closing an issue, editing anyone else's, and creating a
> milestone or a project all still need sign-off.

Use focused commits with concise conventional messages. After the applicable
local validation passes, open a ready pull request and enable automatic squash
merge against the exact validated head commit. Use a draft pull request only
when the user explicitly requests a hold, a draft, or no auto-merge.

Stage only files that belong to the change, named explicitly. Never run
`git add -A` or `git add .`: a broad add can silently sweep up unrelated
working-tree state. `tools/blog-mcp`'s `blog_stage` tool enforces this as an
explicit path allowlist rather than relying on the same discipline by hand.

For a post-only change, enable auto-merge immediately after publishing the PR.
For code, styling, configuration, or workflow changes, run any available
automated review and address valid findings before enabling auto-merge. Check
by review **thread**, not just requested reviewers: this repository has
`qodo-code-review` configured, and it leaves unresolved conversation threads
without appearing in `gh pr view --json reviewRequests,latestReviews` — that
check alone is not sufficient, since `required_conversation_resolution`
blocks the merge on those threads regardless. Query review threads via
`tools/blog-mcp`'s `blog_pr_comments` tool or the GraphQL `reviewThreads`
query in `.agents/workflows/publish-change.md`. Required PR checks are:

- `Documentation links and terminology`
- `Verify Documentation Build`

Do not require the merge-only deployment job. Enable GitHub auto-merge with
the allowed squash strategy and the exact validated head SHA; GitHub will merge
only after the required checks and conversation resolution pass. If the head
changes, revalidate it and enable auto-merge again with the new SHA. Protect
`main` with required pull requests, successful checks, conversation resolution,
and blocked force pushes and deletions.

After a validated fix directly satisfies a review thread, resolve that thread
so it cannot keep auto-merge blocked. Leave ambiguous findings unresolved and
report them instead.

After auto-merge is enabled, the agent must monitor the two required checks for
the exact head SHA and report their outcome. After merge, monitor the `Docs
Deploy` workflow for the resulting merge commit. For a new or changed blog
post, verify its canonical HTTPS route after deployment succeeds and report the
published URL. Do not claim a post is published when the deployment or route
verification failed.

**Hard rule:** never state or imply a published URL until the `Docs Deploy` run
for that exact merge commit shows `completed`/`success`. A merged PR is not a
deployed site. Poll the run status (`gh run list` / `gh run watch`) until it
finishes — do not estimate timing or report the URL "as good as done." When
`tools/blog-mcp` is available, `blog_verify_published_url` enforces this
structurally rather than relying on the rule being followed by hand: it has
no code path that returns a URL without a confirmed successful deploy. This
prose stays authoritative regardless — the rule must hold even when the tool
layer is unavailable.

## Completion checklist

- Public claims match source and current behavior.
- Authored links, anchors, and terminology pass the gate.
- The immutable docs image digest is consistent in all installer-owned files.
- Production docs build and deployment checks pass.
- `/`, `/welcome/`, `/docs/`, and representative authored routes work over
  HTTPS.
- The worktree is clean and local `main` matches `origin/main`.
