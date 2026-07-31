# blog-mcp

An MCP server that exposes this repository's deterministic publishing steps
— front-matter validation, post authoring, tag/hub maintenance, and local
git — as callable tools, so an agent no longer has to remember to get them
right by reading prose. See [AGENTS.md](../../AGENTS.md) and
[.agents/workflows/](../../.agents/workflows/) for the human-facing
description of the same workflow — each step there now names the specific
tool that implements it, with the original manual/CLI instructions kept as
an explicit fallback for sessions without this tool layer.

Local authoring, git, and CI/deploy monitoring are on by default. Remote
actions (push, PR creation, auto-merge) are opt-in and off by default — see
[Capability tiers](#capability-tiers). Both stdio (default) and HTTP
transports are available; see [Running](#running).

## Why a container with no Docker inside it

The image ships PowerShell 7, git, and the GitHub CLI, but not Docker. It
therefore cannot run the production Docusaurus build itself — that remains
the job of the `Verify Documentation Build` required check in
[`.github/workflows/docs-ci.yml`](../../.github/workflows/docs-ci.yml). What
it *can* run unmodified is `build/Test-Documentation.ps1` (the link/anchor/
terminology gate), which is pure PowerShell with no Docker or network
dependency.

The repository is never baked into the image, and the checkout itself is
never bind-mounted either: on every start, the entrypoint clones (or
reconciles an existing clone of) `BLOG_MCP_CLONE_URL` into a volume at
`BLOG_MCP_WORKSPACE` before the server or transport starts. The container is
otherwise self-contained — its only inputs are environment variables and,
optionally, a named volume to persist the clone across restarts. This is what
makes headless operation possible: an authoring client with no local checkout
at all (a phone, a scheduled job, a remote automation service) can still
drive the full publishing pipeline. See [Repo acquisition](#repo-acquisition).
The one deliberate exception is the directory watcher's *input* directory
(never the checkout) — see [Watcher (directory)](#watcher-directory).

## Running

Build once:

```bash
docker build -t subzerodev-blog-mcp tools/blog-mcp
```

Or skip the local build entirely and pull the image CI publishes on every
push to `main` (`.github/workflows/blog-mcp-image.yml`), tagged both
`latest` and `sha-<commit>` (the latter for pinning to an exact build rather
than trusting a floating tag):

```bash
docker pull ghcr.io/the-running-dev/subzerodev-blog-mcp:latest
```

Substitute `ghcr.io/the-running-dev/subzerodev-blog-mcp:latest` for
`subzerodev-blog-mcp` in any `docker run` command below to run the
published image instead of one built locally. This does **not** apply to
`docker-compose.yml`: its services still declare a `build:` section, so
`docker compose up -d --build` (the documented command) always rebuilds
locally regardless of what `image:` is named -- see the comment on
`docker-compose.yml`'s `image:` line for why that stays as-is rather than
pointing at the registry.

Run with only env vars and a named volume — no bind mount anywhere
(stdio transport, the default):

```bash
docker run -i --rm \
  -v blog-workspace:/workspace \
  -e BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
  -e BLOG_MCP_GIT_USER_NAME=blog-bot -e BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
  subzerodev-blog-mcp
```

Or run outside a container during development:

```bash
cd tools/blog-mcp
npm install
npm run build
BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
BLOG_MCP_WORKSPACE=/tmp/blog-workspace \
BLOG_MCP_GIT_USER_NAME=blog-bot BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
node dist/index.js
```

Or, for an always-on deployment, `docker-compose.yml` is provided as two
service *forms* of the same image sharing config via a plain YAML anchor
(`x-blog-mcp-common`), not Compose's own `extends:`:

```bash
cd tools/blog-mcp
cp .env.example .env   # fill in real values; .env is git-ignored
docker compose up -d --build          # `serve` (default): /mcp + the web UI
docker compose --profile http up -d --build http   # `http` only: bare /mcp, no UI
```

`serve` (see [Serve mode (web UI)](#serve-mode-web-ui)) is the default --
plain `docker compose up -d` starts only it, since it's already a strict
superset of `http` mode. `http` is opt-in via the `http` Compose profile,
naming the service explicitly so `serve` doesn't also start alongside it.
Don't bring both up against the same volume at once: the repo mutex
(`src/exec/repoLock.ts`) only serializes writes within one process, not
across two, so two containers sharing one working tree would race on git
operations.

`BLOG_MCP_HTTP_HOST` is fixed to `0.0.0.0` in `docker-compose.yml` itself
(required for the published port to reach the container at all -- see the
note in [Serve mode](#serve-mode-web-ui)); every other variable lives in
`.env`. There is deliberately no compose service for stdio mode: it's spawned
per MCP-client session (`docker run -i --rm ...` above), not a standing
background process.

### Repo acquisition

`src/bootstrap/repo.ts`'s `ensureRepo()` runs once, inside the server
process, before the transport starts (never per-request — `src/http.ts`
builds a fresh `McpServer` per request, so cloning there would fetch on
every request). It never discards uncommitted work: no `reset --hard`, no
`clean`, no `rm -rf` of the volume, matching the same rule in
[What is deliberately not a tool](#what-is-deliberately-not-a-tool).

| State of `BLOG_MCP_WORKSPACE/repo` | Action |
|---|---|
| Absent or empty | Clone (full, never shallow) |
| Non-empty, not a git repo | Refuse startup |
| `.git` present but corrupt/invalid | Refuse startup |
| `origin` doesn't match `BLOG_MCP_CLONE_URL` | Refuse startup — never repoints the remote |
| Clean, on the base branch | Fetch + fast-forward |
| Clean, on a feature branch already merged (checked via `gh pr list`) | Switch to base + fast-forward |
| Clean, on an unmerged feature branch | Fetch only; left parked, reported |
| Dirty (staged/unstaged/untracked changes) | Fetch only; **boots successfully anyway** — refusing would make the container unrecoverable, since there'd be no tool left to inspect it |

Required env vars: `BLOG_MCP_CLONE_URL`, `BLOG_MCP_GIT_USER_NAME`,
`BLOG_MCP_GIT_USER_EMAIL` (git identity is set repo-local, in the volume, not
`--global` — nothing set it before this, so a fresh clone would otherwise
fail every commit with "Please tell me who you are"). `BLOG_MCP_WORKSPACE`
defaults to `/workspace`.

### MCP client configuration (stdio)

```json
{
  "mcpServers": {
    "blog-publish": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "blog-workspace:/workspace",
        "-e", "BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git",
        "-e", "BLOG_MCP_GIT_USER_NAME=blog-bot",
        "-e", "BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com",
        "subzerodev-blog-mcp"
      ]
    }
  }
}
```

### HTTP transport

Session-based, per the MCP Streamable HTTP spec: `POST /mcp` with no
`Mcp-Session-Id` header either is an `initialize` request (a new session is
created and its id returned in the `Mcp-Session-Id` response header) or
isn't (rejected with `400`). Every subsequent `POST`/`GET`/`DELETE` for that
session includes the same header. `GET /mcp` opens a live SSE stream for
server-to-client notifications; `DELETE /mcp` terminates the session. Both
require a known `Mcp-Session-Id` (`400` if the header is missing, `404` if
it doesn't match a live session). There is no event store, so a dropped
`GET` stream does not replay missed messages — the client just reissues a
fresh `GET`. A session idle for 30 minutes (no request at all) is reaped
automatically, so a client that disappears without sending `DELETE` doesn't
leak its server state forever.

```bash
docker run --rm -p 8765:8765 \
  -v blog-workspace:/workspace \
  -e BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
  -e BLOG_MCP_GIT_USER_NAME=blog-bot -e BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
  -e BLOG_MCP_HTTP_HOST=0.0.0.0 -e BLOG_MCP_HTTP_TOKEN \
  subzerodev-blog-mcp http
```

The default bind is `127.0.0.1` — safe for direct local use, but Docker's
`-p` cannot forward into a container's loopback interface, so running in a
container with a published port requires the `BLOG_MCP_HTTP_HOST=0.0.0.0`
override shown above. Pass `BLOG_MCP_HTTP_TOKEN` **by name** (`-e
BLOG_MCP_HTTP_TOKEN`, not `-e BLOG_MCP_HTTP_TOKEN=secret`), same reasoning as
`GH_TOKEN` below. Without a token, the server logs a warning to stderr and
runs unauthenticated — acceptable only while bound to loopback.

| Env var | Default | Effect |
|---|---|---|
| `BLOG_MCP_HTTP_HOST` | `127.0.0.1` | Bind address. |
| `BLOG_MCP_HTTP_PORT` | `8765` | Bind port. |
| `BLOG_MCP_HTTP_TOKEN` | unset | Bearer token required on every `/mcp` request (constant-time compared). A session initialized with this token gets full env-derived capabilities. |
| `BLOG_MCP_HTTP_READONLY_TOKEN` | unset | A second, more restricted bearer token. A session initialized with *this* token instead gets write/remote/scheduler forced off (`monitor` stays on), regardless of `BLOG_MCP_READ_ONLY`/`BLOG_MCP_ALLOW_REMOTE`/etc. Both tokens are valid on every request; only the `initialize` call decides which tier a session gets, and that's locked in for the session's lifetime. See "Handing this to a third-party MCP client" below. |
| `BLOG_MCP_HTTP_ALLOWED_ORIGINS` | `http://<host>:<port>`, `http://localhost:<port>` | Comma-separated `Origin` allowlist. A request with no `Origin` header (any non-browser client) is always allowed; only a *present, disallowed* `Origin` is rejected — this is what stops a malicious page in a browser from talking to the server via DNS rebinding or a simple cross-origin fetch. |
| `BLOG_MCP_HTTP_MAX_SESSIONS` | `100` | Caps concurrent `/mcp` sessions. A `POST` that would create a session beyond this limit gets `503` instead of being admitted — otherwise a reachable client (more likely with no `BLOG_MCP_HTTP_TOKEN` set) could keep initializing sessions, each holding its own `McpServer`, until the 30-minute idle reap. |

`GET /healthz` returns `{"ok":true}` without auth, for container health checks.

#### Handing this to a third-party MCP client (e.g. a ChatGPT connector)

`BLOG_MCP_HTTP_TOKEN` alone is an all-or-nothing credential: whoever holds it
gets whatever capability tier `BLOG_MCP_READ_ONLY`/`BLOG_MCP_ALLOW_REMOTE`/etc.
grant your own tooling — including `blog_push`, `blog_create_pr`, and
`blog_arm_auto_merge` if remote is on. Handing that same token to a
third-party product (ChatGPT's Developer Mode connector, for example) means
its own per-action confirmation prompts become the *only* thing standing
between a model and a real push/PR/merge on this repo.

Set `BLOG_MCP_HTTP_READONLY_TOKEN` to a second, separately-generated secret
and give *that* one to the third party instead. A session it initializes gets
`write`/`remote`/`scheduler` forced off no matter what the primary token's
capabilities are — it can list and read posts, check validation, and check
CI/deploy status, but every mutating tool is simply unregistered for that
session, not just refused at call time.

### Serve mode (web UI)

`serve` is a third transport (`src/serve.ts` / `src/serve-bin.ts`), one Node
process, no supervisor: `/mcp` and `/healthz` (identical to HTTP transport
above), `/api/*` (read: list posts, show a post, list tags, git log,
branches, repo health, PR/check/deploy status; write: create/update/delete a
post, parse a pasted markdown file into its fields, create a branch, stage,
commit, push, open a PR, arm auto-merge), and an admin UI at `/` — React +
Vite + TypeScript (`tools/blog-mcp/ui/`, see its own README), served as a
static build via a scoped, traversal-safe file server
(`src/serve/static.ts`), same CSP as before (`default-src 'self'` — no CDN
assets, no inline scripts). The UI's "Compose" view drives the full publish
sequence (branch → write → stage → commit → push → open PR) as one guided
flow, then arming auto-merge is a separate, explicit button — never
automatic on PR creation. The slug field autocompletes from existing posts
and auto-loads one the moment it's picked; tags are checkboxes drawn from
`docs/blog/tags.yml` (falling back to free text if that vocabulary can't be
loaded, so a fetch outage never leaves the form unable to publish at all);
and a "Paste raw markdown instead" toggle accepts a whole post file
(front matter fences + body) and derives every field from it in one step,
parsed server-side by the same parser every other tool uses
(`blog_parse_markdown`), not a hand-rolled client-side one. The Posts view
links each title to its computed canonical URL -- where the post lives once
published, not a confirmation that it's actually deployed there; that
confirmation is `blog_verify_published_url`'s job, gated on a specific
`mergeCommitSha`, and isn't something an index listing can cheaply do for
every row -- and has per-row "Edit" (jumps into Compose with that post
loaded) and "Delete" (confirms, then drives the same guided branch → delete
→ stage → commit → push → PR pipeline) buttons.

```bash
docker run --rm -p 8765:8765 \
  -v blog-workspace:/workspace \
  -e BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
  -e BLOG_MCP_GIT_USER_NAME=blog-bot -e BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
  -e BLOG_MCP_HTTP_HOST=0.0.0.0 -e GH_TOKEN -e BLOG_MCP_UI_PASSWORD_HASH \
  subzerodev-blog-mcp serve
```

The UI reuses every `BLOG_MCP_HTTP_*` env var from HTTP transport above
(`_HOST`, `_PORT`, `_TOKEN`/`_READONLY_TOKEN` for `/mcp`, `_ALLOWED_ORIGINS`,
`_MAX_SESSIONS`), plus:

| Env var | Default | Effect |
|---|---|---|
| `BLOG_MCP_UI_PASSWORD_HASH` | unset | `scrypt:<saltHex>:<hashHex>` (see `src/serve/auth.ts`'s `hashPassword`). **Unset disables `/login`, the UI, and `/api` entirely** (404) — `/mcp` and `/healthz` keep working. Generate one after building: `node -e "console.log(require('./dist/serve/auth.js').hashPassword(process.argv[1]))" '<password>'`. Deliberately a separate secret from `BLOG_MCP_HTTP_TOKEN` — one is a machine bearer token, the other a password a human types into a browser; conflating them means the same value sits in shell history/`ps` *and* a browser's autofill store. |

Auth model: a 256-bit random session id in an `HttpOnly`, `SameSite=Strict`
cookie, tracked server-side (an in-memory map, so a restart invalidates every
session), 30-minute sliding expiry, and a rate-limited login (5 failed
attempts / 15 minutes). `/api` additionally requires a custom
`X-Blog-Mcp-Csrf` header on every request — a cross-site form/image/script
tag cannot set a custom header, so the classic CSRF vectors are blocked
independent of `SameSite`. **A missing `Origin` header is allowed, same as
`/mcp`'s `Origin` check** — verified against a real browser: a same-origin
`fetch` POST does not reliably send one, so requiring it outright would lock
out the login form itself. `Content-Security-Policy: default-src 'self'` is
set on every response the static UI serves; post bodies and any
author-controlled text are rendered via `textContent`, never `innerHTML`.

The UI session's registration profile is always the full one — write +
remote + monitor (`src/serve/capabilities.ts`) — independent of
`BLOG_MCP_READ_ONLY`/`BLOG_MCP_ALLOW_REMOTE`. Every route, read or write, is
an explicit `tools/call` over an in-process MCP client (`InMemoryTransport`,
`src/serve/client.ts`) — never a generic "call any tool by name" proxy,
which would silently re-expose whatever write tools are registered beyond
this route table's own explicit list (`src/serve/api.ts`).

**Arming auto-merge validates against the SHA this session actually
pushed, not whatever `GET /api/pr/:number` currently reports.** Fetching
the "expected" head from the same place the check validates against would
make the cross-check tautological — it would always "match" and defeat the
entire reason `blog_arm_auto_merge` takes an explicit `headSha` at all: to
catch the branch having moved (a concurrent push) between publish and
arming. This was a real bug caught by manually clicking through the UI in a
real browser during this phase's development, not by the automated test
suite (which drove the API directly and so never exercised the client-side
sequencing) — see `ui/src/views/ComposeView.tsx`'s `handleArm` and the
comment there.

### Scheduler (cron)

`BLOG_MCP_ALLOW_SCHEDULER=1` (and `BLOG_MCP_ALLOW_REMOTE=1`) starts a 60s
tick loop inside the `serve` process (`src/scheduler/engine.ts`) alongside
registering the `blog_schedule_*` tools. Model (i) only — **hold the
branch/PR, merge at time T** — never "merge now, publish later via a future
frontmatter date." That alternative was considered and rejected: it depends
on unverified assumptions about the shared Docusaurus template's build
behavior, and its failure mode is *silent early publication* to RSS/Atom
subscribers, versus hold-then-merge's worst case of *published late*. See
MILESTONES.md Milestone 8 for the full comparison.

The PR already exists (opened via `blog_create_pr`, by a human or the UI's
Compose flow) before a job is ever scheduled — nothing here creates a post
or opens a PR on a timer. Each tick, for every due job:

1. Refuses to act at all while the working tree is dirty or parked off the
   base branch — fail-safe, not an error. (`blog_create_branch` only checks
   *staged* changes; the scheduler requires fully clean.)
2. Re-reads the PR's live state via `blog_pr_status` — **never a locally
   cached "already armed" flag** — so a crash between arming and persisting
   status self-heals on the next tick instead of getting stuck.
3. `MERGED` → job done. `CLOSED` → terminal `needs-attention`. A merge
   conflict → terminal `needs-attention`, **never retried**: there is no
   rebase tool and by design never will be. Otherwise, (re-)arms auto-merge
   with the SHA validated at schedule time; a SHA mismatch (the branch moved)
   is also terminal `needs-attention` — `blog_arm_auto_merge`'s own message
   says "revalidate and retry," meaning a human decision, not this loop
   silently substituting a SHA nobody told it to trust.

Every job explicitly declares its own missed-tick policy — never an
implicit default: `{ mode: 'catch_up' }` runs it whenever next noticed, or
`{ mode: 'skip_if_older_than', seconds }` abandons it past a staleness
bound. `schedule.json` (`${BLOG_MCP_WORKSPACE}/state/schedule.json`) is
written temp-file-then-rename, so a `SIGKILL` mid-write can never corrupt
it; a missing or corrupted file is treated as empty rather than crashing
the tick loop. A single in-process guard prevents overlapping ticks (this
is one scheduler in one process, not a distributed lease protocol — running
multiple `serve` containers against the same workspace volume is
unsupported, matching the existing single-instance assumption already
implicit in the in-process repo mutex). `SIGTERM`/`SIGINT` wait for any
in-flight tick to finish before the process exits, so a shutdown can never
land mid-`git`-write.

The scheduler's own registration profile (`CRON_CAPABILITIES`,
`src/serve/capabilities.ts`) has `write: false` — it only ever calls
`blog_pr_status`/`blog_arm_auto_merge` (Tier C, registered independent of
write-tier tools), never `blog_create_post`/`blog_stage`/`blog_add_tag`.

### Watcher (directory)

`BLOG_MCP_ALLOW_WATCHER=1` (and `BLOG_MCP_ALLOW_REMOTE=1`, and
`BLOG_MCP_WATCH_DIR` pointed at a real path) starts a poll loop inside the
`serve` **and** `http` processes (`src/watcher/engine.ts`) that publishes
`.md` files dropped into a directory — the one deliberate exception to this
container never being bind-mounted (see [Why a container with no Docker
inside it](#why-a-container-with-no-docker-inside-it)): `docker-compose.yml`
bind-mounts `BLOG_MCP_WATCH_HOST_DIR` (default `./watch`) to
`BLOG_MCP_WATCH_DIR` (default `/watch`) so there's a real host path to drop
files into.

Polling (default every 15s, `BLOG_MCP_WATCH_INTERVAL_MS`), not
`fs.watch`/inotify — bind mounts under Docker Desktop
(osxfs/gRPC-FUSE/virtiofs) and Windows WSL2 mounts are notoriously
unreliable for native change-notification events across the VM boundary.

A dropped file must already have **complete front matter** — title,
description, slug, at least one tag — the same fields `blog_create_post`
requires. Unlike Compose's "Paste raw markdown" tab, there's no human here to
catch a bad heading-detection guess, so an incomplete file is rejected
outright, never best-effort patched up. For each `*.md` file found directly
in the watch directory (subdirectories are left alone):

1. Claims the file immediately (`processing/`) before any git/gh action, so
   no future tick can pick it up twice — this is also the crash marker: a
   file still in `processing/` when the watcher starts means a prior run
   died mid-file, and it's moved straight to `failed/` with an explanation
   rather than silently reprocessed (it may already have an open PR).
2. Parses it via `blog_parse_markdown` (the same parser the UI's Markdown
   tab uses) and rejects anything with missing/empty required fields.
3. Checks whether a post with that slug already exists (`blog_list_posts`)
   to decide `blog_create_post` vs. `blog_update_post`.
4. Runs the same branch → write → stage → commit → push → open-PR sequence
   the web UI's Compose form drives, one `tools/call` at a time — the repo
   mutex and audit log apply exactly as they would to a human's action.
5. If `BLOG_MCP_WATCH_AUTO_MERGE` isn't explicitly disabled (on by default,
   matching Compose's own default), arms auto-merge using the SHA this run
   itself just pushed — never re-fetched from the PR, for the same reason
   `blog_arm_auto_merge` takes an explicit `headSha` at all.
6. Moves the file to `processed/` (success) or `failed/` plus a sibling
   `.error.txt` explaining why (anything short of full success) — nothing
   dropped is ever deleted, only moved.

Only requires the working tree to be clean before a tick runs (not also
parked on the base branch, unlike the scheduler's stricter check) —
`blog_create_branch` always branches fresh from `origin/<base branch>`
regardless of what's currently checked out, so being left on a previous
file's feature branch between ticks is harmless. Files are processed one at a
time; there is only one working tree.

The watcher's own registration profile (`WATCHER_CAPABILITIES`,
`src/serve/capabilities.ts`) has `write: true` (needed for
`blog_create_post`/`blog_update_post`/`blog_stage`/`blog_commit`, on top of
the same push/PR/arm-merge tools the scheduler uses), with
`writablePathPrefixes` narrowed the same way `CRON_CAPABILITIES` is —
dropping `.github/workflows/`, `.config/`, `tools/`, `build/` — as defense in
depth for an unattended actor.

A bind-mounted host directory arrives with the *host's* uid/gid, not
auto-`chown`'d the way the named `blog-workspace` volume is (see
[Repo acquisition](#repo-acquisition)) — run `chown 1000:1000 ./watch` (or
equivalent) on the host directory so the container's non-root `node` user can
write into `processing/`/`processed/`/`failed/`.

| Env var | Default | Effect |
|---|---|---|
| `BLOG_MCP_ALLOW_WATCHER` | off | Must be `1`/`true` (with `BLOG_MCP_ALLOW_REMOTE=1` too) to start the watcher |
| `BLOG_MCP_WATCH_DIR` | unset | Container-side path to watch; the watcher never starts without this set |
| `BLOG_MCP_WATCH_INTERVAL_MS` | `15000` | Poll interval, in milliseconds |
| `BLOG_MCP_WATCH_AUTO_MERGE` | on | Set to `0`/`false` to leave every watcher-opened PR for manual review instead |

## Capability tiers

Tiers gate tool **registration**, not just behavior — an unregistered tool
cannot be invoked at all, which is a stronger guarantee than a registered
tool that merely refuses at call time. This also matters for prompt
injection: a tool that doesn't exist in the list a client sees cannot be
talked into existing by text embedded in a blog draft or a PR comment.

| Env var | Default | Effect |
|---|---|---|
| `BLOG_MCP_READ_ONLY=1` | off | Unregisters every write tool (Tier A writes, all of Tier B, and Tier C). Tier D (monitoring) stays registered, since it's read-only. |
| `BLOG_MCP_ALLOW_REMOTE=1` | off | Registers Tier C (push/PR/auto-merge). Ignored if `BLOG_MCP_READ_ONLY=1` is also set. |
| `BLOG_MCP_ALLOW_MONITOR=0` | on | Unregisters Tier D (CI/deploy monitoring). Set to disable it explicitly; it's on by default because it never writes anything. |
| `BLOG_MCP_ALLOW_SCHEDULER=1` | off | Registers the scheduler tools (`blog_schedule_publish`/`_list_scheduled_jobs`/`_cancel_scheduled_job`). Requires `BLOG_MCP_ALLOW_REMOTE=1` too — unlike Tier C, **not** gated by `BLOG_MCP_READ_ONLY`, since these tools never touch a local-write tool. |

```bash
docker run -i --rm -e BLOG_MCP_READ_ONLY=1 -v blog-workspace:/workspace -e BLOG_MCP_CLONE_URL -e BLOG_MCP_GIT_USER_NAME -e BLOG_MCP_GIT_USER_EMAIL subzerodev-blog-mcp
docker run -i --rm -e BLOG_MCP_ALLOW_REMOTE=1 -e GH_TOKEN -v blog-workspace:/workspace -e BLOG_MCP_CLONE_URL -e BLOG_MCP_GIT_USER_NAME -e BLOG_MCP_GIT_USER_EMAIL subzerodev-blog-mcp
```

**Embedders** (an in-process consumer that isn't stdio or `/mcp` HTTP — a later phase's web UI or scheduler): `createServer({ capabilities })` accepts an explicit `Capabilities` object (`write`, `remote`, `monitor`, `scheduler`, `writablePathPrefixes`) that overrides the env-derived tiers above entirely, so each consumer sharing one process can carry its own registration profile and its own write-path allowlist rather than one process-global setting. Both `src/index.ts` and `src/http-bin.ts` omit `capabilities`, so their behavior is exactly the env table above, unchanged.

**Token delivery.** Pass `GH_TOKEN` **by name** (`-e GH_TOKEN`, not `-e GH_TOKEN=$(gh auth token)`) so the value never appears in the container's command line or in `ps`/shell history. The entrypoint wires `credential.helper = !gh auth git-credential` when a token is present, so `blog_push` authenticates over HTTPS without ever writing a token into the volume's `.git-credentials`. Captured subprocess output is also scrubbed of anything shaped like a `gh_*`/`github_pat_*` token before it can reach a tool result or an audit line.

## What is deliberately not a tool

There is no `git reset --hard`, `git clean`, `git push --force`, `git
rebase`, `git branch -D`, or history rewriting. The tool surface itself is
the safety boundary for this server — nothing here can discard uncommitted
work or rewrite published history, by construction.

`blog_stage` and every write tool share one path allowlist
(`src/domain/paths.ts`): only `docs/blog/`, `docs/src/`, `docs/docs/`,
`docs/docusaurus.config.ts`, `docs/sidebar.ts`, root `*.md`, `.agents/`,
`.config/`, `.github/workflows/`, `build/`, and `tools/` are writable or
stageable, and `-A`, `--all`, `.`, and any path containing `..` or `;` are
rejected outright.

## Tool catalogue (this build)

Read-only:

- `blog_repo_status`, `blog_list_posts`, `blog_get_post`, `blog_list_tags`, `blog_list_authors`
- `blog_validate_posts` — front matter, slugs (including permanence against `HEAD`), dates, the `<!-- truncate -->` marker, single-H1-in-excerpt, template-placeholder leftovers, tag/author membership. Nothing in the repository validated this before; see `MILESTONES.md` Milestone 5.
- `blog_validate_hubs` — resolvable hrefs, no duplicate hrefs, and a post whose tag matches a hub's rule but is missing from it (the class of bug that produced PR #31)
- `blog_run_doc_gate`, `blog_run_artifact_check` (honestly reports `delegated-to-ci` when no production artifact is present), `blog_preflight`
- `blog_log` — recent commits, defaulting to `origin/<base>` rather than `HEAD` (a long-lived container's working tree may be parked on a stale branch), NUL-separated records and a control-character field separator so a crafted commit subject can't spoof the output shape
- `blog_branches` — local branches with ahead/behind counts against `origin/<base>` and the currently-checked-out one flagged
- `blog_repo_health` — one consolidated view (branch, dirty, parked-off-base, ahead/behind) for dashboards/monitoring; never used to gate a decision by itself

Local filesystem writes:

- `blog_create_post`, `blog_update_post` (refuses a slug change unless both `allowSlugChange` and `compatibilityRouteAdded` are set)
- `blog_add_tag`
- `blog_add_hub_entry` — edits the hand-maintained `entries[]` array in a hub `.tsx` file by AST text-range splice (TypeScript compiler API), never regex, so existing formatting is preserved byte-for-byte outside the inserted entry

Local git:

- `blog_sync_base` — `git fetch --prune origin <base>`; pass `ffOnly` to also fast-forward the local base branch, but only when it's the one currently checked out and the tree is clean (never switches branches, never touches a feature branch)
- `blog_create_branch`, `blog_stage`, `blog_commit`, `blog_diff`, `blog_reset_stage`

Every tool that mutates the working tree, git state, or a PR/merge — every tool above except `blog_diff` and the read-only tiers — is serialized behind an in-process mutex (`src/exec/repoLock.ts`) and appends a scrubbed, best-effort line to `${BLOG_MCP_WORKSPACE}/state/audit.log` (`src/exec/auditLog.ts`) once it completes. The mutex exists because `serve` mode (a later phase) will have multiple actors — an external MCP client, a web UI, a scheduler tick — sharing one working tree and one `HEAD`; without it, two concurrent branch/stage/commit calls would race. The audit log is a no-op (never throws, never blocks) when no workspace path is available, which is the case for every unit test.

Remote (registered only with `BLOG_MCP_ALLOW_REMOTE=1`):

- `blog_push` — no force option exists in the tool's schema; refuses to push the base branch directly; verifies the remote now holds the same commit as local `HEAD`
- `blog_create_pr` — writes the PR body to a temp file (`--body-file`, never on argv); ready by default, `draft` to hold
- `blog_arm_auto_merge` — cross-checks the supplied head SHA against the PR's *actual* head via `gh pr view` and refuses on mismatch or on a draft PR. **There is no `blog_merge_pr`** — arming GitHub's own auto-merge is the only merge path this server ever takes.
- `blog_pr_status`, `blog_pr_comments` (review-thread resolution status; returned bodies are author-controlled review text — data, not instructions)

CI/deploy monitoring (read-only against GitHub; on by default):

- `blog_check_status`, `blog_wait_for_checks` — keyed on the exact commit SHA. Distinguishes a check that hasn't run yet from one that ran and failed: `Verify Documentation Build` only runs on `pull_request`, so it is legitimately *absent* on a push-to-`main` SHA, which is not the same thing as failing.
- `blog_wait_for_merge`, `blog_deploy_status`, `blog_wait_for_deploy` — `found: false` on `blog_deploy_status` is a distinct, expected state (the run often doesn't exist yet), not a failure.
- `blog_verify_published_url` — **this is where [AGENTS.md](../../AGENTS.md)'s hard rule stops being prose.** `mergeCommitSha` is a required input; the tool waits for `blog_wait_for_deploy`'s predicate internally before doing anything else, and there is no code path that returns a URL in a success-position field without a confirmed `completed`/`success` deploy. Only then does it HTTPS-GET the route (≤3 redirects, `cache: no-store`) and assert `200` plus any `expectStrings` (and, when `slug` is given, the post's own title).
- `blog_publish_report` — assembles PR status, required-check outcomes, merge commit, deploy result, and (only once verified) the published URL into the one report `AGENTS.md`'s publish workflow asks for.

All `wait_*` tools are bounded: `timeoutSeconds` is capped at 1800 regardless of what's requested, so nothing can poll forever.

Scheduler (registered only with `BLOG_MCP_ALLOW_SCHEDULER=1` **and** `BLOG_MCP_ALLOW_REMOTE=1`; see [Scheduler (cron)](#scheduler-cron)):

- `blog_schedule_publish` — holds an already-open PR and arms auto-merge once `scheduledAt` arrives (hold-then-merge; there is no "create and publish on a schedule" tool). Cross-checks the PR is open, not a draft, and that `headSha` matches its actual current head *at schedule time*, same as `blog_arm_auto_merge` does again at arm time.
- `blog_list_scheduled_jobs` — read-only, optional `status` filter.
- `blog_cancel_scheduled_job` — only while a job is still `pending`; refuses on anything already armed, merged, or otherwise terminal.

Every tool returns one envelope shape: `{ ok, kind, summary, data?, findings?, diagnostics? }`.
`kind: 'validation'` and `kind: 'precondition'` are normal (non-`isError`) results —
a gate that correctly reports three bad tags executed perfectly. Only
`kind: 'infrastructure'` (a crashed subprocess, a timeout, unparseable output)
sets `isError: true`.

## Development

```bash
npm install
npm --prefix ui install   # one-time -- the admin UI (tools/blog-mcp/ui/) is a separate npm project
npm run build   # tsc -> dist/
npm test        # vitest; `pretest` builds ui/ first, since src/serve/static.ts now serves its output
node test/smoke-stdio.mjs                  # exercises the built server over a real stdio subprocess
node test/smoke-stdio.mjs --read-only      # same, asserting write and remote tools are unregistered
node test/smoke-stdio.mjs --remote         # same, asserting Tier C tools are registered
node test/smoke-stdio.mjs --scheduler      # same, asserting the blog_schedule_* tools are registered
BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
BLOG_MCP_WORKSPACE=/tmp/blog-workspace \
BLOG_MCP_GIT_USER_NAME=blog-bot BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
node dist/http-bin.js --port 8765          # runs the HTTP transport directly, outside Docker
```

`test/http.test.ts` exercises the HTTP transport with real `fetch()` calls against an ephemeral-port server: health check, 404s, session-based `GET`/`DELETE /mcp` (missing/unknown `Mcp-Session-Id` → `400`/`404`, a live SSE stream, session termination), bearer-auth accept/reject, `Origin` allow/reject, and a full `initialize` → `tools/list` → `tools/call` round trip that threads the session id like a real client.

`test/bootstrap-repo.test.ts` exercises `ensureRepo()` against a real scratch bare git remote (not a mock): fresh clone, idempotent re-run (fast-forward), refusal on a non-empty non-git directory, refusal on a mismatched `origin`, dirty-tree boot-without-switching, and an unmerged feature branch staying parked. `test/smoke-stdio.mjs` clones this repository itself (a fast, local-filesystem clone) into a scratch `BLOG_MCP_WORKSPACE` rather than pointing at the live checkout directly, since clone-mode has no bind mount to point at.

Remote and monitor tool tests never touch real GitHub: `test/remote.test.ts` drives `blog_push` against a scratch bare git remote and the PR tools against `test/fixtures-bin/gh-shim.mjs`; `test/monitor.test.ts` drives the same shim for check/deploy status plus a real local HTTP server (`node:http`, ephemeral port) for the `blog_verify_published_url` success path. Point `BLOG_MCP_GH_COMMAND` at `["node","/path/to/gh-shim.mjs"]` (a JSON array) to reuse it elsewhere — this exists because a `.cmd`/`.bat` shim cannot be `spawn()`ed under `shell:false` on Windows at all, so `exec/gh.ts` never relies on PATH-based resolution of a literal `gh` name for tests. The hard-rule test in `monitor.test.ts` is the load-bearing one: it drives the shim through `in_progress`, `completed`/`failure`, and *absent* deploy states and asserts `verified: false` with no `url` field present in any of them.

`test/repoInfo.test.ts` exercises `blog_log`/`blog_branches`/`blog_repo_health` and `blog_sync_base`'s `ffOnly` fast-forward against a scratch bare remote, and asserts the audit log picks up a mutating call (`blog_sync_base`) while never logging a read-only one (`blog_log`). `test/repoLock.test.ts` proves the mutex actually serializes overlapping calls (not just "happens to run in order") and that one rejected call never wedges the queue for calls behind it. `test/auditLog.test.ts` covers the no-op-when-unset path, secret scrubbing, and that a write failure never throws.

`test/capabilities.test.ts` calls `createServer({ capabilities })` directly (introspecting the real `McpServer`'s registered tool names, not a fake) and proves the override wins over env in both directions — write+remote registered despite `BLOG_MCP_READ_ONLY=1`, and vice versa — plus that omitting `capabilities` reproduces the exact env-derived tool set from before this option existed. A second block proves `writablePathPrefixes` isn't just plumbing: `blog_stage` actually refuses a path that's inside the module's `DEFAULT_ALLOWED_PREFIXES` but outside a narrower override.

`test/auth.test.ts` covers password hashing (round trip, wrong password, two hashes of the same password differing but both verifying, a malformed stored hash rejected rather than throwing), session creation/sliding-expiry/expiry-deletes-the-entry (via `vi.useFakeTimers()`), and the login rate limiter's window. `test/serve.test.ts` drives `createServeServer` with real `fetch()` calls end to end: the `/` redirect-to-`/login` gate, the full login → cookie → `/api` round trip, every `/api` rejection path (missing CSRF header, disallowed Origin, no session) against real post/log/branch/health data, and that the UI (and `/login`/`/api`) are cleanly disabled — 404, not silently open — when `BLOG_MCP_UI_PASSWORD_HASH` is unset. One of its assertions (`/api` allows a *missing* `Origin` header) exists specifically because manual browser verification of this phase caught a real bug: a same-origin `fetch` POST from `login.html` did not send an `Origin` header at all, so the original "Origin must be present" check locked out the login form itself.

`test/serve-writes.test.ts` drives every write route end to end over real HTTP, exactly like a browser would, against a scratch bare git remote (never the live checkout): create a branch, create a post, a malformed create-post request failing validation without crashing (exercising `client.ts`'s no-`structuredContent` fallback), stage, commit, push (plus the base-branch-push refusal), open a PR and arm auto-merge via `test/fixtures-bin/gh-shim.mjs`, a SHA-mismatch refusal, an update, a raw-markdown parse (with and without front matter fences), and a delete (confirming the file is gone from the working tree *and* staged). Manually clicking through the Compose UI in a real browser during this phase caught a second real bug beyond what the HTTP-level tests could reach: the "Arm auto-merge" button fetched its "expected" head SHA from the same `GET /api/pr/:number` call it then validated against, making the check tautological. The fix (use the SHA the session's own `POST /api/push` actually returned) lives in `ui/src/views/ComposeView.tsx` and has no vitest coverage since this project has no browser/DOM test runner -- the browser walkthrough itself was the regression test, same as the admin UI's React rewrite (Milestone 9): every view, the full publish pipeline, and the delete pipeline were driven end to end against a real scratch repo in a real browser before that milestone was called done.

`test/serve-static.test.ts` covers `src/serve/static.ts`'s Vite-build file server directly (no HTTP server needed, it's a pure function): a real hashed asset, the SPA fallback to `index.html` for client-route paths including `/login`, and -- the load-bearing case -- literal and percent-encoded `../` traversal attempts rejected outright rather than falling back to the SPA shell, plus a malformed percent-encoding and a NUL byte handled without crashing.

`test/scheduler-store.test.ts` covers `schedule.json`'s atomic read/write: missing file, corrupted file, wrong top-level shape (all treated as empty, never thrown), no stray temp file left behind on success, and a second save fully replacing the first. `test/scheduler-engine.test.ts` drives `runTick` against a real scratch git repo and `gh-shim.mjs`: the dirty-tree and parked-off-base fail-safes, a not-yet-due job left untouched, a successful arm, `MERGED`/`CLOSED`/`CONFLICTING` all reaching terminal states correctly (the conflict case asserting it is never retried), a SHA-mismatch reaching `needs-attention` rather than substituting a new SHA, both `skip_if_older_than` and `catch_up` missed-tick policies, and a transient infrastructure failure leaving the job `pending` rather than a false terminal verdict. A separate `startScheduler` test (with an injectable `tickFn`) proves the in-flight guard actually prevents overlapping ticks and that `stop()` drains a tick already in progress rather than interrupting it. `test/tools-scheduler.test.ts` exercises `blog_schedule_publish`'s own up-front cross-checks (PR must be open, not a draft, and the supplied `headSha` must match) plus `blog_list_scheduled_jobs`'s status filter and `blog_cancel_scheduled_job`'s pending-only refusal, all via `test/helpers/fakeServer.ts`.

`test/http-scheduler-wiring.test.ts` is a regression test for a real bug this phase's Docker verification caught and the unit tests above did not: `stateDir` was threaded into the scheduler *engine*'s own serverOptions (`serve-bin.ts`) but not into `createMcpRequestHandler`/`createHttpServer`/`createServeServer`'s serverOptions, so `blog_schedule_publish` failed with "no state directory configured" the moment it was called over a real `/mcp` request. The gap existed because `test/tools-scheduler.test.ts` builds a `ToolContext` by hand, with `stateDir` set directly -- it never exercises the option-threading path a real client actually goes through. This test does: `createHttpServer({ repoRoot, stateDir })` with env-derived capabilities (`BLOG_MCP_ALLOW_REMOTE=1` + `BLOG_MCP_ALLOW_SCHEDULER=1`, not an explicit override), then a real `initialize` → `tools/list` → `tools/call blog_schedule_publish` round trip over HTTP.
