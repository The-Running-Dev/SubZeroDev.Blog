# Create and Publish a Blog Post

Work in the specified GitHub repository and complete the entire branch-to-PR workflow.

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
date: <YYYY-MM-DD>T00:00:00
tags:
  - <existing-tag-key>
---
```

The author must reference a valid author defined by the repository. Every tag must reference a key already declared in `docs/blog/tags.yml`.

If the supplied post needs new tags:

1. Add the required keys to `docs/blog/tags.yml`.
2. Follow the existing tag structure and permalink conventions.
3. Ensure tag permalinks remain unique.
4. Do not add unnecessary tags.

Preserve the supplied article wording exactly unless changes are required for Markdown validity or the user explicitly requests editing.

Add the repository’s excerpt marker in a natural position near the beginning of the post:

`<!-- truncate -->`

Do not place the marker inside the front matter, a paragraph, blockquote, or other Markdown construct.

### 5. Validate locally

Run the repository’s documented validation commands. At minimum, verify:

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

Review the final diff and confirm that it contains only the intended post and any necessary tag definitions.

### 6. Commit and push

Commit all intended changes with:

`<commit-message>`

Push `<branch-name>` to the remote repository. Verify that the remote branch contains the same commit/tree as the validated local changes.

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

After creating the PR, capture the exact validated commit SHA and enable
automatic squash merge:

```powershell
$headSha = git rev-parse HEAD
gh pr merge <pr-url-or-number> --auto --squash --match-head-commit $headSha
```

This does not bypass repository protection: GitHub merges only after all
required checks pass, the branch is current when required, and all review
threads are resolved. The repository deletes the remote branch after merge.

Do not wait for successful checks or click Merge manually. Report the PR URL,
the validated head SHA, and that auto-merge is armed.

### 8. Handle exceptions instead of watching CI

GitHub owns the successful-check path after auto-merge is armed. If the agent
is still monitoring and CI fails, or if review feedback arrives before merge:

1. Inspect the failing job, logs, or full review thread.
2. Make only the changes required to fix the valid finding.
3. Re-run all relevant local validation.
4. Commit and push the correction.
5. Capture the replacement head SHA and arm auto-merge again with that SHA.
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

Do not post a review reply unless explicitly requested.

### 10. Confirm automatic publication when requested

When asked for status or after GitHub reports completion, confirm that the PR
merged with the allowed squash strategy and that the deployment workflow began.
Do not require a user to click Merge or to authorize a merge that was already
armed automatically.

After merging, report:

- PR link
- target branch
- merge method
- resulting merge commit SHA
