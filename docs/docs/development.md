---
title: Development
sidebar_position: 4
---

# Development

## Authoring

Edit the repository root `README.md` for the GitHub repository homepage. Add
project documentation as Markdown under `docs/docs/`, and blog posts under
`docs/blog/`. The blog index owns the public site root.

The generated `docs/docs/index.md` file must not be edited directly.

## Writing posts

Create a Markdown file under `docs/blog/` with a date-prefixed filename, for
example `YYYY-MM-DD-post-slug.md`. Each post needs front matter with `title`,
`description`, `slug`, and `authors`; see [Writing Posts](./writing-posts.md)
for the complete workflow.

Post slugs are served directly below the site root. A post with
`slug: example` is published at `/example/`.

## Validation

Run the documentation gate:

```powershell
./build/Test-Documentation.ps1
```

Then check whitespace and the worktree:

```powershell
git diff --check
git status --short --branch
```

The production build runs through Docker:

```powershell
./docs.ps1 -BuildOnly
```

## Pull requests

Use a focused branch and open a draft pull request. The pull request must pass
both documentation checks before it is made ready and squash merged:

- `Documentation links and terminology`
- `Verify Documentation Build`

The deployment job runs only after changes reach `main`; it must not be
configured as a pull-request requirement.
