# Design — Journal + Chronicles

Derived from [`00-brief.md`](00-brief.md). Approach A, a build-time plugin plus a registry, was
approved on 2026-10-08 with seven corrections. All seven are designed in below. Approaches B
(committed generated index) and C (wrapping the blog plugin) were rejected; see
*Alternatives considered*. The decisions that survive are logged in [`90-decisions.md`](90-decisions.md).

**Primary invariant.** A queued Markdown-only pull request merges unmodified, and the next site
build includes the new post correctly on every discovery surface. Nothing has to be synchronized
by hand. Every section below is checked against this invariant.

Facts this design rests on, verified against the repository and the pinned base image on
2026-10-08:

- **Docusaurus 3.10.1 on Node 26**, from `ghcr.io/the-running-dev/docs-template@sha256:f2e9df53…`.
  Only `docs/` reaches the build. The image already ships `js-yaml`. Node 26 runs TypeScript
  directly and includes a test runner.
- **The blog plugin's loaded content** is a list of posts, each with `metadata`. Metadata carries
  `permalink`, `title`, `description`, `date`, `tags` as `{label, permalink}`, `unlisted` and
  `frontMatter`. Drafts are dropped while loading in production. List pages show only posts that
  are not `unlisted`. `postsPerPage` is the default of 10.
- **`allContentLoaded` exists but is undocumented.** It receives every plugin's loaded content
  and can add routes, create data and set global data. The `blogListComponent` option, by
  contrast, is documented.
- **The posts.** There are 50, all with a front-matter `slug` that matches the file name. No post
  is draft or unlisted. No published slug, and no open `blog/*` branch name, uses `journal`,
  `chronicles` or `random`.
- **The hubs are hand-written lists.** Seven hubs exist in `.config/blog.json`: five series, the
  game-engine project, and `/about/`. `blog_validate_hubs` reports a missing post only as a
  warning, so the lists have drifted. Posts matching a hub's own rule but not listed:
  - `lucifer`: 2
  - `ai-assisted-engineering`: 2
  - `state-of-dev`: 1 (the `state-of-dev-` slug prefix)
  - `game-engine`: 3 posts carry the tag, but the hub has no rule.
- **The scheduler does very little.** It only checks PR status and merges, and it never runs
  hub validation. Every pull request runs Docs CI. Every push to `main` builds, runs
  `Test-DocumentationArtifact.ps1` and deploys only if that passes.

## Data model

### Entities

| Entity | Source | Persisted? | Identity | Lifecycle |
|---|---|---|---|---|
| **Post** | `docs/blog/*.md`, authored | Yes, in git | Canonical permalink | Created by a merged post PR. Never edited by this system. |
| **Topic** | `docs/blog/tags.yml`, authored | Yes, unchanged | Tag key, which maps to a tag permalink | As today |
| **Registry** | `docs/blog/chronicles.yml`, authored | Yes, in git | One file | Edited by hand or through blog-mcp, as an ordinary reviewed PR |
| **Collection** | One record in the registry | Yes | `id`: kebab-case, stable, also its URL segment | Created, renamed in title only, or retired by registry PRs. Never moved: an `id` is a public contract. |
| **Entry** | Derived from a public post during the build | No (in memory) | Canonical permalink | Exists for exactly one build |
| **Resolved collection** | Derived: registry, entries and topics | No | Collection `id` | Exists for exactly one build |
| **Route data** | Derived; emitted per generated route | Build output only | Route path | Replaced on every build |
| **Editorial summary** | Derived; site-wide global data | Build output only | One per site | Bounded by the registry, never by the archive |
| **Discovery index** | Derived; one lazily loaded data chunk | Build output only | Content hash | Replaced on every build |

Nothing derived is committed to git. The only files a person edits are posts, which stay exactly
as today, `tags.yml`, which stays exactly as today, and the registry.

### Entry: the adapter's output

An Entry has these fields:

- **`permalink`** (string, canonical, from Docusaurus).
- **`title`** (string).
- **`description`** (string, possibly empty).
- **`publishedAt`** (ISO date string, from the post's `date`).
- **`topics`**: an ordered list of tag keys, resolved from the post's tag permalinks through
  `tags.yml`.
- **`sourcePath`**: kept only for error messages.
- **`public`** (boolean), defined below.

No other post metadata crosses the adapter boundary. Event date, content type and cover image are
not in the MVP, as the brief requires.

### Registry schema

The registry is one YAML document.

**Top level**

- **`version`**: integer, currently `1`. An unknown version fails the build.
- **`featured`**: an ordered list of post references for the Journal home. Optional; empty by
  default.
- **`collections`**: an ordered list. Its order is the display order on `/chronicles/` and in
  the navigation.

**Each collection**

- **`id`**: kebab-case, unique across collections.
- **`kind`**: one of the following.

  | `kind` | Route | Listed on `/chronicles/` and in the Chronicles menu | Shown in the post footer |
  |---|---|---|---|
  | `chronicle` | `/series/<id>/` | Yes | Yes |
  | `project` | `/projects/<id>/` | No; stays under Builds | Yes, labelled as a project |
  | `section` | None; embedded in an existing page (the `/about/` reading list) | No | No |

- **`title`** (required) and **`description`** (required; one paragraph, plain text).
- **`eyebrow`**: optional. Defaults to "Chronicle" or "Project" by kind.
- **`rules`**: optional. Automatic membership, using either or both of:
  - `tags`: a list of tag keys
  - `slugPrefix`: a string
  - `mode` (required when `rules` is present):
    - `suggest`: matching posts are only reported, as uncurated candidates in the build's
      membership report and in blog-mcp's `HubCoverage` warning. They do not join the collection,
      and curating them stays a required authoring step.
    - `apply`: matching posts join the collection automatically.

  An absent or empty `rules` means membership is manual only. No tag is ever mapped to a
  collection implicitly. Enabling a collection's automatic membership is a one-word reviewed
  change from `suggest` to `apply`.
- **`entries`**: an ordered list. Each item is an explicit inclusion and a curated position:
  - `ref` (required): a post reference.
  - `role`: `member` (the default) or `related`. A `related` entry is shown on the page but is not
    a member. It is not on the reading path, not counted, and not shown as a membership on the post.
  - `label`: optional, for example "Part 3", "Start here" or "Spin-off project".
  - `title` and `description`: optional presentation overrides. They default to the post's own
    values. The existing hubs use shortened titles, so this keeps them.
- **`exclude`**: a list of post references removed from rule-based membership.
- **`start`**: optional. A post reference that must be a member. It defaults to the first member
  in reading order.
- **`related`**: a list of collection ids. Links to other collections on the collection page,
  replacing today's hand-written "Related series" hub entries.

**Post references.** A post reference is the bare slug exactly as it appears in the canonical
permalink, for example `lucifer-fly-negotiation`. It is never a file name, never a date, and never
a full URL.

**Why YAML.** YAML allows comments and prose descriptions. It is already the format of
`tags.yml`. The build reads it with the image's `js-yaml`, and blog-mcp edits it with its
existing `yaml` dependency, whose Document API preserves comments and layout.

### Identity rules

- **I1. An entry is its canonical permalink, as Docusaurus assigned it.** The registry resolves
  a reference `x` to the one public entry whose permalink is `/x`. Nothing resolves through file
  names or front matter directly, so a post that overrides its URL is still found by the URL
  readers see.
- **I2. Every generated link uses the entry's canonical permalink.** No route is generated under
  a collection for a post, so being in several collections never creates a second page or a
  second URL.
- **I3. A reference that resolves to nothing fails the build.** That includes a missing post, a
  post that is not public, and a queued post that has not merged yet. The registry can only name
  what exists, which is also why queued posts are never classified in advance.
- **I4. Collection ids are public contracts.** Renaming one is a published-URL change and goes
  through the same rule as a slug.

### Membership and reading order

For a collection C:

- **Members.** The explicit `member` entries, plus every public entry matching C's rules when they
  are in `apply` mode, minus C's `exclude` list and minus C's `related` entries.
- **Precedence.**
  - An explicit inclusion beats having no matching rule.
  - An exclusion beats a matching rule.
  - A `related` entry beats a matching rule. Curating a post as `related` is an explicit
    statement that it is not a member, so a tag or slug-prefix match never promotes it.
  - Naming the same reference in both `entries` and `exclude` is a validation error, not a
    precedence question.
- **Reading order.**
  1. Members listed in `entries`, in their written order.
  2. Then members that arrived only through rules, by `publishedAt` ascending, then by permalink
     ascending.

  The fallback is deterministic and makes no claim to be narrative order. An editor curates
  narrative order by adding an `entries` item.
- **Position.** Each member's 1-based position and its previous and next members are derived
  from reading order. `related` entries have none of these.

**Related entries for an entry E.** Every other public entry is scored by:
- shared `chronicle` or `project` memberships, weighted most heavily, plus
- shared topics, each weighted by its rarity, so that a topic carried by fewer entries counts for
  more.

Ties break by `publishedAt` descending, then permalink. The top four are kept. The exact
weights are fixed in `/spec`. The function is pure and deterministic, and it runs at build time.

### Publication invariants

- **P1. An entry is public when the blog plugin loaded the post and it is not `unlisted`.**
  `draft` posts are treated as not public even in development, where Docusaurus loads them.
  The rule is the same one the blog's own list pages use, so the Journal can never show a post
  the blog hides, or hide one the blog lists.
- **P2. Only public entries appear on discovery surfaces.** That covers:
  - the Journal home, `/journal/` and `/chronicles/`
  - every collection page
  - the editorial summary and the discovery index
  - related entries and random selection

  Non-public posts keep the page Docusaurus gives them, and nothing more.
- **P3. The set of entries in the Journal equals the set the blog lists on `/archive/`.** Each
  appears exactly once.
- **P4. Posts dated in the future follow the blog's behaviour.** Docusaurus lists merged posts
  regardless of date, and the scheduler decides publication by merging. This system adds no date
  gate of its own.

## Module boundaries

```
 page components ──▶ view-model types ◀── discovery core (pure)
        ▲                                     ▲
        │ route data / summary / index        │
 site plugin ──▶ Docusaurus adapter ──▶ blog plugin's loaded content (undocumented shape)
        │
        └──▶ source loader ──▶ registry YAML, tags.yml

 post-footer extension ──▶ client index loader ──▶ generated discovery index

 blog-mcp registry module ──▶ registry YAML (yaml Document API)
        └── shares only a data fixture with the discovery core (no code)
```

Dependencies point one way and there are no cycles. The core depends on nothing.

| Module | Owns | Depends on | Exposes |
|---|---|---|---|
| **Docusaurus adapter** | The only knowledge of the blog plugin's loaded-content shape and of the Docusaurus version | Docusaurus at build time | `Entry[]`, or a contract error |
| **Source loader** | Reading and parsing the registry and `tags.yml` | `js-yaml` from the image; the file system | Plain parsed documents with source positions |
| **Discovery core** | Registry validation, reference resolution, membership, ordering, related entries, reserved routes, view models | Nothing: no Docusaurus, no file system, no YAML | Pure functions and view-model types |
| **Site plugin** | Orchestration: calls the adapter, loader and core, then emits routes, route data, the editorial summary and the discovery index; watches the registry in development | Adapter, loader, core | Generated routes; global data bounded by the registry |
| **Page components** | Rendering the Journal home, `/journal/`, `/chronicles/`, collection pages and `/random/` | View-model types only | React pages |
| **Post-footer extension** | Chronicle paths, previous and next, and related entries on a post page | Client index loader | Wraps the theme's post footer; does not eject it |
| **Client index loader** | Loading the generated index chunk on demand | Docusaurus's generated-data alias | `loadIndex()` that degrades to `null` |
| **blog-mcp registry module** | Editing the registry for `blog_add_hub_entry`; reference validation for `blog_validate_hubs` | `yaml`; the repository checkout | Findings in the existing shape; registry writes |

### The Docusaurus adapter contract

The adapter is the single place where undocumented Docusaurus internals are read. Its contract:

1. **Version guard.** The adapter declares the exact Docusaurus versions it was verified
   against; today that is `3.10.1`. A build on any other version fails, and the error names the
   adapter and the fixture to re-capture. A base-image bump becomes a deliberate re-verification,
   never a silent change.
2. **Locating the content.** It finds the classic preset's blog plugin instance in the content
   passed to `allContentLoaded`. Finding none, or finding more than one, fails the build.
3. **Shape assertions.** Every post must have a non-empty string `permalink` starting with `/`,
   a non-empty `title`, a string `description`, a valid `date`, a `tags` array of
   `{permalink}`, a boolean `unlisted`, and an object `frontMatter`. The first violation fails
   the build. The error names the field, the post's source path and the expected type.
4. **Canaries.** It also fails the build if:
   - zero posts are loaded,
   - two posts share a permalink, or
   - a tag permalink has no `tags.yml` key.

   Warnings are never used: a warning lets a build ship empty chronicles.
5. **Output.** The output is `Entry[]` and nothing else. No Docusaurus type crosses the
   boundary. Page components never receive blog metadata, with one documented exception: the
   home component's page-1 `items`, from the documented `blogListComponent` contract.
6. **Fixture.** A captured sample of the real loaded content from the pinned version, trimmed to
   a few posts and committed, is the adapter's test input. Re-capturing it is part of every
   Docusaurus upgrade.

When Docusaurus 4 arrives, the adapter and its fixture change. The core, the pages and the
registry do not.

## Control flow

### 1. Build: every pull request, and every push to `main`

1. The blog plugin loads posts as it does today. It adds post routes, `/page/N`, `/archive/`,
   `/tags/*`, the feeds and sitemap entries, unchanged.
2. In `allContentLoaded`, the site plugin:
   - calls the adapter, which produces `Entry[]` or fails the build;
   - calls the source loader for the registry and `tags.yml`;
   - asks the core to validate the registry, failing on any error and listing all errors at once;
   - asks the core to resolve memberships, reading order, related entries and the reserved
     routes.
3. The core checks the reserved routes against every entry permalink, tag route and existing
   page route. A collision fails the build. The site also sets `onDuplicateRoutes: 'throw'`, so
   Docusaurus itself enforces the same thing across all plugins.
4. The plugin emits:
   - **Routes**, each with its own route data: `/journal/`, `/chronicles/`, `/random/`, one per
     `chronicle` collection at `/series/<id>/`, and one per `project` collection at
     `/projects/<id>/`.
   - **The editorial summary as global data.** It holds collection cards (id, kind, title,
     description, route, member count, start), the featured entries with title, permalink and
     description, and the topic list with counts. It also holds each `section` collection's
     resolved entries in order: permalink, effective title, effective description and label.
     Section collections have no route of their own, so this is how `/about/` receives its
     reading list. Every part is registry-bounded, so its size grows with the registry and the
     tag count, never with the archive.
   - **The discovery index as one generated data module**, which the browser loads only on
     demand.
   - **A membership report in the build log**: per collection, the explicit members, the members
     added by `apply` rules, the uncurated candidates of `suggest` rules, and the exclusions.
5. The home component, configured through `blogListComponent`, renders the Journal home on page 1
   and the stock list on page 2 onward.
6. CI runs `Test-DocumentationArtifact.ps1` on the output (see *Verification*).

### 2. A queued post is published: the primary invariant

1. The scheduler merges a `blog/*` PR that touches only `docs/blog/<date>-<slug>.md`. The
   registry, blog-mcp and the scheduler are not involved.
2. Docs Deploy builds `main`, following path 1. The new post becomes an Entry. If it is public,
   it appears in:
   - `/journal/`,
   - the home page's Latest section, when it falls on page 1,
   - the discovery index, so Surprise Me and related entries include it,
   - its topics, via the unchanged blog plugin,
   - search, via the unchanged search plugin, and
   - every collection whose enabled rules match its tags or slug, at the end of that
     collection's reading order.
3. If anything is wrong, the build fails and the artifact check refuses the deploy. The site
   stays on the previous build, and the failure is visible on the merge commit's Docs Deploy run.
   A post-only PR can cause such a failure in only one way: its slug claims a reserved route.
   blog-mcp's post validation rejects that before a PR exists (*Failure modes*).

### 3. Editorial change

1. The author edits the registry by hand or with `blog_add_hub_entry`, which adds an `entries`
   item with an optional position. The change is a normal PR.
2. Docs CI builds the PR, so a bad reference fails it there. `blog_validate_hubs` gives the same
   verdict earlier, on the author's machine.
3. On merge, the next build re-resolves everything. There is no derived file to regenerate.

### 4. Reader paths

- **Home to a chronicle to a post, then next.**
  1. The collection page is fully static: entries in reading order, labels, the starting point,
     and related collections.
  2. Following an entry from a collection page records that collection as the current reading
     path, in session storage only. The URL is not changed.
  3. On the post, the footer extension loads the discovery index. It shows the post's topics and
     its chronicle memberships with their positions, then previous and next for each
     membership, with the recorded path first. Related entries follow.
  4. Without the index, because JavaScript is off or the load failed, the footer shows only what
     the theme already shows.
- **Surprise Me.** `/random/` loads the index and navigates to a uniformly chosen public entry
  other than the current one. Its static HTML is a link to `/journal/`. It is excluded from the
  sitemap and marked `noindex`.

## Routing model

| Route | Owner | Rendering | Change |
|---|---|---|---|
| `/` | Blog plugin, with `blogListComponent` | Static Journal home: editorial summary first, then a **Latest** section with exactly the page-1 posts and an "Older entries" link to `/page/2` | Content changes; route unchanged |
| `/page/N` (N ≥ 2) | Blog plugin | Stock theme list | Unchanged |
| `/archive/` | Blog plugin | Stock | Unchanged |
| `/<slug>` | Blog plugin | Stock post page, plus the footer extension | One footer addition |
| `/tags/`, `/tags/<t>/…` | Blog plugin | Stock | Unchanged |
| `/rss.xml`, `/atom.xml`, sitemap | Blog and sitemap plugins | Stock | Unchanged, plus the new routes in the sitemap, except `/random/` |
| `/journal/` | Site plugin | Static complete index; filters run client-side on the route's own data | New |
| `/chronicles/` | Site plugin | Static landing page of `chronicle` collections | New |
| `/series/<id>/` | Site plugin | Static collection page | The five existing routes keep their paths; their source moves from hand-written TSX to the registry. New chronicles use the same prefix. |
| `/projects/game-engine/` | Site plugin | Static collection page, kind `project` | Same path; source moves to the registry |
| `/about/` | Existing page | Its reading list is read from the `section` entries in the editorial summary | Same page; list source moves |
| `/random/` | Site plugin | Client-side redirect with a static fallback | New |
| `/blog/*` compatibility stubs | Existing pages | Unchanged | Unchanged |

**Chronological completeness.** Following the Latest section on `/`, then `/page/2`, `/page/3`
and onward, visits every listed post exactly once. That is the same partition the blog plugin
computes, because the Latest section renders the plugin's own page-1 items rather than a separate
query. `/archive/` remains the single-page complete chronology.

**Reserved routes.** The core's reserved set is:
- `journal`, `chronicles` and `random`,
- `series/<id>` for every chronicle, and
- `projects/<id>` for every project.

A post slug or page route equal to a reserved route fails the build, and blog-mcp's post
validation rejects such a slug when the post is authored. No redirects are introduced.

**Navigation.**
- Logo goes to `/`.
- "Latest" becomes "Journal", pointing to `/journal/`.
- "Series" becomes "Chronicles": a dropdown generated from the registry's `chronicle`
  collections, plus "All chronicles", which points to `/chronicles/`. The site config reads the
  registry through the same loader, so the menu cannot drift.
- Builds, About and Docs are unchanged.
- `Test-DocumentationArtifact.ps1`'s masthead assertions change with these labels. See Open
  question 1.

## Distribution

Everything ships inside things that already exist. Nothing new is installed or operated.

- **Site.** The plugin, pages, footer extension and registry are part of `docs/`. They are built
  by the existing Docs CI and Docs Deploy workflows in the same pinned base image, and served by
  GitHub Pages. No change to `Docs-Template` is needed. An upgrade is an ordinary PR, and a
  Docusaurus upgrade additionally trips the adapter's version guard (*Module boundaries*).
- **blog-mcp.** The repointed hub tools ship in the next blog-mcp image built by the existing
  `blog-mcp-image.yml`. MCP clients see the same tool names. Their inputs are unchanged except
  for two widenings, both supersets: the `hub` enum and the `href` pattern (*Verification*).
- **Tests.**
  - The core's tests run in a new Docs CI step inside the base image, using Node 26's built-in
    test runner. That adds no dependency.
  - blog-mcp's tests run in its existing workflow, which gates them twice: on the workflow's
    trigger paths, and again in the test job's `blog_mcp_test` change area in
    `build/WorkflowChangeAreas.psm1`. The shared conformance fixture's path joins both gates.
    The classifier parity test gains a fixture-only change case asserting that blog-mcp's tests
    run.
  - The artifact checks run where they run today.

## Failure modes

| Boundary | Failure | Detected by | System does | Author or reader sees |
|---|---|---|---|---|
| Docusaurus version | Base image bumped to an unverified version | Adapter version guard | Fails the build | A PR check naming the adapter and the fixture to re-capture |
| Loaded-content shape | A field is missing, renamed or retyped; the plugin instance is missing | Adapter shape assertions and canaries | Fails the build | The field, the post's source path, and the expected type |
| Registry syntax | Invalid YAML or an unknown `version` | Source loader | Fails the build; blog-mcp reports the same | File, line and column |
| Registry references | Unknown or non-public post; unknown tag key; unknown related collection; duplicate entry; include and exclude conflict; `rules` without a valid `mode`; `start` not a member; duplicate collection id | Core validation (build) and blog-mcp validation | Fails the build, reporting every error at once | Rule name, collection id and reference |
| Route collision | A new post's slug equals a reserved route | blog-mcp post validation (`ReservedSlug`) at authoring time; core check and `onDuplicateRoutes: 'throw'` at build time | Blocks the PR, or fails the build on `main`, so the deploy is skipped | The colliding route and both owners. The live site stays on the previous build. |
| Post removed or slug changed | The registry still references it | Core validation | Fails the build | Treated like any published-slug change, which is already a hard rule |
| Rules expanding a collection | A broad mapping quietly pulls in unrelated posts | Membership report; baseline comparison test during migration | The comparison test fails until the change is recorded as reviewed | The diff, collection by collection |
| Empty collection | Every member unpublished or excluded | Not a failure | Renders an empty-state message | "Nothing here yet" |
| Discovery index chunk | Chunk fails to load (offline, or a stale chunk after a deploy) | Client index loader | Returns `null`; the extensions render nothing | The stock post page; `/random/` shows its link to `/journal/` |
| JavaScript disabled | n/a | n/a | Home, `/journal/`, `/chronicles/` and collection pages are static | All links work; filters and footer extras are absent |
| blog-mcp on an older checkout | Registry file absent | Registry module | `blog_validate_hubs` reports `RegistryMissing`; `blog_add_hub_entry` returns a precondition error | A clear message; no file is written |
| blog-mcp registry write | Write fails, or the result does not parse | Re-parse after write; atomic write | Writes atomically; validates again; refuses a result that fails validation | The registry is left unchanged on failure |

A failed build leaves nothing behind: everything derived lives only in that build's output.

## Concurrency and ordering

- **Builds are deterministic.**
  - The core sorts every input before using it.
  - It reads no clock and no randomness.
  - Ties always break on permalink.

  The same commit always produces the same pages, index and report. `/random/` chooses at view
  time, in the browser.
- **Registry edits conflict only with other registry edits.** Post-only PRs never touch the
  registry, so the queue cannot conflict with editorial work, and scheduler merges need no
  ordering against it.
- **Deploys are serialized** by the existing `github-pages` concurrency group, which does not
  cancel in-progress runs. Each deploy reflects the whole of `main` at its commit.
- **blog-mcp registry writes** go through its existing repository lock and atomic write, so
  concurrent tool calls cannot interleave a write.
- **One kind of race:** a registry PR that references a post can merge after that post was
  removed. The `main` build then fails, and the deploy is skipped, under the failure modes above.
  Nothing else in this system runs concurrently.

## Verification

Each required test maps to one layer:

- **Core**: pure unit tests, run in Docs CI.
- **Adapter**: fixture tests, plus its in-build guard.
- **Artifact**: `Test-DocumentationArtifact.ps1` on real output, on every PR and every deploy.
- **blog-mcp**: vitest.

Fixed counts are never asserted. Tests assert correspondence between independent sources.

| Requirement | Layer | Assertion |
|---|---|---|
| All published posts appear in the Journal exactly once | Artifact | The post links on `/journal/` equal the post links on `/archive/`, as sets, with no duplicates. (Today that is 50; the count is not hard-coded.) |
| A new qualifying post-only PR is discoverable after merge with no registry change | Core, artifact, one-time | Core: adding a synthetic tagged post to the captured real-shape fixture makes it a rule member with the registry unchanged. Artifact: for each collection, the members listed on its page equal the members the index assigns. One-time, at each cutover: a real queued `blog/*` branch with a qualifying tag is merged locally and built. In PR 3 the post must appear in the Journal, archive, topics and search, and as an uncurated candidate in the membership report, with the build green. In PR 4 it must also appear in its collection. |
| Unlisted and draft posts are not exposed | Core, adapter | Fixture posts marked unlisted and draft are absent from the index, collections, related entries and the random pool. A registry reference to either fails validation. |
| Include and exclude precedence | Core, blog-mcp | The precedence table, case by case, in the shared conformance fixture. Both on one reference is an error. A `related` entry that matches the collection's tag rule, and one that matches its slug-prefix rule, stay non-members. A `suggest` rule adds no member. |
| Deterministic ordering | Core | A shuffled input gives identical output; same-date ties break on permalink; curated items come before fallback items. |
| Existing membership preserved, except for reviewed changes | Core, during migration | Resolved membership equals the baseline extracted from today's seven hub files, plus the reviewed changes recorded in the same PR. The baseline is retired after PR 4. |
| Multiple memberships create no duplicate pages | Artifact | Each post permalink has exactly one HTML page and one sitemap entry. Every collection link targets a canonical permalink. No generated route sits below a collection route. |
| Broken registry references fail | Core, blog-mcp | Every validation rule has a failing case. Both implementations run the shared conformance fixture. |
| Generated routes do not collide | Core, build, blog-mcp | Reserved-route collision cases; `onDuplicateRoutes: 'throw'`; the `ReservedSlug` post rule. |
| Existing URLs, tags, feeds, archive and pagination still work | Artifact | The existing route, feed and tag checks stay. New checks: every `/page/N` that the post count implies exists; the Latest section on `/` plus every `/page/N` equals the `/archive/` set with no duplicates; `/journal/`, `/chronicles/` and each collection route exist. |
| Scheduled publishing continues without intervention | blog-mcp, review | The scheduler tests stay unchanged and green. The publish simulation adds a post with no registry change and preflight passes. The scheduler's code is not in any of these PRs' diffs. |
| blog-mcp hub-tool compatibility | blog-mcp | `legacy-tool-parity.json` and the `git-service-consumer` declarations are updated for the two logged widenings: the `hub` enum becomes the registry's collection ids, and `href` accepts `/<slug>/`, `/series/<id>/` and `/projects/<id>/`. Every input valid today stays valid. The handler then checks `href` against real post permalinks and registry collection routes. A collection route adds to `related`, and anything else is refused with a precondition error. Golden-file tests for registry writes cover comments preserved, position honoured, a duplicate refused, and a collection `href`. |
| `/about/` reading list preserved | Artifact, core | The rendered `/about/` list has the same six links, in the same order, with the same labels and effective titles and descriptions as the baseline. |

**Measurement before optimizing.** PR 1 records the discovery index's real size and the post
page's initial JavaScript in its description. Putting the index in global data is reconsidered
only with those numbers.

## Delivery: pull requests

Each PR is independently reviewable, leaves the site correct, and passes Docs CI. The blog-mcp
workflow also runs wherever a PR touches blog-mcp.

1. **Discovery foundation: architecture and tests; nothing visible changes.**
   - The adapter, with its version guard and captured fixture; the source loader; the core; the
     site plugin wired in, emitting the index, the editorial summary and the build-log report.
   - The registry, seeded from the seven current hubs: explicit entries with their existing
     labels, titles, descriptions and `related` roles. Each hub's current `.config/blog.json`
     match becomes that collection's `rules` in **`suggest` mode**, so nothing joins
     automatically and the coverage warnings stay exactly as they are today.
   - The baseline membership snapshot and its comparison test.
   - `onDuplicateRoutes: 'throw'`, after confirming the current build has no duplicate-route
     warnings.
   - The Docs CI step that runs the core's tests.
   - The size measurement.
2. **Journal and Chronicles landing pages.** `/journal/` is static, without filters yet.
   `/chronicles/` links to the still-handwritten `/series/*` pages. The PR adds:
   - the artifact checks for "Journal equals archive" and for the new routes, and
   - a re-check of the open `blog/*` front-matter slugs against the reserved routes.
3. **Hub migration: the source of truth switches in one PR.**
   - `/series/*`, `/projects/game-engine/` and the `/about/` list render from the registry, and
     the hand-written lists are deleted. The baseline test now compares rendered pages.
   - blog-mcp is repointed: `blog_add_hub_entry`, `blog_validate_hubs`, preflight,
     `.config/blog.json` `hubs` (their `match` moves out; the registry's rules are the only
     source), the config defaults, the `ReservedSlug` rule, the widened `href`, the parity
     fixture and the `git-service-consumer` declarations.
   - The `create-blog-post` workflow's hub step stays required. It now names the registry, and
     it applies to every collection whose rules are still in `suggest` mode, which after this PR
     is all of them. Reader-visible membership is therefore exactly as correct as it is today,
     and curation is never made optional before automatic membership exists.
   - The one-time queued-branch check (*Verification*).
   - The "Chronicles" menu is generated from the registry, and the masthead checks are updated.
4. **Automatic membership.** Rules move from `suggest` to `apply` one chronicle at a time, each
   with its reviewed membership diff recorded. For each collection switched to `apply`, the
   workflow's hub step becomes optional curation of reading order and labels. The diffs known on
   2026-10-08:

   | Chronicle | Rule | Adds |
   |---|---|---|
   | `lucifer-chronicles` | tag `lucifer` | 2 |
   | `ai-assisted-engineering` | tag `ai-assisted-engineering` | 2; the editorial call is whether they belong |
   | `state-of-dev` | slug prefix `state-of-dev-` | 1 |
   | `building-the-blog` | tag `blog-publishing` | 0 |
   | `docker` | tag `docker` | 0 |
   | `game-engine` | tag `game-engine`, if wanted | 3 |

   This PR repeats the one-time queued-branch check, now asserting collection membership. The
   baseline is retired afterwards.
5. **Home page.** The Journal home through `blogListComponent`, with the Latest section and the
   pagination chain checks. "Latest" in the navigation becomes "Journal". This PR carries the
   visual and copy work, presented for review.
6. **Contextual navigation and related entries.** The footer extension, the client index loader,
   the session reading path, and a re-measurement.
7. **Surprise Me and Journal filtering.** `/random/` and its navigation entry, and client-side
   topic and chronicle filters on `/journal/`.

PRs 1 and 2 introduce no change a reader can see, apart from two new pages. A reader first sees a
change in PR 3, and the information-architecture change in PR 5.

## Alternatives considered

1. **Where discovery is computed.**
   - **Chosen:** a build-time plugin that reads the loaded content (Approach A).
   - **Rejected: a committed generated index (B).** Queued PRs never regenerate it, so every
     publication would need a second "reindex" PR. That changes the scheduler and breaks the
     primary invariant.
   - **Rejected: wrapping or replacing the blog plugin (C).** All post, feed and sitemap routing
     would pass through our code, putting every URL at risk for features the brief does not
     require (per-chronicle feeds, server-rendered post navigation).
2. **Chronicle URLs.**
   - **Chosen:** `/series/<id>/` stays canonical for every chronicle, old and new. `/chronicles/`
     is only the landing page.
   - **Rejected: `/chronicles/<id>/` with redirect stubs.** GitHub Pages can only do client-side
     redirects, which search engines weaken. Five permanent stubs would be created purely so the
     prefix matches the label.
3. **Fixing home-page pagination.**
   - **Chosen:** the Journal home renders the plugin's own page-1 items as a secondary Latest
     section that links to `/page/2`.
   - **Rejected: a separate complete chronological listing.** It duplicates `/archive/` and still
     leaves `/page/2` starting at post 11 with no page 1.
   - **Rejected: moving the blog list to another base path.** That moves `/page/N`, a public URL.
   - **Rejected: `postsPerPage: 'ALL'`.** It removes pagination and makes `/` heavy.
4. **Registry format and location.**
   - **Chosen:** YAML at `docs/blog/chronicles.yml`, beside `tags.yml`. Only `docs/` reaches the
     build, and blog-mcp's write allowlist already covers `docs/blog/`.
   - **Rejected: JSON.** No comments, and poor for prose descriptions.
   - **Rejected: a TypeScript module.** blog-mcp would go back to AST splicing.
   - **Rejected: front-matter fields.** The brief forbids new per-post metadata, and queued PRs
     could not carry them.
   - **Rejected: `.config/blog.json`.** It never reaches the build.
5. **Delivering data to pages.**
   - **Chosen:** route data for the static pages, a global summary bounded by the registry, and
     one lazily loaded index for the post footer and Surprise Me.
   - **Rejected: the full index in global data.** It ships the archive with every page, against
     the "measure first" rule.
   - **Rejected: one shard per post.** That means hundreds of tiny files, and the build cannot
     share them across pages.
   - **Rejected: a static file written after the build.** Development would then behave
     differently from production.
6. **Who decides membership.**
   - **Chosen:** the build's core is the only resolver. blog-mcp validates references and reports
     rule-matched entries that are not curated: as a warning for `suggest` rules, and as
     information for `apply` rules. Both run one shared conformance fixture, which is data, not
     code.
   - **Rejected: blog-mcp importing the core.** Its image build context is `tools/blog-mcp` and
     its compiler root is `src/`, so it cannot reach `docs/`.
   - **Rejected: blog-mcp loading the core from the checkout at run time.** It would couple a
     running service to executing repository files.
7. **The reading-path hint for an entry in several chronicles.**
   - **Chosen:** session storage, set when following a link from a collection page.
   - **Rejected: a `?chronicle=` query parameter.** It creates URL variants of every post. A
     canonical tag would contain the damage, but the hint is not worth a second address space.

## Open questions

1. **Navigation labels.** Should the menu change "Latest" to "Journal" (linking to `/journal/`) and
   "Series" to "Chronicles", as designed? Or should "Latest" stay as a chronological link? The
   design assumes the former. It lands in PRs 3 and 5, and it is the visible information-architecture
   change `AGENTS.md` says to confirm.
2. **The `/about/` reading list.** Is it a `section` (embedded only, as designed), or should
   "Ahead of the Rubric" also become a chronicle with its own `/series/` route?
3. **Which rules to enable.** PR 4 needs your call per chronicle. Do the two "shut the fuck up"
   posts belong in AI-Assisted Engineering? Should Game Engine gain a `game-engine` tag rule, or
   stay manual?
4. **Featured entries.** Which entries should the Journal home feature at launch? The registry
   starts with `featured` empty, and the home renders without that section until you choose.
5. **Roadmap.** Should this become a new milestone in `MILESTONES.md`? Milestone 6, "Curated
   content paths", is its predecessor and is effectively complete.
