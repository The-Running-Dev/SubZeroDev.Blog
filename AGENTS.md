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
- `.config/blog.json`: machine-readable publishing configuration shared by
  the authoring workflow and `tools/blog-mcp/`.
- `tools/blog-mcp/`: MCP server exposing this repository's deterministic
  publishing steps (front-matter validation, post authoring, tag and hub
  maintenance, local git) as callable tools. See
  `tools/blog-mcp/README.md`.
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

`tools/blog-mcp/` wraps the same checks (plus front-matter, duplicate-slug,
and content-hub validation that nothing else in this repository enforces) as
callable MCP tools, and carries its own build and test suite:

```bash
cd tools/blog-mcp
npm install
npm run build
npm test
```

These tools reuse `build/Test-Documentation.ps1` and
`build/Test-DocumentationArtifact.ps1` unmodified rather than
reimplementing them, so the two never drift apart. See
`tools/blog-mcp/README.md`.

## Git and pull requests

Use focused commits with concise conventional messages. After the applicable
local validation passes, open a ready pull request and arm automatic squash
merge against the exact validated head commit. Use a draft pull request only
when the user explicitly requests a hold, a draft, or no auto-merge.

Stage only files that belong to the change, named explicitly. Never run
`git add -A` or `git add .`: a broad add can silently sweep up unrelated
working-tree state. `tools/blog-mcp`'s `blog_stage` tool enforces this as an
explicit path allowlist rather than relying on the same discipline by hand.

For a post-only change, arm auto-merge immediately after publishing the PR.
For code, styling, configuration, or workflow changes, run any available
automated review and address valid findings before arming auto-merge. Required
PR checks are:

- `Documentation links and terminology`
- `Verify Documentation Build`

Do not require the merge-only deployment job. Enable GitHub auto-merge with
the allowed squash strategy and the exact validated head SHA; GitHub will merge
only after the required checks and conversation resolution pass. If the head
changes, revalidate it and arm auto-merge again with the new SHA. Protect
`main` with required pull requests, successful checks, conversation resolution,
and blocked force pushes and deletions.

After a validated fix directly satisfies a review thread, resolve that thread
so it cannot keep auto-merge blocked. Leave ambiguous findings unresolved and
report them instead.

After auto-merge is armed, the agent must monitor the two required checks for
the exact head SHA and report their outcome. After merge, monitor the `Docs
Deploy` workflow for the resulting merge commit. For a new or changed blog
post, verify its canonical HTTPS route after deployment succeeds and report the
published URL. Do not claim a post is published when the deployment or route
verification failed.

**Hard rule:** never state or imply a published URL until the `Docs Deploy` run
for that exact merge commit shows `completed`/`success`. A merged PR is not a
deployed site. Poll the run status (`gh run list` / `gh run watch`) until it
finishes — do not estimate timing or report the URL "as good as done."

## Completion checklist

- Public claims match source and current behavior.
- Authored links, anchors, and terminology pass the gate.
- The immutable docs image digest is consistent in all installer-owned files.
- Production docs build and deployment checks pass.
- `/`, `/welcome/`, `/docs/`, and representative authored routes work over
  HTTPS.
- The worktree is clean and local `main` matches `origin/main`.
