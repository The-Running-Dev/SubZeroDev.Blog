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

## Milestone 3: Blog-first routing — in progress

- Serve the blog index at the site root, `/`.
- Serve posts directly below the root, beginning with `/welcome/`.
- Keep project documentation under `/docs/`.
- Retire the generated README homepage so each public route has one owner.
- Preserve `/blog/` and `/blog/welcome/` as compatibility routes.
- Update repository guidance, examples, and validation expectations.
- Verify the documentation gate, production build, and representative routes.

## Milestone 4: Editorial metadata and discovery — planned

- Define a small, stable tag vocabulary when a second substantive post exists.
- Add a reusable post template with the required front matter.
- Verify RSS metadata and archive navigation in production.
- Document how route changes preserve or redirect previously published links.

## Milestone 5: Repeatable publishing — planned

- Publish substantive posts based on real SubZeroDev project work.
- Add validation for post front matter and duplicate slugs.
- Define a lightweight editorial review checklist from recurring review
  findings.

Milestones 4 and 5 should be refined from repository evidence before
implementation; they are direction, not claims about current behavior.
