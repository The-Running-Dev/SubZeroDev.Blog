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
| `/` | `README.md`, generated into `docs/src/pages/index.md` | Repository homepage |
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
