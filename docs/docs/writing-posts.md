---
title: Writing Posts
sidebar_position: 5
---

# Writing Posts

Blog posts live in `docs/blog/`. The blog index is published at `/`, and posts
are published directly below it. The source tree, front matter, and production
build are the authoritative record of what is published.

## Create a Post

Copy the reusable template to a date-prefixed Markdown filename:

```powershell
Copy-Item docs/blog/_post-template.md docs/blog/YYYY-MM-DD-post-slug.md
```

Replace every placeholder in the copied file. The front matter requires a
specific title, one-sentence description, stable slug, author key, publication
date, and at least one predefined tag:

```md
---
title: Clear, specific title
description: One-sentence summary for readers and metadata.
slug: post-slug
authors:
  - subzerodev
date: YYYY-MM-DDTHH:MM:SSZ
tags:
  - ai-assisted-engineering
---
```

Use an explicit UTC `Z` suffix so publication metadata and feeds remain
reproducible across build environments. Keep the `<!-- truncate -->` marker
after the introduction so the blog index shows a useful summary rather than the
complete post.

The template is deliberately excluded from Docusaurus discovery. Its
placeholder tag is also undeclared, so a copied post cannot build until the
author replaces it with a valid tag.

## Choose Tags

Tags are a controlled vocabulary defined in `docs/blog/tags.yml`. Use the
smallest set that accurately describes the post:

| Key | Use for |
| --- | --- |
| `site-updates` | Changes to the blog, publishing workflow, or public structure |
| `ai-assisted-engineering` | Practical AI use across software engineering |
| `automation` | Repeatable tooling or workflows that replace manual operations |
| `projects-as-code` | Declarative, version-controlled project systems and governance |

Do not invent an inline tag in a post. Add a new tag to `tags.yml` only when it
is durable enough to categorize multiple current or expected posts. Each tag
needs a unique key, permalink, reader-facing label, and description. The
production build rejects undeclared tags.

Keep each post factual. Describe only behavior that is present in the linked
source or provide an external source for material claims. Never publish keys,
tokens, private configuration, or unpublished customer information.

## Preserve Published Routes

Treat every published `slug` as a permanent public route. Editing a post must
not change its slug. If a route must move, add and verify a compatibility route
for the old URL before changing the canonical slug, then document both routes
in the architecture page.

Reader discovery is published at:

- `/archive/` for the chronological archive;
- `/tags/` for the tag index;
- `/tags/<tag-permalink>/` for a tag's posts;
- `/rss.xml` for RSS;
- `/atom.xml` for Atom.

## Review and Publish

1. Preview the post with `./docs.ps1`.
2. Run `./build/Test-Documentation.ps1`.
3. Build with `./docs.ps1 -BuildOnly`.
4. Validate the result with `./build/Test-DocumentationArtifact.ps1`.
5. Open a pull request and wait for the required documentation checks.
6. After squash merge, GitHub Pages publishes the post from `main`.

The post route is normally `/<slug>/`. Confirm the deployed route after the
Pages workflow completes, and confirm the post appears on the expected tag,
archive, RSS, and Atom surfaces.
