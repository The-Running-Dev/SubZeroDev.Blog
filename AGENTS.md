# Repository Guidelines

## Project identity and boundary

This repository owns the SubZeroDev Blog site at
`https://blog.subzerodev.com/`, its authored documentation, and its GitHub Pages
delivery configuration. It does not own the shared Docusaurus runtime; that is
provided by the immutable `ghcr.io/the-running-dev/docs-template` image.

The repository is currently an initial scaffold. Do not describe article
publishing or application features as implemented until their source and
validation exist here.

## Safe start

Before editing:

1. Run `git status --short --branch`, `git remote -v`, and `rg --files`.
2. Read this file and the relevant source or documentation files completely.
3. Preserve unrelated work and never commit secrets, caches, or generated build
   output.
4. Work on a focused branch; do not force-push or rewrite published history.

## Layout and ownership

- `README.md`: authoritative site-root content and repository homepage.
- `docs/blog/`: authored blog posts served below `/blog/`.
- `docs/docs/`: authored documentation served below `/docs/`.
- `docs/src/pages/index.md`: generated site root; never edit directly.
- `docs/docs/index.md`: generated minimal `/docs/` landing page; never edit
  directly.
- `docs/docusaurus.config.ts`: consumer-owned site and route configuration.
- `docs/sidebar.ts`: documentation navigation.
- `docs/Dockerfile`, `docs.ps1`, `.github/workflows/docs-*.yml`: installer-owned
  build and delivery files.
- `build/ConvertTo-DocumentationHomepage.ps1`: homepage generator.
- `build/Test-Documentation.ps1`: documentation quality gate.
- `.config/DocumentationRules.psd1`: generated-file and terminology rules.
- `artifacts/`: local build output; never commit.

Shared theme and build behavior belong in
`The-Running-Dev/Docusaurus-Template`. Keep this repository's changes limited
to its overlay, content, and configuration.

## Documentation workflow

The README owns `/`; authored documentation owns `/docs/`. To change the site
homepage, edit `README.md`, then regenerate the checked-in pages:

```powershell
./docs.ps1 -BuildOnly
```

Do not edit generated index pages directly. Add authored pages under
`docs/docs/` with front matter and deterministic `sidebar_position` values.
Use absolute published links in the README.

Author blog posts under `docs/blog/` using a date-prefixed filename such as
`YYYY-MM-DD-slug.md`. Include `title`, `description`, `slug`, and `authors` in
front matter. Preview the route locally and ensure the post makes only claims
supported by repository source or cited material.

The docs system is installed and upgraded through the shared template's
supported `Invoke-SetupDocs` interface. Before upgrading, inspect the template
instructions, resolve the current container digest, dry-run the installer, and
update every immutable image reference together.

## Validation

Run all checks that apply:

```powershell
./build/Test-Documentation.ps1
./docs.ps1 -BuildOnly
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
- Generated pages match `README.md`.
- Authored links, anchors, and terminology pass the gate.
- The immutable docs image digest is consistent in all installer-owned files.
- Production docs build and deployment checks pass.
- `/`, `/docs/`, and representative authored routes work over HTTPS.
- The worktree is clean and local `main` matches `origin/main`.
