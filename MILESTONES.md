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
