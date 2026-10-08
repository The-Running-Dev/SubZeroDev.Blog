# Brief — Journal + Chronicles

> The problem, the non-goals and the definition of done are mine. A model may interrogate this
> file (`/brief`) or type it from my answers (`/interview`). It may not originate it from an idea.

Transcribed on 2026-10-08 from the owner's handoff *Redesign the Blog as Journal + Chronicles*
and the owner's approval of the `/design` premises the same day. The handoff's metadata and
route examples are illustrative; the implementation adapts to the actual codebase.

## Problem

The blog has about 50 published entries and about 78 more queued as open pull requests. It is
a mix of personal stories, observations, philosophy, comedy, technical writing, experiments and
ongoing narratives — a collection of thoughts and experiences, not a conventional chronological
publication.

Publication dates do not represent when events happened, when ideas originated, or how stories
connect. A story published today may describe something from twenty years ago; another published
months later may directly continue it. The home page, the paginated list and most navigation sort
by publication date, so the growing archive is increasingly hard to explore.

Organizing principle: **chronology is metadata; connections are navigation.** The publication
date still exists but does not determine the primary reading experience.

## What we do instead today (and what it costs)

- `/` is a reverse-chronological feed; `/archive/` and `/page/N` are chronological too.
- Five hand-maintained series pages under `/series/*`, one project page
  (`/projects/game-engine/`) and the reading list on `/about/` are the only curated collections.
  Each is a hand-written list; `tools/blog-mcp` adds entries to them and warns when a post
  carrying the hub's tag is missing. A newly published post with a qualifying tag needs a hub edit
  to be listed, and on 2026-10-08 four hubs were already missing posts their own rules match.
- Topics exist as 35 controlled tags with `/tags/*` pages, but nothing presents entries by
  subject, by story, or by relationship between entries.

Cost: readers can only follow the archive by publication order, and every curated collection is
a manual maintenance step that the publishing queue does not perform.

## Who it is for

Readers of `https://blog.subzerodev.com/`, and one author (me) who publishes through the existing
pull-request queue and `tools/blog-mcp` scheduler.

## Model

- **Journal** — the complete collection of published entries. An entry stands on its own; it needs
  no date, chronological context, or chronicle membership to be meaningful. The post is the
  canonical source of content and has exactly one canonical URL.
- **Chronicles** — curated collections of related Journal entries: narratives, recurring themes,
  episodic collections. Chronicles are **views over entries**, never copies. One entry may belong
  to several chronicles or to none.
- **Topics** — the existing 35 approved tags. There is no second topic taxonomy. Chronicles are
  curated collections, not replacements for Topics.
- **Membership is hybrid.** Configured tag-to-chronicle relationships determine membership
  automatically; a registry adds explicit inclusion and exclusion of individual posts. A post with
  no matching relationship remains an ordinary Journal entry. A queued post carrying a qualifying
  tag appears in its chronicle when published, with no further pull request.
- **Automatic membership arrives incrementally.** The existing hand-curated lists are the initial
  authoritative membership. Tag relationships are enabled per chronicle, each as a reviewed change
  backed by an old-versus-new membership comparison. No tag maps to a chronicle implicitly; broad
  tags such as `stories` or `philosophy` join a chronicle only through an intentional mapping.
- **Membership and reading order are separate concerns.** Membership can be automatic. Reading
  order is curated explicitly in the registry, with a deterministic fallback for entries not yet
  curated. Publication order is not assumed to be narrative order.
- **Editorial presentation state lives in the registry**, not in posts: featured entries,
  membership rules and overrides, chronicle order, recommended starting points, chronicle
  descriptions and presentation metadata.
- **Three dates stay distinct:** publication date (when an entry became public), event date (when
  the described event happened, if known), and reading order (sequence within a chronicle). They
  are never conflated, an event date is never inferred from a publication date, and authors are
  never required to reconstruct dates of old memories.

## Non-goals

- Rebuilding the site on a different framework.
- Introducing a CMS without a separate decision.
- Rewriting article content as part of structural migration.
- Forcing all entries into fixed categories, or requiring every entry to belong to a chronicle.
- Inventing dates for historical experiences.
- Duplicating articles for different chronicles, or giving an article more than one canonical URL.
- Automatically publishing queued content, or classifying queued content in advance.
- AI-generated topic classification as a mandatory dependency.
- A second topic taxonomy alongside the existing tags.
- New required front-matter fields, or a mandatory metadata migration of existing posts.
- New per-post metadata in the MVP (event date, content type, cover image) without a demonstrated
  requirement.
- A backend service, database, vector store, or runtime API.
- Reclassifying `/projects/game-engine/` as a personal chronicle; it keeps its identity as a
  project hub, though it may share implementation with chronicles.
- Overengineering chronicle ordering or relationship storage.
- Making the writing more conventional: the purpose is to make an unconventional body of writing
  discoverable, not to force it into a rigid editorial format.

## Definition of done

- The home page at `/` no longer presents a chronological feed as its primary experience, and
  chronological browsing (`/`, `/page/N`, `/archive/`) still reaches every published entry with no
  gap and no duplicate.
- Every published entry is reachable through the Journal.
- Chronicles are independently browsable; each has a landing page with title, description, its
  entries, optional reading order and starting point, and links to related chronicles.
- An entry may belong to several chronicles without duplication, and may belong to none.
- Chronicle membership follows configured tag relationships plus explicit registry inclusions and
  exclusions; once a chronicle's tag relationship is enabled, a post merged by the existing
  scheduler with a qualifying tag appears in that chronicle with no manual synchronization step.
- Only published, publicly listed entries appear in any discovery surface: the Journal, chronicles,
  related entries and random selection. Generated links use each entry's canonical permalink.
- Reading order within a chronicle does not depend on publication date; uncurated entries fall
  back to a deterministic order.
- Unknown event dates remain unknown.
- A Journal entry page shows its topics and chronicles, related entries, and previous/next within
  a chronicle where an order exists, distinguishing the reading path when an entry is in several
  chronicles — without a duplicate page per chronicle.
- Readers can discover related entries and reach a random published entry without a backend.
- The Journal can be searched and filtered by topic and chronicle; full-text search stays with the
  existing search implementation.
- A build-time index carries only discovery metadata (title, description, canonical URL,
  topics, chronicle memberships, optional presentation metadata) for published entries only.
- Every existing URL keeps working: post URLs, `/archive/`, `/page/N`, `/series/*`,
  `/projects/game-engine/`, `/tags/*`, RSS and Atom feeds, sitemap and canonical URLs. Legacy
  routes the new routing must move are preserved or redirected; no redirect is introduced only
  for naming consistency.
- Routes: `/` is the Journal home, `/journal/` the Journal index, `/chronicles/` the chronicle
  landing page, and `/series/<id>/` the canonical route of every individual chronicle, existing
  and new. The interface calls them Chronicles; the `/series/` prefix stays.
- The ~78 queued post-only pull requests merge without modification, and the scheduler works
  exactly as before. A post it merges becomes discoverable in the Journal, search, its topics and
  qualifying chronicles automatically.
- Existing `tools/blog-mcp` hub tools keep working, repointed to the new registry rather than
  removed; validation supports automatic membership plus explicit overrides; tool-contract changes
  are recorded in the decision log; existing automation keeps functioning.
- Desktop and mobile navigation work.
- Builds and existing tests pass.

## Narrowest useful version

Journal landing page, Chronicles landing page, individual chronicle pages, hybrid chronicle
membership, the new home page, topic-based discovery, basic related-entry links and the published
entry index — validated against existing published content and the existing `/series/*`
infrastructure before the rest of the archive is enriched.

## Environment

Static site on GitHub Pages, Docusaurus via the pinned `docs-template` image. One author. Hundreds
to low thousands of entries over time. Publishing is the existing pull-request queue merged by the
`tools/blog-mcp` scheduler. Single-user authoring; readers anonymous; no runtime services.

## Lifespan

Maintained for years. The journal must grow to hundreds or thousands of entries; chronicles may
appear, grow, merge, or remain unfinished, and the architecture accommodates that without
reorganizing the site.
