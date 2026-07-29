# Repository Guidelines

## Project identity and boundary

This repository owns the SubZeroDev Blog site at
`https://blog.subzerodev.com/`, its authored documentation, and its GitHub Pages
delivery configuration. It does not own the shared Docusaurus runtime; that is
provided by the immutable `ghcr.io/the-running-dev/docs-template` image.

The blog is published at the site root. Do not describe additional application
features as implemented until their source and validation exist here.

## Safe start

Before editing:

1. Run `git status --short --branch`, `git remote -v`, and `rg --files`.
2. Read this file and the relevant source or documentation files completely.
3. Preserve unrelated work and never commit secrets, caches, or generated build
   output.
4. Work on a focused branch; do not force-push or rewrite published history.

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

## Git and pull requests

Use focused commits with concise conventional messages. Open a draft pull
request first. Required PR checks are:

- `Documentation links and terminology`
- `Verify Documentation Build`

Do not require the merge-only deployment job. Make the PR ready and squash
merge only after required checks pass. Protect `main` with required pull
requests, successful checks, conversation resolution, and blocked force pushes
and deletions.

## Completion checklist

- Public claims match source and current behavior.
- Authored links, anchors, and terminology pass the gate.
- The immutable docs image digest is consistent in all installer-owned files.
- Production docs build and deployment checks pass.
- `/`, `/welcome/`, `/docs/`, and representative authored routes work over
  HTTPS.
- The worktree is clean and local `main` matches `origin/main`.
