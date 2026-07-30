# SubZeroDev Blog Milestones

This plan tracks deployable outcomes for the blog. A milestone is complete only
when its pull-request checks pass and its representative public routes are
verified after deployment.

## Milestone 1: Repository foundation — complete

- Establish repository guidance, hygiene, licensing, and branch protection.
- Install the pinned shared Docusaurus documentation system.
- Publish project documentation under `/docs/`.
- Configure GitHub Pages for `blog.subzerodev.com`.

Delivered in pull request
[#2](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/2).

## Milestone 2: First publishable post — complete

- Enable Docusaurus blog content.
- Add the inaugural post and author metadata.
- Document the post-authoring and review workflow.

Delivered in pull request
[#3](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/3).

## Milestone 3: Blog-first routing — complete

- Serve the blog index at the site root, `/`.
- Serve posts directly below the root, beginning with `/welcome/`.
- Keep project documentation under `/docs/`.
- Retire the generated README homepage so each public route has one owner.
- Preserve `/blog/` and `/blog/welcome/` as compatibility routes.
- Update repository guidance, examples, and validation expectations.
- Verify the documentation gate, production build, and representative routes.

Delivered in pull request
[#4](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/4).

## Milestone 4: Editorial metadata and discovery — complete

- Define and enforce a small, stable tag vocabulary.
- Add a reusable post template with required front matter.
- Configure and verify tag, archive, RSS, and Atom discovery in production.
- Document how route changes preserve previously published links.
- Validate all discovery surfaces before a production artifact is uploaded.

Delivered in pull request
[#8](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/8).

## Milestone 5: Repeatable publishing — planned

- Publish substantive posts based on real SubZeroDev project work.
- Add validation for post front matter and duplicate slugs.
- Define a lightweight editorial review checklist from recurring review
  findings.

Milestone 5 should be refined from repository evidence before implementation;
it is direction, not a claim about current behavior.

## Milestone 6: Curated content paths — planned

- Publish stable landing pages for the Lucifer Chronicles, AI-Assisted
  Engineering, and State of Dev series.
- Publish a stable project landing page for the Game Engine.
- Curate each page into a useful reading path while retaining tags for
  cross-cutting discovery.
- Expose the hubs through the primary site navigation and verify their
  production routes after deployment.

## Milestone 7: Deterministic publishing tools — in progress

Publishing has been driven by an agent reading prose instructions in
`AGENTS.md` and `.agents/workflows/`. Every step those documents describe is
mechanically deterministic; `tools/blog-mcp/` exposes them as MCP tools so an
agent no longer has to remember to get them right by reading prose.

- Phase 1–3 (read-only): front-matter validation (delivers this plan's
  Milestone 5 "validation for post front matter and duplicate slugs" bullet
  outright), content-hub coverage validation, and wrappers around
  `build/Test-Documentation.ps1` and `build/Test-DocumentationArtifact.ps1`.
- Phase 4–5 (local, reversible): post/tag/hub authoring writes and local git
  (branch, stage, commit) behind a shared write-path allowlist.
- Phase 6 (delivered): remote tools (`blog_push`, `blog_create_pr`,
  `blog_arm_auto_merge`, `blog_pr_status`, `blog_pr_comments`), gated behind
  `BLOG_MCP_ALLOW_REMOTE`, off by default. No merge tool exists other than
  arming GitHub's own auto-merge; a GitHub token is never written to disk in
  the container.
- Phase 7 (planned): CI and deploy monitoring, encoding as code the rule
  that a published URL is never reported before the `Docs Deploy` run for
  the exact merge commit shows `completed`/`success`.
- Phase 8 (planned): an HTTP/SSE transport alongside the default stdio one.

See `tools/blog-mcp/README.md` for the current tool catalogue and what each
phase still owes.
