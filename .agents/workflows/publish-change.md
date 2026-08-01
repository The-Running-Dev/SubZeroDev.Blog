# Publish a Repository Change

Use this workflow for code, styling, configuration, documentation, and blog
changes in this repository. It turns a validated branch into a protected,
automatically merged pull request without requiring a user to watch checks or
click Merge. The agent remains responsible for monitoring the result and
reporting it back.

## Tool availability

`tools/blog-mcp` exposes this workflow's deterministic steps as MCP tools.
When it is available (its `blog_*` tools appear in your tool list), prefer
the named tool for each step below — it enforces the same rule as code
rather than by memory. Each step names its tool and its manual fallback; if
the tool layer is unavailable, follow the fallback. The rules themselves —
what must be true before merging, what must be true before reporting a URL
— do not change either way.

## Inputs

- Repository: `<owner>/<repository>`
- Target branch: `main`
- Working branch: `<branch-name>`
- Commit message: `<commit-message>`
- PR title: `<pr-title>`
- Change scope: `<post-only|code-or-configuration>`

## 1. Prepare the change

1. Read `AGENTS.md` and all relevant source and workflow files.
2. Start from the latest available `main` on a focused branch.
   - **Tool:** `blog_create_branch({ name: "<branch-name>" })` (fetches
     `origin/main` first, refuses if anything is staged).
   - **Fallback:** `git fetch origin main && git switch -c <branch-name>
     origin/main`.
3. Preserve unrelated work and stage only files that belong to the change.
   Never `git add -A` or `git add .`.
   - **Tool:** `blog_stage({ paths: [...] })` — an explicit,
     non-empty path list checked against the write allowlist; rejects `-A`,
     `--all`, `.`, and any path containing `..` or `;`.
   - **Fallback:** `git add -- <explicit paths>`, then `git status --short`
     to confirm nothing unintended is staged.
4. Run every applicable local validation command from `AGENTS.md`.
   - **Tool:** `blog_preflight({})` for the repo-wide checks (front matter,
     content hubs, the doc gate); `npm run build && npm test` inside
     `tools/blog-mcp/` when the change touches that package.
   - **Fallback:** the PowerShell commands listed in `AGENTS.md`'s
     Validation section.
5. Review the final diff, then commit and push the exact validated change.
   - **Tool:** `blog_diff({ staged: true })` to review, `blog_commit({...})`
     to commit (enforces a conventional-commit subject, refuses an empty
     stage, never passes `--no-verify`), `blog_push({})` to push (refuses to
     push the base branch directly; verifies the remote matches local
     `HEAD` afterward). `blog_push` requires `BLOG_MCP_ALLOW_REMOTE=1`.
   - **Fallback:** `git diff --cached`, `git commit -m "<commit-message>"`,
     `git push -u origin <branch-name>`.

## 2. Create a ready PR

Open a ready pull request into `main` with a body that explains the change, its
impact, and the validation performed. Create a draft only when the user
explicitly asks to hold the work, keep it a draft, or disable auto-merge.

- **Tool:** `blog_create_pr({ title, body, base: "main" })` (writes the body
  to a temp file, `--body-file`, never on argv; requires
  `BLOG_MCP_ALLOW_REMOTE=1`).
- **Fallback:** `gh pr create --title "<pr-title>" --body-file <path>`.

Capture the exact validated head SHA after the push:

```powershell
$headSha = git rev-parse HEAD
```

## 3. Apply the right review lane

### Post-only changes

For a post, tag, author, or other editorial-only change that the user supplied
or approved, enable automatic merge immediately after the ready PR is created.

### Code, styling, configuration, and workflow changes

Check for automated review findings before enabling auto-merge — and check by
**review thread**, not just requested reviewers: a bot-posted review (this
repository has `qodo-code-review` configured) leaves unresolved conversation
threads without necessarily appearing as a requested reviewer or a formal
review object. `gh pr view --json reviewRequests,latestReviews` alone misses
this; a PR merged cleanly through every required check still blocked on
`required_conversation_resolution` because of exactly this gap.

- **Tool:** `blog_pr_comments({ pr, unresolvedOnly: true })` — paginates to
  completion internally (`pageInfo.hasNextPage`, capped at 20 pages / ~2000
  threads as a defensive bound). It cannot silently under-report: if
  pagination doesn't reach a genuine end (the page cap is hit, or a page
  reports more exist with no cursor to continue from), it fails loudly
  (`kind: 'infrastructure'`) instead of returning a partial thread list as
  if it were complete.
- **Fallback:** a single `first: N` page can miss threads beyond it and
  incorrectly look clean. Paginate with `after`:
  ```
  gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!,$after:String) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) {
        reviewThreads(first: 100, after:$after) {
          pageInfo { hasNextPage endCursor }
          nodes { id isResolved comments(first:1){nodes{body path author{login}}} }
        }
      }
    }
  }' -f owner=<owner> -f repo=<repo> -F number=<pr>
  ```
  If the response's `pageInfo.hasNextPage` is `true`, rerun with `-f
  after=<pageInfo.endCursor>` and merge the node lists before concluding no
  threads are unresolved.

Address valid findings, re-run validation, push the correction, refresh
`$headSha`, and resolve each thread a validated fix directly satisfies (see
§5). If no unresolved threads exist and no reviewer is configured, state
that fact in the PR handoff; do not invent a human approval requirement that
the repository does not enforce.

## 4. Enable automatic squash merge

Use the repository's allowed squash strategy and bind it to the exact validated
head commit:

- **Tool:** `blog_auto_merge({ pr, headSha: $headSha })` (cross-checks
  `headSha` against the PR's actual head via `gh pr view` and refuses on
  mismatch or on a draft PR, rather than silently enabling it on the wrong
  commit; requires `BLOG_MCP_ALLOW_REMOTE=1`).
- **Fallback:**
  ```powershell
  gh pr merge <pr-url-or-number> --auto --squash --match-head-commit $headSha
  ```

GitHub keeps the PR open until every protected-branch requirement passes. Do
not merge directly or bypass protection — **there is no direct-merge tool in
`tools/blog-mcp`; enabling auto-merge is the only merge path either way.**
Monitor the required checks for the exact head SHA, then confirm the merge
and the `Docs Deploy` workflow for its merge commit. The repository removes
the remote branch automatically after the merge.

- **Tool:** `blog_wait_for_checks({ ref: $headSha })`, then
  `blog_wait_for_merge({ pr })`.
- **Fallback:** `gh pr checks <pr> --watch`, then poll `gh pr view <pr>
  --json state,mergeCommit`.

## 5. Handle exceptions

If a required check fails, a review thread blocks the PR, or the head changes:

1. Inspect the concrete failure or full review thread.
2. Make the smallest valid correction.
3. Re-run applicable validation and push the new commit.
4. Resolve a review thread only when the validated fix directly satisfies it;
   otherwise leave it open and report the ambiguity.
   - There is no `blog_resolve_review_thread` tool yet; resolve via
     `gh api graphql -f query='mutation($id:ID!){
     resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f
     id=<threadId>` (the thread `id`s come from the query in §3).
5. Recompute `$headSha` and enable auto-merge again.
   - If `gh pr merge` returns a `502` or `"Merge already in progress"`
     error, that is not necessarily a real conflict: in
     [PR #35](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/35)
     both occurred back to back on an otherwise-mergeable PR and cleared on
     their own. Confirm actual state first: `gh pr view <pr> --json
     mergeable,mergeStateStatus,autoMergeRequest` returns `mergeStateStatus:
     "BLOCKED"` with `autoMergeRequest: null` after a real block, such as an
     unresolved review thread (§3) — that means something else is wrong and
     retrying won't help. If state looks otherwise clean, waiting roughly
     15–20 seconds and retrying once resolved it in that one observed case
     — this is not documented GitHub API behavior, just what worked once.

After a successful merge, wait for the deployment workflow to complete and
report its result. When the change has a public route, verify that route over
HTTPS before reporting it as published. For a blog post, report its canonical
`https://blog.subzerodev.com/<slug>/` URL. Report the PR URL, head SHA, merge
commit, deployment result, published URL when applicable, and any unresolved
exception.

- **Tool:** `blog_wait_for_deploy({ mergeCommitSha })`, then
  `blog_verify_published_url({ mergeCommitSha, slug })`, or
  `blog_publish_report({ pr, slug })` to assemble the whole report at once.
- **Fallback:** poll `gh run list --workflow "Docs Deploy"` filtered to the
  merge commit SHA, then `curl` the canonical route once it completes.

**Hard rule:** never state or imply a published URL until the `Docs Deploy` run
for that exact merge commit shows `completed`/`success`. A merged PR is not a
deployed site. Poll the run status until it finishes — do not estimate timing
or report the URL as done while deploy is still in flight.
`blog_verify_published_url` enforces this structurally: `mergeCommitSha` is a
required input, and there is no code path in it that returns a URL without a
confirmed successful deploy. This rule is authoritative regardless of tool
availability.
