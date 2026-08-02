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

## Milestone 7: Deterministic publishing tools — complete

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
  `blog_auto_merge`, `blog_pr_status`, `blog_pr_comments`), gated behind
  `BLOG_MCP_ALLOW_REMOTE`, off by default. No merge tool exists other than
  enabling GitHub's own auto-merge; a GitHub token is never written to disk in
  the container.
- Phase 7 (delivered): CI and deploy monitoring (`blog_check_status`,
  `blog_wait_for_checks`, `blog_wait_for_merge`, `blog_deploy_status`,
  `blog_wait_for_deploy`, `blog_verify_published_url`,
  `blog_publish_report`), on by default since it is read-only. This is
  where the "never report a published URL before `Docs Deploy` for the
  exact merge commit shows `completed`/`success`" rule stops being prose in
  `AGENTS.md` and becomes a predicate the tool structurally enforces —
  `blog_verify_published_url` has no code path that returns a URL without a
  confirmed successful deploy.
- Phase 8 (delivered): an HTTP transport (`tools/blog-mcp/src/http.ts`)
  alongside the default stdio one, stateless (a fresh server per request,
  no session store), bound to `127.0.0.1` by default, with bearer-token
  auth and `Origin` allowlisting.
- Phase 9 (delivered): `.agents/workflows/create-blog-post.md` and
  `.agents/workflows/publish-change.md` now name the `blog_*` tool for each
  step, with the original manual/CLI instructions kept as an explicit
  fallback for sessions without the tool layer. Also corrects a real gap
  found while writing this phase: `gh pr view --json
  reviewRequests,latestReviews` alone does not surface this repository's
  configured `qodo-code-review` bot, whose findings still block merge via
  `required_conversation_resolution` — both workflow files and `AGENTS.md`
  now point at the GraphQL `reviewThreads` query (or `blog_pr_comments`)
  instead.

Phases 1–5 delivered in pull request
[#32](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/32); Phase 6 in
[#33](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/33); Phase 7 in
[#34](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/34); Phase 8 in
[#35](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/35); Phase 9 in
[#37](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/37).

See `tools/blog-mcp/README.md` for the current tool catalogue.

## Milestone 8: blog-mcp becomes a self-contained publishing service — complete

`tools/blog-mcp/` required a bind-mounted host checkout, which ruled out
headless operation: a client with no local repo at all (a phone, a scheduled
job, a remote automation service) could never drive the pipeline. The goal is
one container that, given only environment variables and a named volume,
clones the blog, serves the MCP tools, serves a web UI for authoring and
scheduling, and runs a cron scheduler — with no bind mount and no host
checkout anywhere.

- Phase 1 (delivered): clone-only bootstrap. `src/bootstrap/repo.ts`'s
  `ensureRepo()` clones `BLOG_MCP_CLONE_URL` into `BLOG_MCP_WORKSPACE` on
  first run and reconciles (fetch, fast-forward, or safely leave parked/dirty
  — never discarding uncommitted work) on every subsequent run; the
  `/repo`-bind-mount fallback in `src/config.ts` is removed. Git identity
  (`BLOG_MCP_GIT_USER_NAME`/`_EMAIL`) is set repo-local for the first time —
  nothing set it before, so a fresh clone would otherwise fail every commit.
  Verified end-to-end in the built Docker image against the real public
  remote with no bind mount: fresh clone, zero validation findings, and a
  second run reconciling via fast-forward.
- Phase 2 (delivered): repo hygiene and observability. Every tool that
  mutates the working tree, git state, or a PR/merge is now serialized behind
  an in-process mutex (`src/exec/repoLock.ts`) and appends a scrubbed,
  best-effort line to `${BLOG_MCP_WORKSPACE}/state/audit.log`
  (`src/exec/auditLog.ts`) — the hard prerequisite for `serve` mode's
  multiple actors (external MCP client, web UI, scheduler tick) sharing one
  working tree. Three new read-only tools: `blog_log` (defaults to
  `origin/<base>`, not `HEAD`, since a long-lived container's working tree
  may be parked on a stale branch), `blog_branches`, and `blog_repo_health`.
  `blog_sync_base` gained `--prune` and an optional `ffOnly` that fast-forwards
  the local base branch only when it's checked out and clean — a first fix
  for the working-tree-parking problem a persistent volume has that a bind
  mount never did.
- Phase 3 (delivered): per-consumer capability tiers. Registration tiers were
  read from `process.env` at call time (`isReadOnly`/`isRemoteEnabled`/
  `isMonitorEnabled`), a process-global that `serve` mode's UI and cron
  actors sharing one process would have silently broken —
  `BLOG_MCP_READ_ONLY` would have stopped meaning anything the moment the UI
  needed write access. `createServer({ capabilities })` now accepts an
  explicit `Capabilities` object (`write`, `remote`, `monitor`, `scheduler`,
  `writablePathPrefixes`) that overrides the env-derived defaults entirely;
  `src/index.ts` and `src/http-bin.ts` both omit it, so stdio and `/mcp` HTTP
  are byte-for-byte unchanged. `writablePathPrefixes` also threads through to
  `blog_stage`/`blog_add_hub_entry`, so a narrower profile (the cron
  scheduler, a later phase) can be denied `.github/workflows/`, `.config/`,
  `tools/`, and `build/` while every other consumer keeps the full default
  allowlist.
- Phase 4 (delivered): `serve` mode -- a third transport (`src/serve.ts` /
  `src/serve-bin.ts`) exposing `/mcp` and `/healthz` (unchanged from HTTP
  transport), a read-only `/api/*`, and a small static UI at `/`
  (`tools/blog-mcp/public/`: plain HTML + `fetch`, no framework, no bundler,
  no CDN assets). Every `/api` route is an explicit `tools/call` over an
  in-process MCP client (`InMemoryTransport`, `src/serve/client.ts`) rather
  than a generic call-any-tool-by-name proxy, so the UI is provably
  incapable of anything an MCP client's tool list wouldn't allow. Auth: a
  256-bit session id in an `HttpOnly`/`SameSite=Strict` cookie, tracked
  server-side with a 30-minute sliding expiry, a rate-limited login, and a
  required `X-Blog-Mcp-Csrf` header on `/api` -- deliberately a separate
  secret (`BLOG_MCP_UI_PASSWORD_HASH`) from `BLOG_MCP_HTTP_TOKEN`, since one
  is a machine bearer token and the other a password typed into a browser.
  Manual browser verification of this phase caught a real bug the design
  review's Origin-based CSRF plan had missed: a same-origin `fetch` POST
  from the login page did not reliably send an `Origin` header at all, so
  requiring one outright would have locked out the login form itself; the
  fix mirrors `/mcp`'s existing policy (missing Origin allowed, only a
  *present, disallowed* one rejected) and leans on `SameSite=Strict` plus
  the custom CSRF header as the actual defenses. Verified end to end against
  the built Docker image with no bind mount: real clone, login, session
  cookie, and `/api` calls returning real post/log/health data over `curl`.
  Read-only by design -- Phase 5 adds write routes without touching this
  phase's capabilities or auth plumbing.
- Phase 5 (delivered): UI writes. `src/serve/api.ts` gained POST routes for
  every write tool the phase list calls for -- create/update a post, create
  a branch, stage, commit, push, open a PR, enable auto-merge -- each still an
  explicit `tools/call`, never a passthrough. `public/app.js`'s new
  "Compose" view drives the full publish sequence (branch → write → stage →
  commit → push → open PR) as one guided flow; enabling auto-merge stays a
  separate, explicit button rather than firing automatically on PR
  creation. Verified with a new `test/serve-writes.test.ts` (every route,
  end to end, over real HTTP, against a scratch bare remote and the
  existing `gh-shim.mjs` -- never the live checkout) and by clicking through
  the Compose UI in a real browser, which caught a second real bug beyond
  what the HTTP-level tests could reach: the auto-merge button fetched its
  "expected" head SHA from the same `GET /api/pr/:number` call it then
  validated against, making the check tautological -- it would always
  report a match and silently defeat the entire reason
  `blog_auto_merge` takes an explicit SHA at all. Fixed to use the SHA
  the session's own push actually returned; this class of bug has no
  automated regression coverage, since the project has no browser/DOM test
  runner and the bug lived entirely in client-side JS.
- Phase 6 (delivered): the cron scheduler. Model (i) only -- "hold the
  branch/PR, merge at time T" -- three new tools (`blog_schedule_publish`,
  `blog_list_scheduled_jobs`, `blog_cancel_scheduled_job`) gated behind
  `BLOG_MCP_ALLOW_SCHEDULER=1` + `BLOG_MCP_ALLOW_REMOTE=1`, plus a 60s tick
  loop (`src/scheduler/engine.ts`) running inside the `serve` process.
  Every job explicitly declares its own missed-tick policy
  (`catch_up`/`skip_if_older_than`) rather than an implicit default; a
  merge conflict or a SHA that no longer matches the PR's actual head is
  terminal `needs-attention`, never retried automatically.
  `src/server.ts`'s registration gating was refactored so Tier C (remote)
  no longer nests under `write` -- the scheduler's own profile
  (`CRON_CAPABILITIES`) needs `blog_pr_status`/`blog_auto_merge`
  without any local-write tool, and env-derived `defaultCapabilities()` is
  unchanged for every existing caller (`remote` still only true when
  `write` is too). A real Docker container run caught a genuine wiring gap
  no unit test reached: `stateDir` was threaded into the scheduler
  *engine*'s own options but not into `createMcpRequestHandler`/
  `createHttpServer`/`createServeServer`, so `blog_schedule_publish` failed
  over a real `/mcp` call even though the tool's own logic (tested via a
  hand-built `ToolContext`) was correct. Fixed, and
  `test/http-scheduler-wiring.test.ts` now exercises the real
  option-threading path so this class of gap fails a unit test next time.
  End-to-end verified in the built image: scheduled a PR, waited for a real
  60-second tick to fire unprompted, and watched the job move
  `pending` → `auto-merge-enabled` on its own -- with the parked-branch fail-safe first
  confirmed to correctly block it until the working tree was back on the
  base branch.
- Future-date experiment (run): the cheap throwaway-PR experiment Phase 7
  was gated on. A post dated `2036-07-31`
  ([The-Running-Dev/SubZeroDev.Blog#38](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/38),
  closed without merging) confirmed the future-dated post fully builds into
  production, gets a real page, **and appears in both `rss.xml` and
  `atom.xml`**. "This template hides future-dated posts" was folklore, not
  fact, for this setup -- model (ii) ("merge now, publish later via a
  future date") is now confirmed rejected, not just assumed. This leaves
  `blog_dispatch_deploy`'s only remaining justification as its unrelated
  second use case, recovering a failed deploy -- a smaller, separate
  feature to decide on independently rather than something this experiment
  argues for building.
- Phase 7 (conditional, undecided): not started. `blog_dispatch_deploy`
  would fire `workflow_dispatch` on `Docs Deploy` to recover a failed
  deploy -- the only remaining use case now that the future-date scheduling
  question above is settled against it.

Phase 1 delivered in the pull request that introduced this section; Phases 2
through 6 in the pull requests that introduced those lines.

## Milestone 9: blog-mcp admin UI — React + Vite rewrite, with post deletion — complete

Milestone 8's `serve`-mode admin UI (`public/`) was plain HTML + vanilla JS
(`app.js`, hand-rolled `el()`/`table()` DOM helpers, no framework, no
bundler). That was a deliberate call at the time -- the UI renders
author-controlled text (PR review comments, post bodies) under a strict
`script-src 'self'` CSP, and staying framework-free kept that guarantee
simple to audit. As the UI grew (tag-checkbox chips, slug/tag autocomplete,
raw-markdown paste), several real bugs were found and fixed by hand --
symptoms of building interactive UI without component/state abstractions.
The security property doesn't require staying framework-free, only that
whatever ships stays self-contained (no CDN, no inline eval) and never
renders untrusted text as markup -- a React + Vite production build
satisfies both, so the whole UI was rewritten, and a per-row **Delete**
capability (which didn't exist at all before this milestone) was added
directly into the new UI rather than built twice.

- Phase 1 (delivered): scaffolded `tools/blog-mcp/ui/` -- React 19 + Vite 8 +
  TypeScript + `react-router-dom`, a completely separate build pipeline from
  the server's own `tsc`. Routing skeleton (`/posts`, `/compose`,
  `/compose/:slug`, `/log`, `/branches`, `/health`, `/pr`, `/login`) with
  placeholder views and the Docusaurus-palette CSS ported from
  `public/style.css`. `/login` became a route within the SPA rather than a
  separate static HTML entry -- the JS bundle carries no secrets, and every
  protected action still goes through an authenticated `/api` call, so there
  was no security reason to keep it split out.
- Phase 2 (delivered): `blog_delete_post`, mirroring `blog_create_post`/
  `blog_update_post`'s shape and reusing the *same* publish pipeline every
  write already goes through (branch → delete → stage → commit → push →
  open PR → enable auto-merge) -- no new merge path, `blog_auto_merge`
  stays the only one. Removes the file via `git rm -f` (not a bare
  `fs.unlinkSync`): the `-f` is deliberate, since deleting the post is the
  whole point, so any uncommitted local edits to that same file are moot --
  caught by the test suite, where an earlier fixture leaves the post dirty
  via a direct `fs.writeFileSync` and `git rm` (no `-f`) refused to touch it.
- Phase 3 (delivered): rewrote `src/serve/static.ts` from a fixed
  route→file allowlist (the vanilla UI's four files) to a narrowly-scoped,
  traversal-safe file server over `ui/dist/` -- every request path is
  decoded, then resolved against the dist root and checked for containment
  on the *resolved* absolute path (never the raw string, the classic `../`
  bypass), a real file gets long-lived immutable caching (safe because
  Vite's hashed filenames change on every rebuild), an in-bounds path that
  isn't a real file falls back to `index.html` so React Router resolves it
  client-side (including on a hard refresh), and a path resolving *outside*
  the dist root is rejected outright, not silently served the SPA shell.
- Phase 4 (delivered): ported every view to real React logic 1:1 (not
  redesigned again) -- slug/tag autocomplete, the tag-vocabulary-unavailable
  free-text fallback, raw-markdown-paste, and the full publish pipeline all
  carried over as hooks instead of closures over DOM nodes.
- Phase 5 (delivered): the Posts view's per-row Delete -- confirms first
  (deleting a *published, live* post is more consequential than
  create/update, which this UI already gates behind a separate
  auto-merge step), then drives the same guided pipeline Phase 2's tool
  plugs into, landing on a PR-status view that reads the PR number from a
  `?pr=` query param and looks it up automatically.
- Phase 6 (delivered): a new `ui-build` Dockerfile stage; the runtime stage
  copies `ui/dist` in instead of `public/`. Verified end to end against a
  real scratch bare-remote repo (never the live checkout) in a real browser,
  mirroring `test/serve-writes.test.ts`'s own pattern: logged in, edited an
  existing post, created a new one via raw-markdown-paste and published it
  through the full pipeline, attempted to enable auto-merge (correctly reported a
  SHA mismatch against the fixture's static head, proving the check itself
  still works), deleted a post through the full pipeline and confirmed via
  `git status` that the right file was removed and pushed on its own
  branch -- then the same walkthrough again against the real built Docker
  image before `public/` was deleted. A manual `curl` traversal attempt
  (literal and percent-encoded `../`) against the real container confirmed
  the percent-encoded case is rejected with 404, while a literal `../` in
  the URL is already collapsed by the HTTP layer's own URL-parsing before
  the server ever sees it (confirmed safe by inspecting the response body:
  the SPA shell, never leaked file content) -- both paths verified, neither
  is a real vulnerability.

## Milestone 10: CI and workflow correctness — planned

Specified in `tools/blog-mcp/TODO-NEXT.md` sections 15-22. Nothing below is
implemented.

There is no executable contract between what a commit changes and what CI
runs; the path assumptions live only in YAML comments. Confirmed by direct
inspection of the current workflows and live branch protection:

- `blog-mcp-image.yml` triggers on `tools/blog-mcp/**`, which includes tests,
  Compose files, `.env.example`, README files, and the two planning documents
  themselves. PR
  [#83](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/83) changed
  only `MCP-NEXT.md` and `README.md`, yet ran the package suite and a Docker
  build twice, then on merge published `latest` and called the Portainer
  redeploy webhook. The Dockerfile's real inputs are far narrower than the
  trigger.
- `docs-deploy.yml` runs on every push to `main` with no path filter, so a
  Blog-Bot-only merge rebuilds and redeploys the entire public site.
- The `build-and-push` job declares `packages: write` at job level and relies
  on step-level `if:` conditions to stay safe on pull requests. Step
  conditions are not a permission boundary, so the workflow comment claiming
  every PR run lacks a write-capable token is stronger than the YAML actually
  guarantees.
- Required contexts on protected `main` are exactly `Documentation links and
  terminology` and `Verify Documentation Build`. This is the constraint that
  makes naive optimization dangerous: filtering a required workflow out by
  `paths` leaves its context permanently pending and blocks the PR forever.
  Expensive work may be skipped, but the required context must still complete,
  reporting an explicit `not-applicable` success.

Phases:

- Phase A: one repository-owned, unit-tested change classifier
  (`build/Test-WorkflowChangeAreas.ps1`) taking base/head and returning
  independent area booleans plus matched paths. It must read Git's complete
  changed-file list, never GitHub's UI-truncated file summary, and be
  table-driven against every row of the execution matrix (rename, delete,
  merge-base, >300 files, mixed changes). A classifier error fails validation
  and publishes nothing.
- Phase B: stop false image publication. Narrow the trigger to the union of
  real test and image inputs; split the unprivileged PR build (`contents:
  read`, no registry login) from a separate publish job that alone holds
  `packages: write` and cannot be entered by any pull-request event; guard the
  redeploy webhook behind a qualifying image push; add PR concurrency
  cancellation. `.dockerignore` already exists but currently excludes only
  `node_modules`, `dist`, `test`, `README.md`, and `*.log` -- `MCP-NEXT.md`,
  `TODO-NEXT.md`, the Compose files, and `.env*` still enter the build
  context, so this phase extends it rather than creating it, and tests it for
  parity with the Dockerfile's own `COPY` instructions.
- Phases C and D (externally blocked): `docs-ci.yml` and `docs-deploy.yml` are
  installer-owned outputs of `The-Running-Dev/Docusaurus-Template`. Their
  optimization must be implemented upstream and regenerated here through the
  supported installer -- never accumulated as an undocumented local fork. This
  is the one part of this milestone that cannot be completed inside this
  repository alone.
- Phase E: make Blog-Bot deployment-aware. `blog_wait_for_deploy` currently
  polls for up to 20 minutes when no matching run exists, which becomes a
  false timeout once non-site merges legitimately produce no deploy. Monitoring
  gains three states -- `expected`, `not-applicable`, `unknown`. The hard rule
  is unchanged and must not be weakened: reporting a public route still
  requires a successful exact-merge-SHA deploy plus a successful HTTPS fetch,
  `unknown` fails closed, and `not-applicable` is never a shortcut to a URL.
- Phase F: re-measure. The 2026-08-02 baseline over the visible 100 runs was
  `blog-mcp Image` 35 runs / 142.9 min, `Docs CI` 46 / 56.4 min, `Docs Deploy`
  18 / 31.4 min. Targets are zero image publications or stack webhooks for
  non-image changes, zero Pages deployments for non-site changes, and zero
  missing required contexts.

## Milestone 11: Publishing integrity — complete

Specified in `tools/blog-mcp/TODO-NEXT.md` sections 1-14. Phase 1 (regression
fixtures and domain contracts), Phase 2 (atomic metadata resolution), Phase 3
(canonical date service), Phase 4 (protected branch preparation), Phase 6
(post-merge reconciliation), Phase 5 (caller migration), and Phase 7
(end-to-end verification and documentation) are delivered. Phase 6 was
delivered before Phase 5 -- it directly root-causes the interim-fix incident
below, so it was prioritized ahead of its numeric order.

Publishing
[GitOps Isn't Just for Infrastructure Anymore](https://blog.subzerodev.com/gitops-isnt-just-for-infrastructure-anymore/)
exposed four defects that are structural, not operator error. At the time,
`src/domain/authors.ts` exposed only `AuthorEntry`, `authorsYmlPath`, and
`loadAuthors` -- no author serializer, no resolver, and no `blog_add_author`
anywhere in `src/`, so a requested author key that did not already exist
could not be created by any code path. Phase 2 (below) fixed this and the
equivalent tag gap.

1. A requested author key absent from `authors.yml` was silently replaced by
   the configured default, so the post published under the wrong identity.
   The Compose UI has no authors field at all, so every post created there
   uses the default regardless of intent.
2. Missing controlled tags require a separate `blog_add_tag` call the caller
   must anticipate; the watcher has no metadata-creation step and therefore
   fails outright on a new tag.
3. Date handling was split across callers -- the tool passed a supplied string
   through unchanged while Compose ran its own `Date.parse` -- so which
   inputs were accepted depended on the calling interface and the JavaScript
   runtime.
4. A content commit was created on protected `main`. `blog_push` correctly
   refused it, but only after the unsafe commit already existed, and the
   subsequent branch (correctly cut from `origin/main`) did not contain it.

The design spine is one canonical authoring service used by MCP, HTTP,
Compose, and the watcher alike: atomic metadata-plus-post writes where a
validation failure leaves `authors.yml`, `tags.yml`, and the post file all
untouched; one injectable request clock per operation so no default depends on
the wall clock; a protected-base invariant enforced before any content write;
and idempotent retry that never duplicates metadata or silently changes
authorship. Callers stage the authoritative `changedPaths` the result returns
instead of guessing which files moved.

Phases:

- Phase 1 (delivered, [#90](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/90)):
  regression fixtures and domain contracts. `it.fails()` fixtures pin all four
  defects against the pre-fix behavior; adds `AuthorDefinition`,
  `TagDefinition`, `PostWriteResult`, and an injectable `ToolContext.clock`.
  No production behavior changed.
- Phase 2 (delivered, [#92](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/92)):
  atomic metadata resolution. `resolveAuthors`/`resolveTags` (pure, no fs), an
  author serializer and `checkAuthorsYmlIntegrity` (`src/domain/authors.ts`),
  a new `blog_add_author` tool mirroring `blog_add_tag`, and a
  write-temp-then-rename `writeFilesAtomically` (`src/domain/atomicWrite.ts`)
  generalizing the pattern `scheduler/store.ts` already used for
  `schedule.json`. `blog_create_post`/`blog_update_post` now auto-create a
  requested author or tag key absent from `authors.yml`/`tags.yml` instead of
  rejecting it or silently substituting the configured default, and return the
  full `PostWriteResult` (`changedPaths`, `createdAuthors`, `createdTags`,
  `defaultAuthorUsed`). A validation failure at any stage still leaves every
  source file untouched. `blog_add_tag` keeps its existing
  refuse-on-duplicate-key contract exactly.
- Phase 3 (delivered): the canonical date service. A hand-rolled deterministic
  parser (`src/domain/dateService.ts`, no new dependency -- Node's built-in
  ICU already carries the IANA timezone database) accepts ISO 8601 (with or
  without offset/seconds/milliseconds), date-only, RFC 2822, English
  month-name dates, and numeric dates resolved via the explicit
  `BLOG_MCP_DATE_ORDER` (default `MDY`) rather than guessed; timezone-free
  values resolve through `BLOG_MCP_DEFAULT_TIME_ZONE` (default `UTC`).
  `blog_create_post`/`blog_update_post` capture `ToolContext.clock` once per
  call (wiring in the injectable clock added in Phase 1) and normalize every
  date through it; a `blog_update_post` date change that moves the canonical
  UTC day safely renames the file (destination-exists collision refuses
  without touching either file) and reports `previousPath` in the result.
  Compose's own client-side `Date.parse`-based validation was deleted --
  it now just forwards the raw field value and lets the server's
  precondition failure (listing accepted formats) surface through the same
  path every other tool rejection already used.
- Phase 4 (delivered): protected branch preparation. New
  `blog_prepare_publish_branch` (a shared
  `aheadBehind` primitive promoted from `blog_branches`/`blog_repo_health`
  into `src/exec/git.ts`) resolves local-vs-remote-base ancestry before any
  write: in sync -> branch straight from `origin/<base>`; local base purely
  behind -> fast-forward it, then branch; local base has commit(s) origin
  doesn't -> preserve them on the new branch and rebase onto the latest
  `origin/<base>` instead of abandoning them (the exact Milestone 11
  incident), aborting safely back to the untouched preserved branch on a
  genuine conflict. A branch that already exists locally or on `origin`
  (checked live via `git ls-remote`, not a possibly-stale tracking ref) is
  switched to as-is and never rebased. `blog_commit` now refuses on the base
  branch (matching `blog_push`'s existing guard) and `blog_sync_base({
  ffOnly: true })` reports a precondition, not `ok:true`, when a fast-forward
  is genuinely attempted and refused -- closing out the last two of Phase 1's
  `it.fails()` fixtures.
- Phase 5 (delivered): caller migration. `/api/branch` now calls
  `blog_prepare_publish_branch` instead of `blog_create_branch` (same input
  shape); the watcher's `publishFile` does the same and stages
  `PostWriteResult.changedPaths` (falling back to the single written path)
  instead of always assuming only the post file moved -- closing a real
  latent bug where a brand-new tag/author key would be auto-created
  server-side but never committed. Compose gained an author checklist
  mirroring the existing tag checklist (`GET`/`POST /api/authors` -> new
  `blog_list_authors`/`blog_add_author` routes) and a post-publish metadata
  preview that logs any `createdAuthors`/`createdTags`/`defaultAuthorUsed`
  the write result reports, making previously-silent default-author
  substitution visible. Per an explicit product choice, Compose keeps its
  pre-creation UX (a "+ Create '\<key\>'" button calling `blog_add_tag`/
  `blog_add_author` before Publish) rather than relying solely on the write
  call's own atomic auto-creation -- so it still tracks a small
  `extraStagedPaths` array purely for staging, unioned with `changedPaths` at
  publish time. This is an intentional, informed tradeoff against the letter
  of "UI state no longer tracks metadata files solely for staging," not an
  oversight. `blog_create_branch` itself is unchanged and still registered
  (an external caller may depend on it); only its description now points
  callers at `blog_prepare_publish_branch`. Workflow docs
  (`create-blog-post.md`, `publish-change.md`) and `README.md`'s tool
  catalogue were updated to match.
- Phase 6 (delivered): post-merge reconciliation. New `blog_reconcile_after_merge({
  pr, expectedHeadSha? })`: confirms the PR actually merged via `gh pr view`
  (state, not `merge-base` -- squash merge rewrites ancestry, same reasoning
  `bootstrap/repo.ts`'s pre-existing `isBranchMergedViaGitHub` already
  established), refuses on a head-SHA mismatch or a dirty tree, fetches,
  fast-forwards the base branch, verifies the merge commit is reachable, and
  force-deletes (`git branch -D`) the now-merged local branch -- `-D` because
  a squash-merged branch's commits are never ancestors of its own ref, so
  `-d` would refuse despite GitHub confirming the merge. The scheduler now
  calls it the moment a tick observes `MERGED` (reusing the job's already-persisted
  `headSha`, no new state) instead of just flipping a status string. The
  watcher gained a small persisted `pending-merges.json`
  (`src/watcher/pendingMerges.ts`, mirroring `scheduler/store.ts`'s
  write-temp-then-rename exactly) so an unattended publish gets reconciled
  once it merges, checked at the start of every later tick. Compose's
  `usePrWatcher` gained an `onMerged` callback wired to a new
  `/api/pr/:number/reconcile` route -- deliberately not wired into the
  generic `PrStatusView` (no reliable expected head SHA for an arbitrary
  watched PR number). `ensureRepo()` itself is untouched; it remains the
  startup recovery path, now one of two reconciliation mechanisms instead of
  the only one.
- Phase 7 (delivered, [#99](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/99),
  [#100](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/100)):
  operator documentation now covers date policy, generated metadata, restart
  recovery, branch reconciliation, and caller migrations. A scratch-remote,
  fake-GitHub end-to-end simulation covers direct MCP-shaped publishing and
  watcher equivalence, retry without duplicate generated metadata, competing
  base conflicts, squash merge reconciliation, restart recovery, and deferred
  watcher reconciliation. It also corrected explicit overwrite retries so the
  target post is replaced rather than being misclassified as a duplicate slug.

**Interim fix, ahead of Phase 6 (delivered):** a real incident (a long-running
container's local checkout had drifted 11 commits behind `origin/main`)
confirmed the exact gap sec2 already documents -- `bootstrap/repo.ts`'s
`ensureRepo()` only reconciles the checkout once, at startup. `blog_create_post`'s
author/tag auto-creation (Phase 2) only ever consulted the local
`authors.yml`/`tags.yml`, so a key a since-merged PR had already added looked
"unknown" locally and got auto-created a second time with placeholder data,
clobbering the real entry. Fixed narrowly: the four metadata-mutating tools
now also read `authors.yml`/`tags.yml` as they exist at `origin/<base>`
(`git show origin/<base>:<path>`, best-effort -- an unreachable origin falls
back to local-only rather than blocking a publish) and treat a key as known
if either copy has it. This does not replace Phase 6 -- the checkout still
doesn't self-heal -- but it closes the specific clobbering symptom regardless
of how stale the checkout gets.

An explicit non-goal: the reference post keeps its published author. Any
editorial correction is a separate, deliberate content change after the
machinery is fixed -- this milestone does not silently rewrite published
history.

## Milestone 12: MCP Next — planned, gated on a spike that may fail

Specified in `tools/blog-mcp/MCP-NEXT.md`. Nothing below is implemented.

Today a tool's MCP metadata, its authorization, and its implementation are
written together by hand in `src/tools/*.ts`, so discovery and execution can
drift and nothing validates the exposed surface at build time. MCP Next
separates Blog-Bot's domain operations from the mechanics of exposing them:
one versioned contract declares every tool, a compiler validates and
normalizes it into an immutable registry during the build, and both
`tools/list` and `tools/call` consume that same generated artifact. The
official MCP TypeScript SDK keeps ownership of framing, transports, and
authorization integration -- MCP Next must not hand-roll JSON-RPC or OAuth
wire protocols.

Three honest constraints, recorded now so they are not rediscovered late:

- Phase 0 is a spike that is permitted to fail. It pins an SDK v2 version and
  proves stdio, Streamable HTTP, output schemas, cancellation, and auth
  middleware before any runtime PR proceeds. Unresolved SDK incompatibilities
  are explicit blockers, not assumptions to work around later.
- Phase 5 deliberately retires `src/serve/oauth.ts`, the hand-written OAuth
  authorization server merged in
  [#81](https://github.com/The-Running-Dev/SubZeroDev.Blog/pull/81) on
  2026-08-01. That is planned obsolescence rather than churn: #81 is the
  interim self-contained implementation, and MCP Next moves protocol handling
  onto official SDK provider interfaces with durable storage, so a container
  restart no longer forces every client to reauthorize. The current service
  stays deployable until the replacement passes interoperability and restart
  tests, and removal is its own pull request.
- Extraction into a reusable package is deferred to Phase 8 and requires a
  genuine second consumer. Without that evidence the runtime stays internal,
  explicitly to avoid publishing an unsupported framework.

Phases: architecture records and the SDK v2 spike; contract core and compiler;
generic runtime and module adapter; capabilities plus read-only migration;
mutation migration (preserving the repository mutex, audit log, and write-path
allowlist as declarative middleware); SDK-backed authorization; the OpenAPI
importer and HTTP adapter, where an OpenAPI document is an input catalogue and
never permission to expose an API; cutover; and the extraction decision.

Eight decisions must be settled and recorded in Phase 0 before implementation,
including whether generated artifacts are committed or CI-only, the pinned SDK
versions, the durable OAuth store, and the final scope-to-capability matrix.

## Sequencing for Milestones 10-12

These three are independent in scope but not in cost, so the recommended order
is deliberate:

1. **Milestone 10, phases A and B first.** Every pull request in Milestones 11
   and 12 currently pays the untargeted-CI tax measured above, and phase B
   also closes a live least-privilege gap. Fixing the trigger contract first
   makes all subsequent work cheaper and safer to iterate on.
2. **Milestone 11 next.** These are user-visible correctness defects in
   published content, and `TODO-NEXT.md` is explicit that MCP Next must not
   become a prerequisite for them. Landing the corrected domain services first
   means Milestone 12 migrates correct code once, instead of migrating known
   defects into a new architecture and fixing them there.
3. **Milestone 10's remaining phases** (E and F, plus C and D whenever the
   upstream template work lands) can interleave, since phase E touches only
   monitoring.
4. **Milestone 12 last**, behind its Phase 0 spike. Sequencing it last also
   gives the newly merged OAuth implementation real production soak time
   before it is replaced.
