# Historical handoff: Milestone 11 Phase 7 (delivered)

> **Status:** Phase 7 was delivered by
> [PR #99](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/99) and
> [PR #100](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/100).
> [PR #101](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/101)
> closed Milestone 11. This document is retained as a historical record of
> the implementation contract; it is not an active work instruction.

**Audience:** maintainers reviewing how Phase 7 was scoped and delivered.
Everything needed to verify a historical claim is a file path, a `git log`
entry, or a PR number below.

**Outcome:** Phase 7 completed Milestone 11 ("Publishing integrity").

## 1. Read these first, in order

1. `AGENTS.md` (repo root) — safe-start checklist, project boundary, model/
   effort guidance.
2. `tools/blog-mcp/TODO-NEXT.md` — the full milestone spec. Section 1-2 is
   the original incident; section 10 lists all seven phases with deliverables
   and acceptance criteria; section 13 is the milestone-wide definition of
   done; section 14 is explicit non-goals. Phase 7 itself is section 10,
   "Phase 7: end-to-end verification and documentation" (search for that
   heading).
3. `MILESTONES.md`, the `## Milestone 11: Publishing integrity — complete`
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

At the time of this handoff, only Phase 7 remained. It subsequently verified
and documented what Phases 1-6 built without adding new production behavior.

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

## 4. Gaps identified at handoff time (now closed)

Each gap below was checked against `main` when the handoff was written. They
are preserved to explain the delivered Phase 7 scope; they are no longer open
work items.

### 4.1 End-to-end publish coverage (closed by PR #100)

Before Phase 7, every phase had thorough **unit and integration** coverage of
its own piece, but the suite did not yet cover these cross-pipeline cases:

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

**Delivered implementation:**
`tools/blog-mcp/test/e2e-publish-simulation.test.ts`, which:

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
- Drives **create** (a full publish through the watcher or
  through `callToolInProcess` — `tools/blog-mcp/src/serve/client.ts` — for a
  direct-MCP-shaped call), **retry** (a call that fails partway and is
  re-run), **conflict** (two callers/ticks racing on the same base), a real
  **merge** (`gh-shim` reporting `MERGED`), a **restart** mid-pipeline, and
  **reconciliation** converging the checkout afterward. That is six
  scenarios, each represented by its own `it()`.

### 4.2 Date policy documentation (closed by PR #99)

`src/domain/dateService.ts` reads `BLOG_MCP_DATE_ORDER` (default `MDY`) and
`BLOG_MCP_DEFAULT_TIME_ZONE` (default `UTC`). At handoff time neither variable
was documented outside source. PR #99 added both to `.env.example` and the
operator documentation in `README.md`.

### 4.3 Recovery and reconciliation runbook (closed by PR #99)

At handoff time the mechanics of `blog_reconcile_after_merge`, the watcher's
`pending-merges.json`, and `ensureRepo()`'s startup recovery were scattered
across tool descriptions and milestone notes. PR #99 consolidated the answers
to these operator questions in `README.md`:

- What happens if the container restarts before a commit lands?
- What happens if it restarts after push but before the PR merges?
- What happens if it restarts after merge but before local reconciliation?
- How does an operator confirm reconciliation actually happened (which log,
  which tool call, which audit-log entry)?
- What does an operator do if reconciliation did *not* happen automatically
  (e.g. `blog_reconcile_after_merge` called manually, with what arguments)?

### 4.4 Migration and compatibility notes (closed by PR #99)

Phase 7's acceptance criterion required release notes to identify caller
migration required by `changedPaths` and the protected-base commit rule. The
two concrete migrations documented in `README.md` were:

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

The notes also record that `blog_commit` now refuses on the base branch, and
`blog_sync_base({ ffOnly: true })` now reports a refused fast-forward as a
precondition failure rather than `ok:true` — a caller that only checked
`ok` before would previously have missed this.

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

## 6. Historical shipping record

The work followed `.agents/workflows/publish-change.md` through focused
branches, local validation, ready PRs, review-thread checks, auto-merge, and
successful `Docs Deploy` runs for the exact merge commits.

The documentation and compatibility notes shipped in PR #99; the end-to-end
simulation and retry fix shipped in PR #100.

## 7. Milestone closure (completed)

After Phase 7 merged and its deploy was verified, PR #101 completed these
closure steps:

1. Added a Phase 7 entry to the `## Milestone 11:
   Publishing integrity` section, matching the style of the existing Phase
   1-6 entries (what was delivered, one paragraph, PR link).
2. Changed that section's header from `— in progress` to `— complete`,
   matching every other finished milestone's header in this file (grep
   `^## Milestone` in `MILESTONES.md` to see the exact convention — `—
   complete` is what every other finished milestone uses).
3. Preserved the Milestone 11 sub-narrative above the phase list (the
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
