# blog-mcp

An MCP server that exposes this repository's deterministic publishing steps
— front-matter validation, post authoring, tag/hub maintenance, and local
git — as callable tools, so an agent no longer has to remember to get them
right by reading prose. See [AGENTS.md](../../AGENTS.md) and
[.agents/workflows/](../../.agents/workflows/) for the human-facing
description of the same workflow; this package is its deterministic
counterpart.

This first phase is deliberately scoped to everything local and reversible.
There is no push, no PR creation, and no GitHub write access here — see
[Deferred](#deferred) below.

## Why a container with no Docker inside it

The image ships PowerShell 7, git, and the GitHub CLI, but not Docker. It
therefore cannot run the production Docusaurus build itself — that remains
the job of the `Verify Documentation Build` required check in
[`.github/workflows/docs-ci.yml`](../../.github/workflows/docs-ci.yml). What
it *can* run unmodified is `build/Test-Documentation.ps1` (the link/anchor/
terminology gate), which is pure PowerShell with no Docker or network
dependency.

The repository is never baked into the image. It arrives at run time as a
bind mount, so the server always operates on the caller's live working tree
and any commit it makes lands there directly — not trapped in an ephemeral
container layer.

## Running

Build once:

```bash
docker build -t subzerodev-blog-mcp tools/blog-mcp
```

Run against a checkout (stdio transport, the default):

```bash
docker run -i --rm -v "/path/to/SubZeroDev.Blog:/repo" subzerodev-blog-mcp
```

Or run outside a container during development:

```bash
cd tools/blog-mcp
npm install
npm run build
node dist/index.js --repo /path/to/SubZeroDev.Blog
```

### MCP client configuration

```json
{
  "mcpServers": {
    "blog-publish": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "${PWD}:/repo", "subzerodev-blog-mcp"]
    }
  }
}
```

## Capability tiers

Tiers gate tool **registration**, not just behavior — an unregistered tool
cannot be invoked at all, which is a stronger guarantee than a registered
tool that merely refuses at call time. This also matters for prompt
injection: a tool that doesn't exist in the list a client sees cannot be
talked into existing by text embedded in a blog draft or a PR comment.

| Env var | Default | Effect |
|---|---|---|
| `BLOG_MCP_READ_ONLY=1` | off | Unregisters every write tool (Tier A writes and all of Tier B). The remaining ~10 tools can only read and validate. |
| `BLOG_MCP_ALLOW_REMOTE=1` | off | Reserved for Tier C (push/PR/auto-merge), which does not exist yet in this build. |

```bash
docker run -i --rm -e BLOG_MCP_READ_ONLY=1 -v "$PWD:/repo:ro" subzerodev-blog-mcp
```

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

Local filesystem writes:

- `blog_create_post`, `blog_update_post` (refuses a slug change unless both `allowSlugChange` and `compatibilityRouteAdded` are set)
- `blog_add_tag`
- `blog_add_hub_entry` — edits the hand-maintained `entries[]` array in a hub `.tsx` file by AST text-range splice (TypeScript compiler API), never regex, so existing formatting is preserved byte-for-byte outside the inserted entry

Local git:

- `blog_sync_base`, `blog_create_branch`, `blog_stage`, `blog_commit`, `blog_diff`, `blog_reset_stage`

Every tool returns one envelope shape: `{ ok, kind, summary, data?, findings?, diagnostics? }`.
`kind: 'validation'` and `kind: 'precondition'` are normal (non-`isError`) results —
a gate that correctly reports three bad tags executed perfectly. Only
`kind: 'infrastructure'` (a crashed subprocess, a timeout, unparseable output)
sets `isError: true`.

## Deferred

Not in this build — tracked as later phases in the same design:

- **Remote** (`blog_push`, `blog_create_pr`, `blog_arm_auto_merge`, `blog_pr_status`, `blog_pr_comments`) — gated behind `BLOG_MCP_ALLOW_REMOTE`, off by default. No `blog_merge_pr` will ever exist; the only merge path stays GitHub's own auto-merge.
- **CI/deploy monitoring** (`blog_check_status`, `blog_wait_for_checks`, `blog_wait_for_deploy`, `blog_verify_published_url`) — this is where [AGENTS.md](../../AGENTS.md)'s hard rule ("never state or imply a published URL until `Docs Deploy` for that exact merge commit shows `completed`/`success`") becomes a predicate a tool enforces structurally, instead of a paragraph a model has to remember.
- **HTTP/SSE transport** — the core is already transport-agnostic (`src/server.ts` builds a plain `McpServer`); stdio is the only wired entry point today.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest
node test/smoke-stdio.mjs             # exercises the built server over a real stdio subprocess
node test/smoke-stdio.mjs --read-only # same, asserting write tools are unregistered
```
