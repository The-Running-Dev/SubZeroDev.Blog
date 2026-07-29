---
title: Writing Posts
sidebar_position: 5
---

# Writing Posts

Blog posts live in `docs/blog/`. The blog index is published at `/`, and posts
are published directly below it. The source tree, front matter, and production
build are the authoritative record of what is published.

## Create a post

Use a date-prefixed Markdown filename:

```text
docs/blog/YYYY-MM-DD-post-slug.md
```

Include this front matter and replace each value with the post's real details:

```md
---
title: Clear, specific title
description: One-sentence summary for readers and metadata.
slug: post-slug
authors:
  - subzerodev
---
```

Keep each post factual. Describe only behavior that is present in the linked
source or provide an external source for material claims. Never publish keys,
tokens, private configuration, or unpublished customer information.

## Review and publish

1. Preview the post with `./docs.ps1`.
2. Run `./build/Test-Documentation.ps1`.
3. Open a pull request and wait for the required documentation checks.
4. After squash merge, GitHub Pages publishes the post from `main`.

The post route is normally `/<slug>/`. Confirm the deployed route after the
Pages workflow completes.
