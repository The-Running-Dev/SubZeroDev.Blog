# Publish a Repository Change

Use this workflow for code, styling, configuration, documentation, and blog
changes in this repository. It turns a validated branch into a protected,
automatically merged pull request without requiring a user to watch checks or
click Merge.

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
3. Preserve unrelated work and stage only files that belong to the change.
4. Run every applicable local validation command from `AGENTS.md`.
5. Review the final diff, then commit and push the exact validated change.

## 2. Create a ready PR

Open a ready pull request into `main` with a body that explains the change, its
impact, and the validation performed. Create a draft only when the user
explicitly asks to hold the work, keep it a draft, or disable auto-merge.

Capture the exact validated head SHA after the push:

```powershell
$headSha = git rev-parse HEAD
```

## 3. Apply the right review lane

### Post-only changes

For a post, tag, author, or other editorial-only change that the user supplied
or approved, arm automatic merge immediately after the ready PR is created.

### Code, styling, configuration, and workflow changes

Use any available automated review before arming auto-merge. Address valid
findings, re-run validation, push the correction, and refresh `$headSha`.

If no automated reviewer is available, state that fact in the PR handoff; do
not invent a human approval requirement that the repository does not enforce.

## 4. Arm automatic squash merge

Use the repository's allowed squash strategy and bind it to the exact validated
head commit:

```powershell
gh pr merge <pr-url-or-number> --auto --squash --match-head-commit $headSha
```

GitHub keeps the PR open until every protected-branch requirement passes. Do
not merge directly, bypass protection, or wait manually for successful checks.
The repository removes the remote branch automatically after the merge.

## 5. Handle exceptions

If a required check fails, a review thread blocks the PR, or the head changes:

1. Inspect the concrete failure or full review thread.
2. Make the smallest valid correction.
3. Re-run applicable validation and push the new commit.
4. Resolve a review thread only when the validated fix directly satisfies it;
   otherwise leave it open and report the ambiguity.
5. Recompute `$headSha` and arm auto-merge again.

Report the PR URL, head SHA, whether auto-merge is armed, and any unresolved
exception. On a successful path, GitHub merges and triggers the existing Pages
deployment without further user action.
