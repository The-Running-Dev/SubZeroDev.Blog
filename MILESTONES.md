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
  `blog_arm_auto_merge`, `blog_pr_status`, `blog_pr_comments`), gated behind
  `BLOG_MCP_ALLOW_REMOTE`, off by default. No merge tool exists other than
  arming GitHub's own auto-merge; a GitHub token is never written to disk in
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

## Milestone 8: blog-mcp becomes a self-contained publishing service — in progress

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
- Phases 5–7: planned. See the phase list in this milestone's design plan
  for UI writes, the cron scheduler that only ever holds a PR and arms
  GitHub's own auto-merge at the scheduled time (never merges directly,
  never fires early on unverified assumptions about build behavior), and the
  conditional `blog_dispatch_deploy` tool.

Phase 1 delivered in the pull request that introduced this section; Phases 2
through 4 in the pull requests that introduced those lines.
