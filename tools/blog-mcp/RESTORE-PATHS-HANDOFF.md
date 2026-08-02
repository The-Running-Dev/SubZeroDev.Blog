# Handoff: `blog_restore_paths` — close the dirty-working-tree dead end

**Audience:** an agent picking this up with no memory of the prior work
(e.g. Codex). This document is self-contained — do not assume access to any
chat history that produced it. Everything you need to verify a claim is a
file path or a command you can run yourself.

**Status:** not started. This is a plan only — no code has been written for
this specific fix yet. It is independent of, and can be done before, during,
or after, `tools/blog-mcp/PHASE7-HANDOFF.md` (Milestone 11's final phase) —
read that document separately if you're also picking that up; the two do
not conflict but touch some of the same test-helper conventions.

## 1. The problem, verified against current `main`

A bug report surfaced describing an operational dead end: a stale container
checkout caused `blog_create_post` to auto-create tag/author entries that
already existed upstream (with placeholder metadata, clobbering curated
data), leaving `docs/blog/tags.yml` modified in the working tree. The
subsequent `blog_create_branch` call then failed because git refused to
switch branches over that dirty file — and no tool in the server could
recover from it. Some of that report's framing was treated with suspicion
before acting on it (it arrived through an unusual channel and closely
mirrored an earlier, confirmed prompt-injection attempt in the same
project). **Its central technical claim was independently re-verified by
reading the actual tool code directly — not by trusting the report — and is
real:**

- `blog_reset_stage` (`tools/blog-mcp/src/tools/localGit.ts:356-368`) is
  explicitly documented as *"Never touches the working tree"* — it only
  unstages via `git restore --staged --`.
- `blog_create_branch` (`localGit.ts:75-113`) only checks *staged* paths
  before switching (`status({ repoRoot })`, filtered to `staged`); an
  unstaged or untracked dirty file is not checked at all, so the raw
  `git switch -c <branch> origin/<base>` call fails with git's own
  uncaught stderr the moment such a file would be overwritten.
- `blog_prepare_publish_branch` (`localGit.ts:115-254`), the tool now
  preferred for starting a publish (Milestone 11 Phase 4/5), handles this
  better — it detects a dirty tree up front and refuses cleanly
  (`localGit.ts:167-171`) instead of crashing through to a raw git error.
  But its own refusal message says *"commit, stash, or discard them
  first,"* and **no tool anywhere in this server can discard a
  working-tree change.**

Confirm this yourself before starting:
`grep -n "server.registerTool(" tools/blog-mcp/src/tools/localGit.ts` — as
of this writing it returns exactly seven registrations, none of them a
restore/checkout/stash/discard operation.

**Net effect:** any write that leaves an unwanted, uncommitted modification
in the working tree — most plausibly `blog_create_post`/`blog_update_post`'s
atomic metadata auto-creation (Milestone 11 Phase 2) modifying
`docs/blog/tags.yml`/`authors.yml` before a caller reviews or stages it —
has no MCP-level way back. An operator needs raw shell access to the
container to run `git restore` manually, which defeats the point of
exposing this repository's publishing steps as MCP tools at all.

This was confirmed with the repository owner to be a real, worth-fixing
design gap — not describing a container that is stuck right now. Treat it
as a normal priority hardening fix, not an emergency.

## 2. The fix: one new tool, `blog_restore_paths`

Add a tool that discards an explicit, non-empty list of repo-relative paths'
working-tree content back to a given git ref (defaulting to
`origin/<base>`), via `git restore --source=<ref> --worktree --`. This
follows the same explicit-path-list, no-wildcards-ever convention
`blog_stage` already established in this codebase — do not generalize this
into anything that accepts `.`, `-A`, or a glob.

### 2.1 `tools/blog-mcp/src/tools/localGit.ts`

Add this registration inside `registerLocalGitTools`, after the existing
`blog_reset_stage` registration (currently the last one in the function,
ending around line 368). All imports it needs
(`z`, `ok`, `precondition`, `infrastructureFailure`, `git`, `status`,
`checkAllowedPaths`, `wrapMutatingTool`) are already imported at the top of
this file — no new imports required.

```ts
server.registerTool(
  'blog_restore_paths',
  {
    title: 'Discard working-tree changes to specific paths',
    description:
      "Restores an explicit, non-empty list of repo-relative paths to their content at `source` (defaults to origin/<base>), discarding any uncommitted working-tree modification via `git restore --source=<source> --worktree --`. Never accepts -A, --all, or '.' -- every path is checked against the publishing-path allowlist first, same as blog_stage. Refuses if any requested path is currently staged (unstage via blog_reset_stage first, so a discard is never silently combined with an unstage in one call). This is the recovery path when an unwanted change -- most often blog_create_post/blog_update_post auto-creating a tag/author entry against a stale checkout -- is blocking blog_create_branch or blog_prepare_publish_branch. It only restores tracked content already present at `source`; it cannot delete an untracked file and cannot rewrite history.",
    inputSchema: {
      paths: z.array(z.string()).min(1),
      source: z.string().optional()
    }
  },
  wrapMutatingTool(ctx, 'blog_restore_paths', async (args: { paths: string[]; source?: string }) => {
    const check = checkAllowedPaths(repoRoot, args.paths, ctx.capabilities?.writablePathPrefixes);
    if (!check.ok) return precondition(check.reason ?? 'One or more paths are not allowed.');

    const entries = await status({ repoRoot });
    const staged = new Set(entries.filter((e) => e.staged).map((e) => e.path));
    const stagedRequested = args.paths.filter((p) => staged.has(p));
    if (stagedRequested.length > 0) {
      return precondition(
        `Refusing: ${stagedRequested.join(', ')} ${stagedRequested.length === 1 ? 'is' : 'are'} staged. Unstage with blog_reset_stage first.`
      );
    }

    const source = args.source ?? `origin/${config.baseBranch}`;
    const result = await git(['restore', '--source', source, '--worktree', '--', ...args.paths], { repoRoot });
    if (result.exitCode !== 0) {
      return infrastructureFailure('git restore failed', {
        command: ['git', 'restore', '--source', source, '--worktree', '--', ...args.paths],
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      });
    }
    return ok(`Restored ${args.paths.length} path(s) to their content at '${source}'`, { paths: args.paths, source });
  })
);
```

Design choices worth preserving as you implement — a reviewer will ask
about these if they change:

- **Explicit paths, no wildcards.** Reuses `checkAllowedPaths`
  (`tools/blog-mcp/src/domain/paths.ts`) exactly as `blog_stage` does — same
  allowlist, same rejected-literals set (`-A`, `--all`, `.`, `:/`, `..`,
  `;`). This is not a `git checkout .` / `git clean -fd` equivalent, and it
  should be structurally impossible for it to become one.
- **Refuses on a staged path** rather than silently restoring the worktree
  under a still-staged index entry. Keeps this tool doing exactly one job,
  matching how `blog_stage`/`blog_reset_stage`/`blog_commit` are already
  split into single-purpose steps instead of one tool with modal behavior.
- **Cannot delete untracked files.** `git restore` only ever touches paths
  that exist at `source`; an untracked file (e.g. a half-written new post)
  is out of scope for this tool by construction, not by an extra check.
  This matches the actual reported failure mode (a *modified tracked*
  metadata file blocking checkout) rather than adding a blunter
  discard-everything instrument. Do not extend this tool to also delete
  untracked files without a separate, explicit design discussion — it
  changes the safety properties significantly (a wrong path becomes
  irreversible instead of just "reset to a known ref").
- **`source` defaults to `origin/<base>`**, overridable. The common case is
  "put this back to what's actually published"; an explicit ref (a specific
  SHA, `HEAD`) covers the rarer case of discarding a working-tree-only edit
  without touching a local commit already made.

### 2.2 Close the loop in `blog_prepare_publish_branch`'s refusal message

Its dirty-tree precondition message currently ends with *"...commit, stash,
or discard them first — branch preparation never moves uncommitted work
implicitly"* (`localGit.ts:169`), naming an action ("discard") the server
could not previously perform. Append one clause naming the new tool, so a
caller reading the error text — including an LLM caller, not just a human
reading docs later — has an actual next step. This mirrors how
`blog_sync_base`'s `ffOnly` refusal message already points callers at
`blog_prepare_publish_branch` the same way:

```
"...discard them first -- branch preparation never moves uncommitted work implicitly. blog_restore_paths can discard a tracked file's modification back to a known ref; it cannot remove an untracked file."
```

### 2.3 `README.md` tool catalogue

Add `blog_restore_paths` to the "Local git" bullet list
(`tools/blog-mcp/README.md`, search for `Local git:` — currently lists
`blog_sync_base`, `blog_prepare_publish_branch`/`blog_create_branch`, then
`blog_stage, blog_commit ..., blog_diff, blog_reset_stage` on one line).
Add a one-line description mirroring the style already used there — state
plainly, condense the "why," don't repeat the full tool description.

## 3. Tests

New file `tools/blog-mcp/test/restore-paths.test.ts`, following
`tools/blog-mcp/test/prepare-publish-branch.test.ts`'s exact established
pattern for testing a `localGit.ts` tool directly (not through HTTP) —
read that file in full before writing this one; it is the closest existing
precedent and demonstrates the `setUp()` helper shape to copy:

```ts
async function setUp(prefix: string): Promise<{ remote: ScratchRemote; server: FakeServer }> {
  const remote = await createScratchRemote(prefix);
  const config = loadConfig(remote.clone);
  const server = new FakeServer();
  const ctx = {
    server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
    repoRoot: remote.clone,
    config
  };
  registerLocalGitTools(ctx);
  return { remote, server };
}
```

Uses `test/helpers/scratchRemote.ts` (`createScratchRemote`,
`createAdditionalClone`, `removeScratchRemote`) for a real bare remote plus
clone per test, and `test/helpers/fakeServer.ts` (`FakeServer`, `call`) to
invoke the tool directly. `createScratchRemote` seeds a root `README.md`,
which already satisfies `checkAllowedPath`'s root-`.md` allowance (see
`domain/paths.ts`'s `isRootMarkdown` check) — no extra fixture files are
needed for the basic cases.

Write these cases:

1. **Default source.** Modify the seeded `README.md` in the working tree,
   call `blog_restore_paths({ paths: ['README.md'] })` with no explicit
   `source`, assert the file's content reverts to what `origin/main` has and
   `isClean({ repoRoot })` (from `src/exec/git.ts`) is `true` afterward.
2. **Explicit source override.** Same setup, but pass an explicit `source`
   (an earlier real SHA from the scratch remote's history) to confirm the
   override path works, not just the default.
3. **Allowlist refusal.** A path outside `checkAllowedPaths`' allowed
   prefixes returns a precondition, not a crash — this is really just
   confirming the wiring, since `checkAllowedPaths` itself already has its
   own coverage elsewhere.
4. **Staged-path refusal.** Stage the modified `README.md` first
   (`blog_stage` or a raw `git add`), then call `blog_restore_paths`, and
   assert a precondition refusal whose message names `blog_reset_stage`,
   with the working tree left untouched (the staged content still differs
   from `origin/main`).
5. **The end-to-end regression case — this is the one that actually proves
   the dead end is closed, not just that the new tool works in isolation.**
   Modify a tracked file in the working tree so that
   `blog_prepare_publish_branch` refuses with its dirty-tree precondition
   (reproducing the actual reported deadlock class), call
   `blog_restore_paths` to discard the change, then call
   `blog_prepare_publish_branch` again and assert it now succeeds.

Also add one assertion — either inline in this new file or in
`test/localgit-integrity.test.ts`, whichever reads more naturally in
context — confirming `blog_prepare_publish_branch`'s dirty-tree refusal
message now contains the substring `blog_restore_paths`, so a future edit
to that message can't silently drop the pointer.

### Running tests

This repository has a known, established flakiness pattern: `npm test`
runs the full ~34-file `vitest` suite in parallel, and under load some tests
intermittently fail with `Error: Test timed out in 5000ms` (vitest's
default per-test timeout) — non-deterministically, on different files each
run, because many tests spawn real `git` subprocesses against scratch repos
and CPU contention under full parallelism pushes some past the 5-second
default. **This is not a real regression when it happens.** If `npm test`
shows a failure, immediately re-run just the affected files in isolation:

```powershell
cd tools/blog-mcp
npx vitest run test/restore-paths.test.ts test/localgit-integrity.test.ts test/localgit.test.ts test/prepare-publish-branch.test.ts test/capabilities.test.ts
```

If they pass cleanly in isolation, the full-suite failure was contention,
not a regression. If a failure reproduces in isolation, it is real — fix it
before shipping.

## 4. Verification

```powershell
cd tools/blog-mcp
npm run build
npm test
```

## 5. Shipping

Follow `.agents/workflows/publish-change.md` exactly, using the "Code,
styling, configuration, and workflow changes" review lane in its section 3
(this is a code change, not an editorial post). In short: focused branch off
latest `main` → the validation in section 4 above → commit → push → open a
ready PR → check for unresolved review threads via the `gh api graphql`
query in that workflow doc's section 3 (do not trust
`gh pr view --json reviewRequests,latestReviews` alone — it misses bot
review threads; as of this writing no bot reviewer is configured on this
repo, so an empty result is expected, not a shortcut you skipped) → enable
auto-merge matched to the exact validated head SHA
(`gh pr merge --auto --squash --match-head-commit <headSha>`) → wait for
required checks and the merge → **wait for the `Docs Deploy` GitHub Actions
run for the merge commit to show `completed`/`success`** before considering
the work done — this repository has a hard rule against reporting anything
"published" or "shipped" before that; see that workflow doc's closing
section for why.

No `MILESTONES.md` entry is required for this change. It is a standalone
hardening fix discovered after Milestone 11 closed out through Phase 5, not
one of that milestone's numbered phases. Do not add it to Milestone 11's
phase list or touch that milestone's header status.

## 6. Non-goals — do not scope-creep this fix

- Do not add a tool that can delete untracked files, `git clean`-style, as
  part of this change. If that turns out to be genuinely needed later, it
  is a separate, explicitly-designed tool with its own safety discussion —
  not a quiet extension of `blog_restore_paths`.
- Do not weaken `checkAllowedPaths` or add a wildcard/`.`/`-A` escape hatch
  to make recovery "more convenient." The explicit-path-list discipline is
  the entire safety property this tool relies on.
- Do not touch `blog_create_branch`'s behavior. It is deliberately kept
  as-is (see its own tool description) for any caller that already depends
  on its exact current behavior; this fix is additive only.
- Do not attempt to also fix the *cause* of a stale checkout in this same
  change (that is a separate concern already addressed by
  `blog_reconcile_after_merge`, Milestone 11 Phase 6, and the
  `knownAuthorsAndTags` interim bugfix — both already merged). This fix is
  strictly about making a dirty working tree recoverable after the fact,
  regardless of how it got dirty.

## 7. If something in this document turns out to be wrong

This document was written by reading the actual repository state directly,
but state changes. If a file path, line number, or function name this
document names does not match what you find when you read it, trust the
repository over this document, fix the smallest discrepancy needed to keep
going, and treat it as evidence this document is stale rather than as a
blocker.
