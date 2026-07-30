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
