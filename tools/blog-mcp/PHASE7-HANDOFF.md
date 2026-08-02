# Handoff: Milestone 11 Phase 7 (final phase)

**Audience:** an agent picking this up with no memory of the prior work
(e.g. Codex). This document is self-contained — do not assume access to any
chat history that produced it. Everything you need to verify a claim is a
file path, a `git log` entry, or a PR number below.

**Task:** implement Phase 7, the last phase of Milestone 11 ("Publishing
integrity"), then close the milestone out.

## 1. Read these first, in order

1. `AGENTS.md` (repo root) — safe-start checklist, project boundary, model/
   effort guidance.
2. `tools/blog-mcp/TODO-NEXT.md` — the full milestone spec. Section 1-2 is
   the original incident; section 10 lists all seven phases with deliverables
   and acceptance criteria; section 13 is the milestone-wide definition of
   done; section 14 is explicit non-goals. Phase 7 itself is section 10,
   "Phase 7: end-to-end verification and documentation" (search for that
   heading).
3. `MILESTONES.md`, the `## Milestone 11: Publishing integrity — in progress`
   section (search for that heading) — the shipped-state narrative for
   Phases 1-6 and the interim bugfix, written after each merge. This is the
   most reliable record of what already exists; trust it over inference from
   code alone, though the code is of course the ground truth if the two ever
   disagree.
4. `.agents/workflows/publish-change.md` — the mandatory shipping workflow
   for this repo (branch → validate → commit → push → PR → review-thread
   check → auto-merge → wait for checks/merge/deploy). Follow it exactly for
   whatever you ship in this phase. It is a **code/configuration change**,
   not an editorial post — use the "Code, styling, configuration, and
   workflow changes" review lane in that document's section 3, not the
   post-only lane.

## 2. What is already merged (do not redo this)

Phases 1-6 plus an interim bugfix are merged to `main`. Phase 6 was
delivered out of numeric order, ahead of Phase 5, because a real incident
root-caused it — see the table below:

| Phase | PR | What it delivered |
| --- | --- | --- |
| 1 | [#90](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/90) | Regression fixtures (`it.fails()`) pinning all four original defects; `AuthorDefinition`/`TagDefinition`/`PostWriteResult` types; injectable `ToolContext.clock`. |
| 2 | [#92](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/92) | Atomic author/tag auto-creation (`src/domain/authors.ts`, `src/domain/tags.ts`, `src/domain/atomicWrite.ts`); new `blog_add_author`; `blog_create_post`/`blog_update_post` return the full `PostWriteResult` (`changedPaths`, `createdAuthors`, `createdTags`, `defaultAuthorUsed`). |
| 3 | [#93](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/93) | Canonical date service (`src/domain/dateService.ts`), env-configured via `BLOG_MCP_DATE_ORDER` / `BLOG_MCP_DEFAULT_TIME_ZONE`; Compose's client-side `Date.parse` deleted in favor of server-side normalization. |
| 4 | [#94](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/94) | `blog_prepare_publish_branch` (ancestry-preserving branch creation); `blog_commit` refuses on the base branch; `blog_sync_base({ ffOnly: true })` reports a refused fast-forward as a precondition, not a silent `ok:true`. |
| interim | [#95](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/95) | `knownAuthorsAndTags` helper: metadata auto-creation also consults `origin/<base>`'s copy of `authors.yml`/`tags.yml`, not just the local checkout, before deciding a key is unknown — fixed a real incident where a stale checkout recreated already-published tags/authors with placeholder data. |
| 6 | [#96](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/96) | `blog_reconcile_after_merge`; wired into the scheduler, a new watcher `pending-merges.json` store, and Compose's PR watcher. Delivered before Phase 5 because it directly root-caused the interim-bugfix incident. |
| 5 | [#97](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/97) | Compose, the watcher, and `/api/branch` migrated onto `blog_prepare_publish_branch` and `changedPaths`-based staging; Compose gained an author checklist and a metadata preview. |

`git log --oneline -- tools/blog-mcp` and `gh pr view <number>` are
authoritative if any of the above needs more detail than this table gives.

**Only Phase 7 remains.** Everything else in the milestone's definition of
done (section 13 of `TODO-NEXT.md`) is already satisfied by the merged
phases above — Phase 7 does not add new production behavior, it verifies and
documents what phases 1-6 built.

## 3. Phase 7 deliverables (from `TODO-NEXT.md` section 10)

1. **Container-level publish simulation** using a scratch remote and fake
   GitHub boundary.
2. **Operator documentation** for date policy, generated metadata, recovery,
   and branch reconciliation.
3. **Compatibility notes** for changed tool results and stricter failures.

Acceptance criteria (verbatim from the same section):

- package build and full test suite pass;
- repository documentation gates pass;
- representative create, retry, conflict, merge, restart, and reconciliation
  scenarios are covered;
- release notes identify any caller migration required by `changedPaths` and
  the protected-base commit rule.

## 4. Concrete gaps, confirmed by direct inspection

These are not guesses — each was checked against the current `main` before
writing this document, so you can start straight from the fix rather than
re-discovering the gap:

### 4.1 No cross-caller, container-level end-to-end test exists yet

Every phase has thorough **unit and integration** coverage of its own piece
(see `tools/blog-mcp/README.md`'s "Development" section, which documents
what each `test/*.ts` file covers — read it before writing new tests, so you
extend the existing map instead of duplicating it). But nothing currently:

- Exercises direct-MCP, HTTP, and the watcher against **the same** scratch
  remote and asserts they produce an **equivalent resulting tree** for
  equivalent input. This was explicitly flagged as unattempted in Phase 5's
  own plan (see `MILESTONES.md`'s Phase 5 entry) and is Phase 5's own
  acceptance criterion in `TODO-NEXT.md` ("Compose, watcher, direct MCP, and
  HTTP integration fixtures produce the same repository tree from equivalent
  input") — carried forward into Phase 7 as deliverable 1.
- Exercises a **restart mid-pipeline** (not just at startup, which
  `test/bootstrap-repo.test.ts` already covers well) — e.g. process
  interrupted after a local commit but before push, or after push but before
  reconciliation, then a fresh `ensureRepo()`/tick converging without
  duplicating a post or metadata entry.
- Exercises a **conflict** scenario across a full publish pipeline (not just
  within one primitive, like `test/prepare-publish-branch.test.ts`'s rebase-
  conflict case).

**What to build:** a new test file, likely
`tools/blog-mcp/test/e2e-publish-simulation.test.ts` (or split into two if
that reads better — your call), that:

- Reuses `test/helpers/scratchRemote.ts` (`createScratchRemote`,
  `createAdditionalClone`) for the bare remote + one or more clones, exactly
  like `test/watcher.test.ts` and `test/scheduler-engine.test.ts` already do.
- Reuses `test/fixtures-bin/gh-shim.mjs` as the fake GitHub boundary — it
  already supports everything Phase 6 needed
  (`GH_SHIM_STATE`, `GH_SHIM_HEAD_SHA`, `GH_SHIM_MERGE_COMMIT`,
  `GH_SHIM_HEAD_REF_NAME`, `GH_SHIM_REPO_ROOT`, `GH_SHIM_THREADS_JSON`,
  `GH_SHIM_PR_LIST_JSON`). Check its current env-var surface with
  `grep -n "process.env.GH_SHIM" tools/blog-mcp/test/fixtures-bin/gh-shim.mjs`
  before assuming you need to extend it.
- Drives at least: **create** (a full publish through the watcher, or
  through `callToolInProcess` — `tools/blog-mcp/src/serve/client.ts` — for a
  direct-MCP-shaped call), **retry** (a call that fails partway and is
  re-run), **conflict** (two callers/ticks racing on the same base), a real
  **merge** (`gh-shim` reporting `MERGED`), a **restart** mid-pipeline, and
  **reconciliation** converging the checkout afterward. That is six
  scenarios; the acceptance criteria names exactly these six words
  ("create, retry, conflict, merge, restart, and reconciliation"), so treat
  each as its own `it()` rather than folding several into one.
- Runs the full suite once as `npm test` and independently confirms new/
  touched files in isolation — see section 5 below on this repo's known
  flakiness pattern before treating any failure as a regression.

### 4.2 Date policy is implemented but undocumented

`src/domain/dateService.ts` reads `BLOG_MCP_DATE_ORDER` (default `MDY`) and
`BLOG_MCP_DEFAULT_TIME_ZONE` (default `UTC`) — confirmed via
`grep -n "BLOG_MCP_DATE_ORDER\|BLOG_MCP_DEFAULT_TIME_ZONE" tools/blog-mcp/src/domain/dateService.ts`.
Neither variable appears anywhere in `tools/blog-mcp/README.md` or
`tools/blog-mcp/.env.example` (confirmed by the same grep against both
files — zero matches). An operator has no way to discover these exist short
of reading source. Add both to `.env.example` (there's a clear existing
convention to follow — look at how `BLOG_MCP_WATCH_INTERVAL_MS` etc. are
documented there, with a comment above each) and to `README.md` (the
"Development" or a new dedicated subsection is a reasonable home — your
call, but it needs to be discoverable from the table of contents a reader
would build by skimming `##`/`###` headers).

### 4.3 No consolidated recovery/reconciliation operator runbook

The mechanics of `blog_reconcile_after_merge`, the watcher's
`pending-merges.json`, and `ensureRepo()`'s startup recovery are each
documented in their own tool description or `MILESTONES.md`'s narrative
prose, but there is no single "if the container restarts mid-publish, here
is what happens and what you should check" section aimed at an operator
under time pressure. Write one. It should answer, concretely:

- What happens if the container restarts before a commit lands?
- What happens if it restarts after push but before the PR merges?
- What happens if it restarts after merge but before local reconciliation?
- How does an operator confirm reconciliation actually happened (which log,
  which tool call, which audit-log entry)?
- What does an operator do if reconciliation did *not* happen automatically
  (e.g. `blog_reconcile_after_merge` called manually, with what arguments)?

`README.md` is the natural home (it already has "Watcher (directory)" and
"Scheduler (cron)" sections you can sit this beside), but use your judgment.

### 4.4 No migration/compatibility notes anywhere

There is no `CHANGELOG.md` in this repository (confirmed — none exists at
the repo root or under `tools/blog-mcp/`). Phase 7's acceptance criterion
requires "release notes identify any caller migration required by
`changedPaths` and the protected-base commit rule." The two concrete
migrations an external caller would need to make:

1. **Staging**: a caller that used to hand-assemble the list of paths to
   stage after `blog_create_post`/`blog_update_post` must switch to the
   result's own `changedPaths` field, or it will silently fail to commit an
   auto-created `authors.yml`/`tags.yml` entry (this was a real bug fixed in
   Phase 5 for the watcher — see `MILESTONES.md`'s Phase 5 entry for the
   exact failure mode).
2. **Branch creation**: `blog_create_branch` still exists and is unchanged,
   but `blog_prepare_publish_branch` is now preferred — a caller cutting a
   branch from a checkout that might have a local-only commit not yet on
   `origin/<base>` should migrate to avoid silently abandoning that commit
   (the original Milestone 11 incident).

Also worth a line: `blog_commit` now refuses on the base branch, and
`blog_sync_base({ ffOnly: true })` now reports a refused fast-forward as a
precondition failure rather than `ok:true` — a caller that only checked
`ok` before would previously have missed this.

Add this as a short, clearly-labeled section — `README.md`'s tool catalogue
(search for `## Tool catalogue`) or a new short section near the top is
reasonable. Do not invent a `CHANGELOG.md` convention this repo doesn't
already have unless you have a specific reason; a section in an existing,
already-read file is more discoverable here.

## 5. Verification — read this before treating any test failure as a bug

`npm test` runs the full ~34-file `vitest` suite in parallel. Under load,
some tests intermittently fail with `Error: Test timed out in 5000ms`
(vitest's default per-test timeout) — non-deterministically, on different
files each run, because many of these tests spawn real `git` subprocesses
against scratch repos and CPU contention under full parallelism pushes some
past the 5-second default. This has been observed consistently across every
phase of this milestone and is **not** a real regression.

The established verification pattern: if `npm test` shows failures,
immediately re-run just the affected files in isolation:

```powershell
cd tools/blog-mcp
npx vitest run test/<file-a>.test.ts test/<file-b>.test.ts ...
```

If they pass cleanly in isolation, the full-suite failure was contention,
not a regression — proceed. If a failure reproduces in isolation, it is
real; fix it before shipping.

Standard verification sequence for this phase:

```powershell
cd tools/blog-mcp
npm run build
npm test
```

Then, since this phase touches repository documentation:

```powershell
./build/Test-Documentation.ps1
./docs.ps1 -BuildOnly
./build/Test-DocumentationArtifact.ps1
git diff --check
git status --short --branch
```

(`TODO-NEXT.md` section 12 is the source for this list — reread it if any
command has moved or been renamed since this document was written.) When
Docker is unavailable locally, the production documentation build is
delegated to the required `Verify Documentation Build` GitHub Actions check
— do not claim that gate passed locally if you couldn't actually run it.

## 6. Shipping

Follow `.agents/workflows/publish-change.md` exactly, using the code/
configuration review lane. In short: focused branch off latest `main` (the
tools in that workflow doc automate this if available; otherwise the
documented git fallback commands) → the validation in section 5 above →
commit → push → open a ready PR → check for unresolved review threads via
the `gh api graphql` query in that workflow doc's section 3 (do not trust
`gh pr view --json reviewRequests,latestReviews` alone — it misses bot
review threads) → enable auto-merge matched to the exact validated head SHA
→ wait for required checks and the merge → **wait for the `Docs Deploy`
GitHub Actions run for the merge commit to show `completed`/`success`**
before considering the work done (this repo has a hard rule against
reporting anything "published" before that; see that workflow doc's closing
section for why).

Given Phase 7 has three fairly independent deliverables (the test suite,
operator docs, compatibility notes), consider whether one PR or two or three
smaller ones better fits your own workflow — this milestone's convention has
been one PR per coherent chunk of work (seven PRs for six phases plus one
interim bugfix), not one PR per phase mechanically. Use your judgment; either
is consistent with precedent here.

## 7. Closing the milestone

Once Phase 7 is merged and its deploy verified:

1. In `MILESTONES.md`, add a Phase 7 entry to the `## Milestone 11:
   Publishing integrity` section, matching the style of the existing Phase
   1-6 entries (what was delivered, one paragraph, PR link).
2. Change that section's header from `— in progress` to `— complete`,
   matching every other finished milestone's header in this file (grep
   `^## Milestone` in `MILESTONES.md` to see the exact convention — `—
   complete` is what every other finished milestone uses).
3. Do not touch the Milestone 11 sub-narrative above the phase list (the
   incident summary, the four original bugs, the "explicit non-goal" note
   about not silently rewriting the reference post's author) — that is a
   permanent historical record, not a status field.

## 8. Explicit non-goals (from `TODO-NEXT.md` section 14 — still binding)

- Do not automatically correct the reference post's published author.
- Do not permit free-form inline Docusaurus tags.
- Do not guess invalid author/tag keys or silently map them to similar keys.
- Do not force-push, reset an unpreserved commit, or rewrite a published
  branch.
- Do not weaken protected-branch rules or add a direct-merge tool — there is
  still no direct-merge tool in this server, and Phase 7 must not add one.
- Do not make MCP Next (`tools/blog-mcp/MCP-NEXT.md`, a separate, unstarted,
  gated milestone) a prerequisite for anything in this phase.

## 9. If something in this document turns out to be wrong

This document was written by reading the actual repository state, but state
changes. If a file path, function name, PR number, or test file this
document names does not exist when you read it, trust the repository over
this document, fix the smallest discrepancy needed to keep going, and treat
it as evidence this document is stale rather than as a blocker.
