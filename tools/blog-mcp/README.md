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

The repository is never baked into the image, and it is never bind-mounted
either: on every start, the entrypoint clones (or reconciles an existing
clone of) `BLOG_MCP_CLONE_URL` into a volume at `BLOG_MCP_WORKSPACE` before
the server or transport starts. The container is fully self-contained — the
only inputs are environment variables and, optionally, a named volume to
persist the clone across restarts. This is what makes headless operation
possible: an authoring client with no local checkout at all (a phone, a
scheduled job, a remote automation service) can still drive the full
publishing pipeline. See [Repo acquisition](#repo-acquisition).

## Running

Build once:

```bash
docker build -t subzerodev-blog-mcp tools/blog-mcp
```

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

Stateless: every request gets a fresh server and transport (no session
store, no resumable SSE streams) — this matches how the server is already
meant to run, spawned per session by its caller.

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
| `BLOG_MCP_HTTP_TOKEN` | unset | Bearer token required on every `/mcp` request (constant-time compared). |
| `BLOG_MCP_HTTP_ALLOWED_ORIGINS` | `http://<host>:<port>`, `http://localhost:<port>` | Comma-separated `Origin` allowlist. A request with no `Origin` header (any non-browser client) is always allowed; only a *present, disallowed* `Origin` is rejected — this is what stops a malicious page in a browser from talking to the server via DNS rebinding or a simple cross-origin fetch. |

Only `POST /mcp` is implemented (stateless mode has no session to `GET` an
SSE stream from or `DELETE`); both return `405`. `GET /healthz` returns
`{"ok":true}` without auth, for container health checks.

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

```bash
docker run -i --rm -e BLOG_MCP_READ_ONLY=1 -v blog-workspace:/workspace -e BLOG_MCP_CLONE_URL -e BLOG_MCP_GIT_USER_NAME -e BLOG_MCP_GIT_USER_EMAIL subzerodev-blog-mcp
docker run -i --rm -e BLOG_MCP_ALLOW_REMOTE=1 -e GH_TOKEN -v blog-workspace:/workspace -e BLOG_MCP_CLONE_URL -e BLOG_MCP_GIT_USER_NAME -e BLOG_MCP_GIT_USER_EMAIL subzerodev-blog-mcp
```

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

Every tool returns one envelope shape: `{ ok, kind, summary, data?, findings?, diagnostics? }`.
`kind: 'validation'` and `kind: 'precondition'` are normal (non-`isError`) results —
a gate that correctly reports three bad tags executed perfectly. Only
`kind: 'infrastructure'` (a crashed subprocess, a timeout, unparseable output)
sets `isError: true`.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest
node test/smoke-stdio.mjs                  # exercises the built server over a real stdio subprocess
node test/smoke-stdio.mjs --read-only      # same, asserting write and remote tools are unregistered
node test/smoke-stdio.mjs --remote         # same, asserting Tier C tools are registered
BLOG_MCP_CLONE_URL=https://github.com/The-Running-Dev/SubZeroDev.Blog.git \
BLOG_MCP_WORKSPACE=/tmp/blog-workspace \
BLOG_MCP_GIT_USER_NAME=blog-bot BLOG_MCP_GIT_USER_EMAIL=bot@subzerodev.com \
node dist/http-bin.js --port 8765          # runs the HTTP transport directly, outside Docker
```

`test/http.test.ts` exercises the HTTP transport with real `fetch()` calls against an ephemeral-port server: health check, 404s, the stateless 405s on `GET`/`DELETE /mcp`, bearer-auth accept/reject, `Origin` allow/reject, and a full `initialize` → `tools/list` → `tools/call` round trip.

`test/bootstrap-repo.test.ts` exercises `ensureRepo()` against a real scratch bare git remote (not a mock): fresh clone, idempotent re-run (fast-forward), refusal on a non-empty non-git directory, refusal on a mismatched `origin`, dirty-tree boot-without-switching, and an unmerged feature branch staying parked. `test/smoke-stdio.mjs` clones this repository itself (a fast, local-filesystem clone) into a scratch `BLOG_MCP_WORKSPACE` rather than pointing at the live checkout directly, since clone-mode has no bind mount to point at.

Remote and monitor tool tests never touch real GitHub: `test/remote.test.ts` drives `blog_push` against a scratch bare git remote and the PR tools against `test/fixtures-bin/gh-shim.mjs`; `test/monitor.test.ts` drives the same shim for check/deploy status plus a real local HTTP server (`node:http`, ephemeral port) for the `blog_verify_published_url` success path. Point `BLOG_MCP_GH_COMMAND` at `["node","/path/to/gh-shim.mjs"]` (a JSON array) to reuse it elsewhere — this exists because a `.cmd`/`.bat` shim cannot be `spawn()`ed under `shell:false` on Windows at all, so `exec/gh.ts` never relies on PATH-based resolution of a literal `gh` name for tests. The hard-rule test in `monitor.test.ts` is the load-bearing one: it drives the shim through `in_progress`, `completed`/`failure`, and *absent* deploy states and asserts `verified: false` with no `url` field present in any of them.

`test/repoInfo.test.ts` exercises `blog_log`/`blog_branches`/`blog_repo_health` and `blog_sync_base`'s `ffOnly` fast-forward against a scratch bare remote, and asserts the audit log picks up a mutating call (`blog_sync_base`) while never logging a read-only one (`blog_log`). `test/repoLock.test.ts` proves the mutex actually serializes overlapping calls (not just "happens to run in order") and that one rejected call never wedges the queue for calls behind it. `test/auditLog.test.ts` covers the no-op-when-unset path, secret scrubbing, and that a write failure never throws.
