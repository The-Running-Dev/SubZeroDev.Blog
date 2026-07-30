# Create and Publish a Blog Post

Work in the specified GitHub repository and complete the entire branch-to-PR workflow.

## Tool availability

`tools/blog-mcp` exposes this workflow's deterministic steps as MCP tools.
When it is available (its `blog_*` tools appear in your tool list), prefer
the named tool for each step below over the manual/CLI fallback — it
enforces the same rules as code rather than by memory. If the tool layer is
unavailable, follow the described fallback; the rules themselves are
unchanged either way.

## Inputs

- Repository: `<owner>/<repository>`
- Target branch: `main`
- Working branch: `<branch-name>`
- Blog-post date: `<YYYY-MM-DD>`
- Post slug: `<slug>`
- Commit message: `<commit-message>`
- PR title: `<pr-title>`
- Post content: `<complete-post-content>`

## Instructions

### 1. Research the repository

Before changing anything:

1. Inspect the repository structure and any AGENTS.md, contribution, or documentation instructions.
2. Inspect existing posts under `docs/blog/` to identify the established conventions.
3. Inspect:
   - `docs/blog/_post-template.md`
   - `docs/blog/tags.yml`
   - repository documentation for writing posts
   - `docs/docusaurus.config.ts`
   - relevant CI workflows
4. Confirm:
   - required filename format
   - required front-matter fields
   - author identifiers
   - date format
   - controlled tag vocabulary
   - excerpt or truncate-marker requirements
   - available validation and build commands

- **Tool:** `blog_list_posts({})`, `blog_list_tags({})`, `blog_list_authors({})`, `blog_repo_status({})`.
- **Fallback:** read the files listed above directly.

Do not assume standard Docusaurus behavior when the repository documents stricter conventions.

### 2. Plan the implementation

Create a short implementation plan covering:

1. Branch creation
2. Blog-post creation
3. Any required controlled-tag additions
4. Local validation
5. Commit and push
6. Ready PR creation and automatic merge setup
7. Exception and review follow-up

Proceed with implementation unless a material repository rule or missing input requires clarification.

### 3. Create the branch

Update the local view of the target branch, then create:

`<branch-name>`

The branch must be based on the latest available `main`. Do not overwrite unrelated local changes.

- **Tool:** `blog_create_branch({ name: "<branch-name>" })` (or `{ slug, kind: "blog" }` to derive `blog/<slug>`, matching this repository's convention for post branches). Fetches `origin/main` first; refuses if anything is already staged.
- **Fallback:** `git fetch origin main && git switch -c <branch-name> origin/main`.

### 4. Create the blog post

Create the file using the repository-required naming convention:

`docs/blog/<YYYY-MM-DD>-<slug>.md`

Use repository-compliant front matter. Unless repository evidence requires something different, use:

```yaml
---
title: "<title>"
description: "<description>"
slug: <slug>
authors:
  - <valid-author-key>
date: <YYYY-MM-DD>T00:00:00Z
tags:
  - <existing-tag-key>
---
```

The author must reference a valid author defined by the repository. Every tag must reference a key already declared in `docs/blog/tags.yml`.

- **Tool:** `blog_create_post({ title, description, slug, body, tags, date, authors })`. Validates before writing — nothing is written if any error-severity finding is reported (missing fields, bad slug/date shape, unknown tag/author, missing or duplicate truncate marker, more than one top-level heading before the marker, a leftover template placeholder). If it refuses, the returned `findings` name the exact rule that failed; fix and retry rather than writing the file by hand.
- **Fallback:** copy `docs/blog/_post-template.md` to the target path and fill it in by hand.

If the supplied post needs new tags:

1. Add the required keys to `docs/blog/tags.yml`.
2. Follow the existing tag structure and permalink conventions.
3. Ensure tag permalinks remain unique.
4. Do not add unnecessary tags.

- **Tool:** `blog_add_tag({ key, label, description, permalink? })` — refuses a duplicate key or permalink before writing, and validates the result against the exact regexes `build/Test-DocumentationArtifact.ps1` uses so a tag this adds can never fail CI's tag-integrity check.
- **Fallback:** edit `docs/blog/tags.yml` by hand, matching the existing blank-line-separated entry shape.

Preserve the supplied article wording exactly unless changes are required for Markdown validity or the user explicitly requests editing.

Add the repository's excerpt marker in a natural position near the beginning of the post:

`<!-- truncate -->`

Do not place the marker inside the front matter, a paragraph, blockquote, or other Markdown construct. Keep any additional `# ` headings **after** the marker — one before it is fine (the themed title), but a second one before it renders unstyled and oversized on the blog index and tag pages (`blog_validate_posts`'s `SingleH1` rule catches this; `docs/blog/2026-07-30-the-absurdity-of-humanity.md` shipped with exactly this bug before it was fixed).

If the post belongs to a curated series or project (its tags or slug match one of the hubs in `docs/src/pages/series/` or `docs/src/pages/projects/`), add it there too — a post that qualifies but is missing from its hub is a real, recurring gap (it produced a follow-up PR once already).

- **Tool:** `blog_validate_hubs({})` to check whether the new post should appear on a hub; `blog_add_hub_entry({ hub, title, description, href })` to add it (splices the hub `.tsx` file's `entries[]` array by AST position, not regex, so existing formatting is untouched).
- **Fallback:** edit the relevant `docs/src/pages/series/*.tsx` or `docs/src/pages/projects/*.tsx` file by hand, matching the existing entry shape and quoting convention.

### 5. Validate locally

Run the repository's documented validation commands. At minimum, verify:

- the filename matches `YYYY-MM-DD-slug.md`
- all required front-matter fields are present
- the date uses the documented format
- the author key is valid
- every tag is declared in `docs/blog/tags.yml`
- tag permalinks are unique
- the truncate marker exists
- the Markdown is structurally valid
- `git diff --check` passes
- the documentation or Docusaurus production build passes, when locally available

- **Tool:** `blog_preflight({})` runs `blog_validate_posts`, `blog_validate_hubs`, and the doc gate together and returns one verdict. `blog_run_artifact_check({})` also runs the route/feed contract check when a production artifact is present locally (it honestly reports `delegated-to-ci` otherwise, rather than a false pass).
- **Fallback:** `./build/Test-Documentation.ps1`, `./docs.ps1 -BuildOnly`, `./build/Test-DocumentationArtifact.ps1`, `git diff --check`.

Review the final diff and confirm that it contains only the intended post and any necessary tag definitions.

### 6. Commit and push

Commit all intended changes with:

`<commit-message>`

Push `<branch-name>` to the remote repository. Verify that the remote branch contains the same commit/tree as the validated local changes.

- **Tool:** `blog_stage({ paths: [...] })` (never `-A`/`.`), `blog_commit({ type: "feat", scope: "blog", summary: "..." })`, `blog_push({})` (verifies the remote now matches local `HEAD` after pushing). `blog_push` and `blog_stage`/`blog_commit` require `BLOG_MCP_ALLOW_REMOTE=1` and default (non-read-only) mode respectively.
- **Fallback:** `git add -- <explicit paths>`, `git commit -m "<commit-message>"`, `git push -u origin <branch-name>`.

### 7. Open a ready PR and arm automatic merge

Open a ready PR from `<branch-name>` into `main`. Use `<pr-title>` as the PR
title. Use a draft only when the user explicitly asks to hold publication, keep
the PR a draft, or disable auto-merge.

The PR body should contain:

#### Summary

- Identify the new post and its path.
- Mention any controlled tags added.
- State whether the supplied story body was preserved.

#### Validation

- List the validation commands and checks performed.
- Include the documentation build result when available.

- **Tool:** `blog_create_pr({ title, body, base: "main" })` (writes the body to a temp file, never on argv).
- **Fallback:** `gh pr create --title "<pr-title>" --body-file <path>`.

After creating the PR, capture the exact validated commit SHA and enable
automatic squash merge:

```powershell
$headSha = git rev-parse HEAD
gh pr merge <pr-url-or-number> --auto --squash --match-head-commit $headSha
```

- **Tool:** `blog_arm_auto_merge({ pr, headSha: $headSha })` — cross-checks `headSha` against the PR's actual head via `gh pr view` and refuses on mismatch or on a draft PR.

This does not bypass repository protection: GitHub merges only after all
required checks pass, the branch is current when required, and all review
threads are resolved. The repository deletes the remote branch after merge.

Do not require a user to wait for successful checks or click Merge manually.
The agent must monitor the exact head's checks and report the PR, merge,
deployment, and publication outcomes.

### 8. Monitor CI, merge, and deployment

After auto-merge is armed:

1. Monitor `Documentation links and terminology` and `Verify Documentation
   Build` for the exact head SHA and report their final outcome.
2. Confirm the PR merged with the expected squash strategy and record the
   resulting merge commit SHA.
3. Locate the `Docs Deploy` workflow for that merge commit and wait for its
   final outcome.
4. After a successful deployment, verify the canonical post URL over HTTPS:

   `https://blog.subzerodev.com/<slug>/`

5. Report the PR URL, merge commit, deployment result, and published post URL.

- **Tool:** `blog_wait_for_checks({ ref: $headSha })`, `blog_wait_for_merge({ pr })`, `blog_wait_for_deploy({ mergeCommitSha })`, `blog_verify_published_url({ mergeCommitSha, slug })` — or `blog_publish_report({ pr, slug })` to assemble all of the above into one report.
- **Fallback:** `gh pr checks <pr> --watch`, poll `gh pr view --json state,mergeCommit`, poll `gh run list --workflow "Docs Deploy"` filtered to the merge commit SHA, `curl` the canonical URL once deploy completes.

If CI fails, review feedback arrives before merge, or the deployment fails:

1. Inspect the failing job, logs, or full review thread.
2. Make only the changes required to fix the valid finding.
3. Re-run all relevant local validation.
4. Commit and push the correction.
5. Capture the replacement head SHA and arm auto-merge again with that SHA.
   - If `gh pr merge`/`blog_arm_auto_merge` returns a transient error (a
     `502`, or `"Merge already in progress"`), wait roughly 15–20 seconds
     and retry once before escalating — observed as a GitHub-side hiccup,
     not a real conflict.
6. Update the PR description if the scope materially changed.

Do not treat a passing lightweight Markdown check as proof that the production Docusaurus build passes.

### 9. Address review feedback

When review findings arrive:

1. Read the complete review thread and inspect the referenced repository evidence.
2. Confirm whether the finding still applies to the latest commit.
3. Address valid findings without unnecessarily rewriting the post.
4. Re-run all relevant validation.
5. Commit and push the corrections.
6. Resolve a thread only when the validated fix directly satisfies it; leave
   ambiguous findings unresolved and report them.
7. Re-arm auto-merge against the replacement validated head SHA.
8. Report which findings were addressed and whether auto-merge is armed.

- **Tool:** `blog_pr_comments({ pr, unresolvedOnly: true })` to list open threads — check this even when `gh pr view --json reviewRequests,latestReviews` shows nothing: a bot-posted review (this repository has `qodo-code-review` configured) leaves unresolved conversation threads without appearing as a requested reviewer, and `required_conversation_resolution` blocks the merge on them regardless. There is no `blog_resolve_review_thread` tool yet; resolve via `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<threadId>`.
- **Fallback:** the GraphQL `reviewThreads` query in `.agents/workflows/publish-change.md` §3.

Do not post a review reply unless explicitly requested.

### 10. Confirm automatic publication

Report publication proactively after the deployment and HTTPS route check are
successful. Do not require a user to click Merge, authorize an already armed
merge, or ask separately for the public URL. If deployment or route validation
fails, report the failure and do not present a post URL as published.

**Hard rule:** never state or imply a published URL until the `Docs Deploy` run
for that exact merge commit shows `completed`/`success`. A merged PR is not a
deployed site — deploy runs after merge and takes its own time. Poll the run
status until it finishes; do not report the URL as done based on the merge
alone. `blog_verify_published_url` enforces this structurally: `mergeCommitSha`
is a required input, and there is no code path in it that returns a URL
without a confirmed successful deploy. This rule is authoritative regardless
of tool availability.

After merging, report:

- PR link
- target branch
- merge method
- resulting merge commit SHA
- deployment result
- canonical published post URL
