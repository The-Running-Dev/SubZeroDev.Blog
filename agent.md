# Agent — lessons learned

Retrospective notes for whoever (human or agent) works this repo next. Standing
*instructions* live in [`AGENTS.md`](AGENTS.md); *decisions* live in
`design/90-decisions.md`. This file is what was learned the hard way.

Keep it short — it loads into context, so length is a recurring cost. **Add a lesson only
when it would have changed a decision.** A lesson with no cost attached is a preference,
and preferences belong in `AGENTS.md`.

> **Everything below is inherited, not earned here.** It came from sibling repositories
> during the agent-kit install, pruned to what can apply to a Docusaurus site with a
> TypeScript MCP server, CI, and vitest — but no Prettier. Delete any that turn out not to
> apply; add the ones that actually cost something here.

---

## Drift

- **Editing from a diff accumulates drift that only a full read catches.** After many small
  edits, or at a phase boundary, reread the complete affected document set. One full-read
  pass over a sibling spec set found twelve inconsistencies, including a functional bug where
  a derived-path list omitted a field.
- **Search the concept, not the phrasing you just edited.** Striking a requirement from seven
  places, a grep for the exact removed phrase returned clean — it could not match the same
  requirement worded differently, and six stale statements survived a check reported as
  thorough. **Removals are where this bites**: a bad edit contradicts something visibly, a
  missed removal is silent.
- **When a document states a number, count the list.** "All eight operations" against a
  nine-row table survived two full review passes in a sibling repo. Re-count; never
  increment. `MILESTONES.md` is 39 KB of numbered milestones and is exactly this hazard.
- **When a type or public behaviour changes, audit everything downstream of it** — the prose
  description, every example, the generated representation, the tool's own README, and the
  test list. In this repository that means `tools/blog-mcp/` and the documentation that
  describes what its tools do.
- **A stale cross-reference is invisible.** Section numbers rot silently when a document is
  restructured. `build/Test-Documentation.ps1` catches authored links and anchors; the
  production build catches routes. Neither catches a sentence that is merely now untrue.

## Verification

- **Check documentation against the tree, not against other documentation.** A page in a
  sibling repo described a file that had never existed in git history; it had been checked
  against neighbouring docs, which agreed with it.
- **Pull the real artifact before reasoning about it.** Guessing how two builds interact
  cost a sibling repo a wrong conclusion that a single `docker pull` and one real build
  settled.
- **Verify a regression test by reverting the fix.** A test that passes with and without the
  fix guards nothing. `tools/blog-mcp` runs vitest, so this is cheap here.
- **A fix that only changed the odds is not a fix.** An intermittent failure went away when
  test parallelism was disabled — three consecutive clean runs — and came back on the fourth.
  The real cause was connection pooling handing out a stale schema snapshot, found by a tight
  single-threaded loop that reproduced it on iteration zero. **Cost: a wrong diagnosis that
  looked right, plus the repro loop to overturn it.** When a fix is "it stopped failing",
  suspect the odds moved rather than the cause, and say over how many runs. Applies directly to
  `tools/blog-mcp`'s vitest suite.
- **Never state or imply a published URL until the deploy for that exact commit succeeds.**
  Already a hard rule in `AGENTS.md`; repeated here only as the reason `blog_verify_published_url`
  exists — the tool has no code path that returns a URL without a confirmed deploy, which is
  what makes the rule structural rather than a promise.

## Token economy

- **Skill and command prompts inject their whole instruction file** on invocation. Only
  invoke one you will actually use. This repository now has three homes for procedures —
  see `AGENTS.md` — so this matters more here than elsewhere.
- **Prefer targeted search and offset reads for routine work**; `MILESTONES.md` and
  `AGENT-SETUP.md` are tens of KB each. Full reads are for the drift pass, not for lookups.
- **Start a fresh session at phase boundaries.** `AGENTS.md`, this file, and the relevant
  documents re-prime a new session cheaply — which is the reason for keeping all three tight.
- **Knowledge-graph tooling is cheap on code and expensive on prose.** `tools/blog-mcp` is
  TypeScript and extracts structurally via AST with no model call; `docs/` is prose and does
  not. A full prose rebuild on a small corpus cost ~200K tokens elsewhere and found fewer
  issues than reading the documents did.

## Git, CI, and delivery

- **A broad `git add` has already nearly cost real work.** An ignore pattern would have made
  generated scripts invisible to `git add -A` — present locally, green locally, missing in
  CI, with nothing saying why. `blog_stage` enforces an explicit path allowlist rather than
  relying on the same discipline by hand.
- **After a squash merge, `git branch -d` reports the branch unmerged** because the squash
  commit shares no history with it. Confirm with `git diff <branch> main` returning empty,
  then delete. This repository squash-merges by default, so it applies every time.
- **A required status check that never runs blocks the pull request permanently.** The
  saving on a skipped run is not worth a check that silently never reports — this is why
  `docs-ci.yml` carries no `paths:` filter.
- **A CI job can never be granted more permission than its workflow declares.** `docs-ci.yml`
  and `docs-deploy.yml` stay two files for this reason: folding them together would hand the
  gate and build jobs credentials they never use.

## Rendering and encoding

- **A diff cannot show a rendering bug.** Markdown joins consecutive lines, so a metadata
  field or blockquote label needs a **blank line** after it — never trailing double-spaces,
  which `git diff --check` rejects. Render before merging a document change.
- **Imported Markdown arrives CP1252 often enough to check for it** — mojibake em-dashes and
  arrows. Rewrite to UTF-8 on import.

## Naming and scope

- **Published slugs are permanent public routes.** Already a rule in `AGENTS.md`; the lesson
  is that it constrains *naming* at authoring time, not just editing. A slug chosen carelessly
  is a compatibility route forever.
- **Name things after structure, not flavour.** A sibling kind was nearly named for its genre,
  which would have licensed a new one per theme. Theme words smuggle in decisions.
