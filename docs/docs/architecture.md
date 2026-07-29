---
title: Architecture
sidebar_position: 3
---

# Architecture

The site is a small consumer overlay on a shared Docusaurus container image.
This keeps shared theme and build behavior centralized while allowing the blog
to own its content, routes, and deployment settings.

## Route ownership

| Route | Source | Ownership |
| --- | --- | --- |
| `/` | Blog index generated from `docs/blog/` | Blog listing |
| `/<slug>/` | Markdown under `docs/blog/` | Authored blog post |
| `/archive/` | Docusaurus blog archive | Chronological discovery |
| `/tags/` | `docs/blog/tags.yml` | Controlled tag index |
| `/tags/<tag-permalink>/` | Post front matter and `docs/blog/tags.yml` | Tagged-post discovery |
| `/rss.xml`, `/atom.xml` | Docusaurus production build | Syndication feeds |
| `/blog/**` | Pages under `docs/src/pages/blog/` | Legacy-route compatibility |
| `/docs/` | `docs/docs/index.md` | Generated documentation landing page |
| `/docs/**` | Markdown under `docs/docs/` | Authored project documentation |

## Build boundary

The `docs/` directory is copied over the shared template during a build.
Repository files can configure Docusaurus and add content, but shared
components, theme behavior, and build scripts remain owned by the
[Docusaurus Template](https://github.com/The-Running-Dev/Docusaurus-Template).

All four build references pin the same immutable container digest:

- `docs/Dockerfile`
- `docs.ps1`
- `.github/workflows/docs-ci.yml`
- `.github/workflows/docs-deploy.yml`

## Delivery

Pull requests run the documentation gate and a production build. A push to
`main` builds the same overlay and deploys the resulting static artifact to
GitHub Pages at the custom domain.

After each production build, `build/Test-DocumentationArtifact.ps1` verifies
the canonical routes, compatibility pages, archive, predefined tag pages, and
RSS and Atom feeds before the artifact can be uploaded.

The compatibility pages under `/blog/` emit an HTML meta refresh for clients
without JavaScript, repeat the redirect after hydration, and retain a visible
fallback link. Keep them while previously published links may still be in use.
