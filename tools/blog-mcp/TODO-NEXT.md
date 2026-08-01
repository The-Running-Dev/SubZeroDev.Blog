# Blog-Bot publishing integrity, CI audit, and implementation plan

Status: proposed. This document records observed defects and required behavior;
it does not describe functionality that has already been implemented.

Reference post:
[GitOps Isn't Just for Infrastructure Anymore](https://blog.subzerodev.com/gitops-isnt-just-for-infrastructure-anymore/)

The second half of this plan audits every repository-owned GitHub Actions
workflow. It defines when documentation validation, Blog-Bot tests, image
publication, stack redeployment, and Pages deployment are actually applicable.

## 1. Incident summary

Publishing the reference post exposed four gaps in Blog-Bot's authoring and
Git workflow:

1. A requested author key that was absent from `authors.yml` was not created,
   and the resulting post used the configured default author instead.
2. Missing controlled tags required a separate manual creation step instead of
   being registered as part of post creation.
3. Date normalization was split between callers; the MCP tool accepted an
   arbitrary string while the web UI performed its own `Date.parse` conversion.
4. A local commit was made on protected `main`. The later feature branch was
   correctly created from `origin/main`, but that also meant the local-only
   commit was not present on the feature branch and the post had to be created
   again.

The post currently records `subzerodev` as its author. This plan does not
silently rewrite that published post. Any editorial correction to the post is
a separate, explicit content change after the publishing defects are fixed.

## 2. Repository evidence

The observed behavior follows directly from the current implementation:

- `.config/blog.json` sets `author_id` to `subzerodev`.
- `blog_create_post` uses `[config.authorId]` whenever `authors` is omitted.
- The Compose UI does not expose or send an authors field, so every post
  created there uses the configured default regardless of the intended author.
- `blog_create_post` validates requested author and tag keys against
  `authors.yml` and `tags.yml`, but it does not create missing entries.
- `blog_add_tag` exists, but callers must invoke it separately. The Compose UI
  offers one-click creation only for tags parsed from Markdown, and the watcher
  has no metadata-creation step.
- There is no `blog_add_author` tool or author serialization function.
- `blog_create_post` defaults an omitted date to `new Date().toISOString()`,
  but passes a supplied date through unchanged. Validation later accepts only
  `YYYY-MM-DDTHH:MM:SSZ` as canonical.
- Compose parses its date independently and sends the result to the tool. MCP,
  watcher, and future REST callers do not share that parser.
- `blog_create_branch` fetches the configured base and creates the new branch
  from `origin/<base>`. It rejects staged changes but does not detect a clean
  local base branch containing commits absent from the remote.
- `blog_commit` permits commits while the base branch is checked out.
- `blog_push` correctly refuses to push the protected base branch, but that
  protection occurs after the unsafe local commit has already been created.
- `blog_sync_base({ ffOnly: true })` reports an unsuccessful fast-forward as a
  successful tool result with `fastForwarded: false`, which is easy for an
  orchestrator to overlook.
- Repository reconciliation in `ensureRepo()` occurs at service startup. There
  is no guaranteed post-merge reconciliation in the interactive publishing
  sequence.

## 3. Shared design requirements

The fixes must follow these principles:

### 3.1 One canonical authoring service

Author resolution, tag resolution, date normalization, post assembly, and
validation belong in domain services used by every caller. MCP, HTTP, Compose,
the watcher, and future OpenAPI adapters must not implement their own variants.

### 3.2 Atomic metadata and post creation

Creating missing authors, creating missing tags, and writing the post are one
logical operation. Blog-Bot must prepare all candidate file contents in
memory, validate the complete candidate state, and then write all files. If
any validation fails, none of `authors.yml`, `tags.yml`, or the post file may
change.

The successful result returns every changed repository-relative path. Callers
must stage that returned path list instead of reconstructing it themselves.

### 3.3 Explicit metadata, deterministic defaults

Callers may provide detailed metadata for new author or tag keys. When only a
valid key is supplied, Blog-Bot creates a deterministic minimal entry rather
than replacing the key or choosing an unrelated existing entry.

Generated values must be returned to the caller and included in the audit log
so defaults are visible rather than silent.

### 3.4 One request clock

Each create or update operation captures one injectable request timestamp.
Every default derived during that operation uses that same instant. Tests must
not depend on the wall clock.

### 3.5 Protected-base invariant

No Blog-Bot publishing tool may create a content commit on the configured base
branch. Branch preparation happens before metadata or post writes. Existing
local-only commits must be preserved on the requested feature branch and must
not be abandoned when the branch is based on the latest remote state.

### 3.6 Idempotent retry

Retrying after a network, CI, or client failure must not duplicate metadata,
create a second post, lose a commit, or silently change authorship. Existing
entries with matching keys are reused after their compatibility is checked.

## 4. Bug 1: missing requested authors are not created

### 4.1 Observed behavior

The requested key `ben` did not exist in `docs/blog/authors.yml`. The final post
uses `subzerodev`, the configured fallback author. Compose has no authors input,
and `blog_create_post` defaults an omitted authors array without telling the
caller that the requested identity was not represented.

### 4.2 Required behavior

- A supplied author key is authoritative. Blog-Bot must never replace it with
  `config.authorId` merely because it is unknown.
- For each requested key absent from `authors.yml`, Blog-Bot creates an author
  entry before validating the post.
- When `authors` is genuinely omitted, the configured default author remains
  valid behavior, but the result reports that the default was used.
- Compose must expose authors and send the selected/requested keys.
- Markdown parsing and the watcher preserve supplied author keys.
- Post updates use the same resolver when authors are changed.

### 4.3 Proposed input contract

Preserve the simple `authors: string[]` input and add optional definitions:

```ts
interface AuthorDefinition {
  key: string;
  name?: string;
  url?: string;
  imageUrl?: string;
}

interface CreatePostInput {
  authors?: string[];
  authorDefinitions?: AuthorDefinition[];
}
```

Rules:

- Author keys must be unique lowercase kebab-case values.
- A definition may be supplied only for a key present in `authors`.
- Existing entries are reused and never overwritten implicitly.
- If a supplied definition conflicts with an existing entry, return a
  precondition failure describing the conflict.
- If a key is missing and no definition is supplied, generate:
  - `name`: title-cased key (`ben` becomes `Ben`);
  - `url`: the configured canonical site root;
  - no image unless explicitly supplied.
- An explicit definition always wins over generated defaults for a new key.

The minimal defaults satisfy the `ben` incident while allowing a caller to
provide the correct full name and profile URL when known.

### 4.4 Implementation requirements

- Add author-key and optional-URL validation.
- Add an author serializer that preserves the established YAML shape and
  trailing newline.
- Add candidate-state validation for duplicate keys and malformed entries.
- Add `blog_add_author` for explicit metadata maintenance outside post
  creation. It uses the same resolver and serializer as automatic creation.
- Change `blog_create_post` and relevant `blog_update_post` paths to resolve
  authors before post validation.
- Add an Authors field to Compose and include parsed authors from Markdown.
- Include `docs/blog/authors.yml` in returned `changedPaths` only when it
  actually changed.

### 4.5 Acceptance tests

1. With only `subzerodev` declared, creating a post with `authors: ['ben']`
   creates a `ben` entry and writes `authors: [ben]` in block-list form.
2. The post never contains `subzerodev` unless it was requested or authors was
   omitted.
3. A supplied `ben` definition is serialized exactly once.
4. A second post using `ben` reuses the existing entry without modifying
   `authors.yml`.
5. A conflicting definition fails without modifying any file.
6. Invalid author keys fail before any write.
7. Compose, MCP, API, and watcher fixtures produce the same author result.

## 5. Bug 2: missing requested tags are not created automatically

### 5.1 Observed behavior

`blog_create_post` rejects unknown tags during validation. `blog_add_tag` can
create them, but callers must anticipate the failure and invoke another tool.
Compose has a separate one-click path for some unknown Markdown tags, tracks
`tags.yml` in UI state, and manually adds that path to staging. The watcher
passes unknown tags directly to `blog_create_post` and therefore fails.

### 5.2 Required behavior

- Requested valid tag keys absent from `tags.yml` are created automatically as
  part of create/update.
- Requested keys remain unchanged; Blog-Bot does not substitute a similar
  existing tag.
- All metadata and the post are written atomically.
- The operation returns every changed path, including `tags.yml` when needed.
- Compose no longer needs to pre-write tags or maintain `tagsFilePath` state.
- The watcher stages the returned changed paths and can publish a post with new
  tags in one pass.

### 5.3 Proposed input contract

Preserve `tags: string[]` and add optional definitions:

```ts
interface TagDefinition {
  key: string;
  label?: string;
  permalink?: string;
  description?: string;
}

interface CreatePostInput {
  tags: string[];
  tagDefinitions?: TagDefinition[];
}
```

For a missing tag with no definition, generate:

- `label`: title-cased key;
- `permalink`: `/<key>`;
- `description`: `Posts related to <Label>.`;

Rules:

- Keys must satisfy the existing controlled-vocabulary key pattern.
- Keys and requested definitions are deduplicated deterministically while
  preserving the post's requested tag order.
- Permalink collisions fail the entire operation.
- Existing tags are reused without implicit edits.
- Conflicting definitions for an existing key produce a precondition failure.

### 5.4 Implementation requirements

- Extract tag resolution and candidate serialization from `blog_add_tag` into
  a reusable domain service.
- Validate candidate `tags.yml` with the same integrity rules used today.
- Resolve all missing tags before validating the candidate post.
- Return `createdTags` and `changedPaths` in the write result.
- Replace Compose's pending-tag mutation flow with a preview of tags that will
  be created during publish. Optional explicit definitions may still be edited
  before submission.
- Update watcher and any composite publisher to stage `changedPaths` from the
  result rather than only the post path.

### 5.5 Acceptance tests

1. Creating a post with two unknown valid tags creates both entries and the
   post in one successful call.
2. One known and one unknown tag reuses the known entry and creates only the
   missing one.
3. Duplicate requested tags produce one metadata entry and one front-matter
   value.
4. A permalink collision, invalid key, or invalid candidate post changes no
   files.
5. A retry produces no duplicate tag entries.
6. `changedPaths` contains `tags.yml` only when it changed.
7. Compose and watcher stage all returned paths and publish the same tree as a
   direct MCP call.

## 6. Bug 3: date parsing and defaulting are inconsistent

### 6.1 Observed behavior

The server defaults an omitted create date to the current UTC timestamp, but a
supplied string is serialized unchanged and then rejected unless it already
matches the canonical format. Compose separately calls `Date.parse`, strips
milliseconds, and sends an ISO string. This makes accepted inputs depend on the
calling interface and JavaScript runtime behavior.

### 6.2 Required behavior

- Every create and date-changing update passes through one server-side
  normalizer.
- Omitted or blank dates use the captured request timestamp.
- Accepted inputs are converted to `YYYY-MM-DDTHH:MM:SSZ` in UTC.
- The filename date prefix is derived from the canonical normalized date.
- An invalid or genuinely ambiguous date produces a validation error that
  lists the accepted families; it is never replaced with the current date.
- Compose sends the user's value and relies on the server for canonicalization.

### 6.3 Supported input families

The first implementation must support deterministic examples from these
families:

- canonical or general ISO 8601, including offsets and milliseconds;
- date-only `YYYY-MM-DD`, interpreted as midnight UTC;
- RFC 2822 timestamps;
- English month-name dates such as `August 1, 2026` and
  `Saturday, August 1, 2026`;
- common numeric dates only when their order is configured explicitly.

Ambiguous numeric dates such as `08/01/2026` must not be guessed differently
across machines. Add `BLOG_MCP_DATE_ORDER` with allowed values `MDY`, `DMY`,
and `YMD`; default to `MDY` for the current deployment. Timezone-free date-time
values use `BLOG_MCP_DEFAULT_TIME_ZONE`, defaulting to `UTC`. Offset-bearing
values always use their supplied offset before conversion to UTC.

Use a maintained deterministic parsing library or Temporal-compatible parser;
do not make arbitrary `Date.parse` behavior the server contract. The selected
dependency and supported format table must be recorded in documentation and
locked by tests.

### 6.4 Update and filename behavior

If an update changes the canonical UTC day, rename the Markdown file to the
matching `YYYY-MM-DD-<slug>.md` path after checking that the destination does
not exist. The public slug remains unchanged, so no compatibility route is
needed. The result returns both old and new paths so staging can record the
rename explicitly.

### 6.5 Acceptance tests

1. An omitted date uses an injected clock and is stable throughout the call.
2. Blank input behaves like omitted input.
3. ISO timestamps with offsets normalize to UTC without milliseconds.
4. Date-only and month-name examples normalize deterministically.
5. Numeric input follows configured date order.
6. Invalid and ambiguous unconfigured inputs fail without writing files.
7. Filename and front-matter dates always match.
8. A date-changing update safely renames the file and preserves the slug/body.
9. MCP, HTTP, Compose, and watcher calls produce identical canonical values.

## 7. Bug 4: local repository state diverges during publishing

### 7.1 Observed behavior

A post commit was created locally on `main`. `blog_push` correctly rejected a
direct push to the protected branch. `blog_create_branch` then fetched the
remote and created the publish branch from `origin/main`, leaving the existing
local-only commit reachable only from local `main`. The post was recreated and
committed again on the publish branch.

Nothing was deleted, but the workflow abandoned the original commit and mixed
base-branch and feature-branch state. The tool sequence allowed the problem to
occur and did not provide an automatic recovery path.

### 7.2 Required invariants

1. A publishing commit cannot be created on the configured base branch.
2. Branch preparation fetches and evaluates local/remote ancestry before any
   content write.
3. A clean local-only commit on base is preserved on the requested publish
   branch.
4. The publish branch is based on the latest `origin/<base>`.
5. Uncommitted changes are never moved implicitly; branch preparation refuses
   them with an actionable message unless a future explicit carry mode is
   designed.
6. Conflicts stop safely without losing the original commits.
7. After merge, reconciliation fetches, switches to base, and fast-forwards to
   the merged remote commit.

### 7.3 Introduce `blog_prepare_publish_branch`

Replace client orchestration around `blog_sync_base` plus
`blog_create_branch` with one transactional preparation tool:

```ts
interface PreparePublishBranchInput {
  name?: string;
  slug?: string;
  kind?: 'blog' | 'content' | 'fix' | 'feature' | 'docs';
  checkoutExisting?: boolean;
}
```

Algorithm for a new branch:

1. Require a fully clean index and working tree, including untracked files.
2. Fetch and prune `origin`, including the configured base ref.
3. Resolve local base, remote base, merge base, ahead count, and behind count.
4. If local base equals remote base, create the feature branch from remote
   base.
5. If local base is behind only, fast-forward local base and create the feature
   branch from remote base.
6. If local base has local-only commits:
   - create the requested feature branch at the current local base tip so the
     commits immediately have a non-base ref;
   - move the local base ref to `origin/<base>` while it is not checked out;
   - rebase the new feature branch onto `origin/<base>` so it contains both the
     latest remote state and the preserved local commits;
   - if rebase conflicts, abort the rebase and return a precondition result
     identifying the preserved feature branch and original commit SHAs.
7. If the requested feature branch already exists, inspect its remote tracking
   and publication state before switching. Never rewrite a pushed branch
   without a separate explicit operation.
8. Return the branch, original and resulting SHAs, preserved commit list,
   remote base SHA, and action taken.

The operation must be tested against a real scratch bare remote, not only
mocked git output.

### 7.4 Harden existing tools

- `blog_commit` refuses while `config.baseBranch` is checked out.
- `blog_create_branch` delegates to `blog_prepare_publish_branch` or is
  deprecated after all callers migrate.
- `blog_sync_base({ ffOnly: true })` returns a precondition failure when the
  requested fast-forward cannot occur; it must not return `ok` with an easily
  ignored false flag.
- `blog_push` keeps its existing base-branch refusal and remote-SHA
  verification.
- Tool descriptions and workflow documentation state that branch preparation
  is the first mutating publishing step.

### 7.5 Post-merge reconciliation

Add `blog_reconcile_after_merge({ pr, expectedHeadSha? })` as a mutating local
git operation:

1. Confirm through GitHub that the PR merged and capture its merge commit.
2. Confirm the PR head is the expected publish branch/head when supplied.
3. Require a clean working tree.
4. Fetch and prune origin.
5. Switch to the configured base branch.
6. Fast-forward to `origin/<base>` and verify the merge commit is reachable.
7. Delete the local publish branch only when GitHub confirms the PR merged and
   the branch's content is represented by the merged PR. Because squash merge
   rewrites commit ancestry, GitHub PR state—not only `merge-base`—is required.
8. Return the reconciled base SHA and branch cleanup outcome.

Interactive UI publishing calls reconciliation when its PR watcher observes a
merge. Watcher and scheduled publishers enqueue reconciliation for the next
tick if they do not synchronously wait for merge. `ensureRepo()` remains the
startup recovery path, but is no longer the only reconciliation mechanism.

### 7.6 Acceptance tests

1. `blog_commit` on `main` fails before invoking `git commit`.
2. A clean synchronized base creates a feature branch from current remote base.
3. A behind base is fast-forwarded before branch creation.
4. A base with one local-only commit creates a feature branch containing that
   commit rebased onto the latest remote base; the local base points at the
   remote base.
5. Diverged local and remote bases preserve all local commits on the feature
   branch.
6. A forced rebase conflict aborts safely and reports where every original
   commit remains reachable.
7. Staged, unstaged, and untracked changes each block automatic branch
   preparation without being modified.
8. An existing pushed feature branch is never silently rebased or overwritten.
9. Push still refuses the base branch.
10. Successful reconciliation after a squash merge leaves the checkout clean,
    on current base, with the merged local feature branch removed safely.
11. Compose and watcher cannot write a post before branch preparation succeeds.

## 8. Unified authoring result

Create and update operations should return enough information for every caller
to stage and explain exactly what happened:

```ts
interface PostWriteResult {
  path: string;
  previousPath?: string;
  changedPaths: string[];
  canonicalDate: string;
  authors: string[];
  tags: string[];
  createdAuthors: AuthorEntry[];
  createdTags: TagEntry[];
  defaultAuthorUsed: boolean;
  canonicalUrl: string;
}
```

`changedPaths` is authoritative. Compose and watcher must not independently
guess that only the post, post plus tags, or old plus new filename changed.

## 9. Transaction and filesystem strategy

The repository is a filesystem-backed source of truth, so the authoring
transaction needs an explicit failure model:

1. Load current authors, tags, and posts.
2. Normalize input and resolve metadata in memory.
3. Generate candidate `authors.yml`, `tags.yml`, and post content.
4. Validate candidate YAML integrity, post front matter, duplicate slugs,
   filename/date consistency, and allowed paths.
5. Write candidate files to temporary siblings in the same directories.
6. Rename into place only after every temporary write succeeds.
7. If a rename fails, restore prior bytes from memory before returning an
   infrastructure failure.
8. Append one scrubbed audit entry listing changed paths and generated metadata
   keys.

The in-process repository mutex continues to serialize the operation. This is
not a substitute for multi-process locking; the existing single-container
assumption remains explicit.

## 10. Delivery plan

Each phase is a focused pull request. Do not implement all four bugs as one
large change.

### Phase 1: regression fixtures and domain contracts

Deliverables:

- encode the reference incident as author/tag/date/git fixtures;
- add injectable clock and normalization result types;
- define author/tag definitions and unified post-write result;
- add scratch-remote ancestry scenarios.

Acceptance:

- tests fail for the current four defects for the expected reasons;
- no production behavior changes yet;
- fixtures contain no dependency on the live repository or GitHub network.

### Phase 2: atomic metadata resolution

Deliverables:

- author serializer, integrity checks, and `blog_add_author`;
- reusable author and tag resolvers;
- atomic candidate-state writer;
- automatic author/tag creation in create and update tools;
- unified `changedPaths` result.

Acceptance:

- Bugs 1 and 2 acceptance suites pass;
- failure at any validation/write stage leaves all source files unchanged;
- existing `blog_add_tag` behavior remains compatible.

### Phase 3: canonical date service

Deliverables:

- deterministic parser and timezone/date-order configuration;
- create/update integration;
- safe filename rename when the canonical day changes;
- removal of caller-specific parsing from Compose.

Acceptance:

- Bug 3 acceptance suite passes in multiple process timezones;
- every written date is canonical and matches its filename;
- the request clock is injectable and captured once.

### Phase 4: protected branch preparation

Deliverables:

- `blog_prepare_publish_branch` and ancestry reporting;
- preservation/rebase of clean local-only base commits;
- base-branch refusal in `blog_commit`;
- stricter `blog_sync_base` failure semantics;
- bare-remote conflict and recovery tests.

Acceptance:

- Bug 4 branch-preparation tests pass;
- no tested path loses reachability to an original local commit;
- no automatic operation rewrites an already pushed feature branch.

### Phase 5: caller migration

Deliverables:

- Compose author selection/definitions and metadata preview;
- Compose staging from `changedPaths`;
- watcher staging from `changedPaths`;
- workflow documentation updated to prepare the branch before writes;
- API and MCP descriptions updated with auto-creation/default behavior.

Acceptance:

- Compose, watcher, direct MCP, and HTTP integration fixtures produce the same
  repository tree from equivalent input;
- UI state no longer tracks metadata files solely for staging;
- no caller can write first and prepare the branch afterward.

### Phase 6: post-merge reconciliation

Deliverables:

- `blog_reconcile_after_merge`;
- UI PR-watcher integration;
- deferred reconciliation for unattended publishers;
- startup recovery compatibility and local-branch cleanup tests.

Acceptance:

- a complete publish leaves the managed checkout clean and synchronized with
  remote base after merge;
- restart during any stage converges without duplicate posts or metadata;
- squash-merged branch cleanup relies on verified GitHub state.

### Phase 7: end-to-end verification and documentation

Deliverables:

- container-level publish simulation using a scratch remote and fake GitHub
  boundary;
- operator documentation for date policy, generated metadata, recovery, and
  branch reconciliation;
- compatibility notes for changed tool results and stricter failures.

Acceptance:

- package build and full test suite pass;
- repository documentation gates pass;
- representative create, retry, conflict, merge, restart, and reconciliation
  scenarios are covered;
- release notes identify any caller migration required by `changedPaths` and
  the protected-base commit rule.

## 11. Expected implementation surface

Likely files and responsibilities:

- `src/domain/authors.ts`: author validation, serialization, resolution.
- `src/domain/tags.ts`: reusable tag resolution and candidate integrity.
- `src/domain/date.ts`: canonical parsing, timezone policy, request clock.
- `src/domain/frontmatter.ts`: unchanged canonical serialization contract.
- `src/tools/authoring.ts`: tool inputs and atomic create/update orchestration.
- `src/tools/localGit.ts`: branch preparation, base commit guard, sync failures,
  reconciliation.
- `src/tools/remote.ts`: verified PR metadata used by reconciliation; direct
  merge remains prohibited.
- `src/serve/api.ts`: pass-through for expanded contracts and reconciliation.
- `ui/src/views/ComposeView.tsx`: authors UI, metadata preview, server-side date
  normalization, authoritative `changedPaths` staging.
- `src/watcher/engine.ts`: prepare first, stage returned paths, schedule
  reconciliation.
- `.agents/workflows/create-blog-post.md`: corrected tool order and automatic
  metadata behavior.
- `README.md` and `.env.example`: date/timezone and recovery configuration.
- focused unit, integration, bare-remote, UI, watcher, and restart tests.

Exact file placement may change during implementation, but the shared domain
behavior must not be copied between interfaces.

## 12. Validation requirements

Every implementation phase runs the package checks:

```powershell
Set-Location tools/blog-mcp
npm run build
npm test
```

Repository-facing phases also run:

```powershell
./build/Test-Documentation.ps1
./docs.ps1 -BuildOnly
./build/Test-DocumentationArtifact.ps1
git diff --check
git status --short --branch
```

When Docker is unavailable, the production documentation build remains
delegated to the required GitHub Actions check and must not be reported as a
local pass.

## 13. Definition of done

These bugs are complete only when all of the following are true:

- requested author `ben` is created and used without substitution;
- all valid requested missing tags are created in the same atomic operation as
  the post;
- omitted dates use the request timestamp and supported date inputs normalize
  identically across every interface;
- filenames always match canonical dates;
- no content commit can be created on protected base through Blog-Bot;
- local-only base commits are preserved on a branch based on current remote;
- publish callers stage the authoritative changed-path list;
- successful merge reconciles the managed checkout to current remote base;
- retries, conflicts, restarts, and partial failures do not duplicate or lose
  content or metadata;
- all existing safety rules, route permanence, review requirements, and
  deployment verification remain intact.

## 14. Explicit non-goals

- Do not automatically correct the reference post's published author as part
  of the runtime fix.
- Do not permit free-form inline Docusaurus tags; generated tags still become
  controlled entries in `tags.yml`.
- Do not guess invalid author/tag keys or silently map them to similar keys.
- Do not force-push, reset an unpreserved commit, or rewrite a published branch.
- Do not weaken protected-branch rules or add a direct merge tool.
- Do not make MCP Next a prerequisite for these correctness fixes; the current
  Blog-Bot architecture can implement them, and MCP Next can later consume the
  corrected domain services.

## 15. CI and workflow audit scope

This audit covers all three workflows under `.github/workflows/`, their local
validation dependencies, their branch-protection contracts, and Blog-Bot's
code for monitoring checks and deployments:

- `blog-mcp-image.yml` — Blog-Bot tests, Docker build, GHCR publication, and
  Portainer redeployment;
- `docs-ci.yml` — the two required pull-request checks;
- `docs-deploy.yml` — production Docusaurus build and GitHub Pages deployment;
- `build/Test-Documentation.ps1` and
  `build/Test-DocumentationArtifact.ps1` — repository-specific validation;
- `src/tools/monitor.ts` — required-check, merge, deployment, and published-URL
  monitoring;
- the protected `main` branch's required status-check names.

`docs-ci.yml` and `docs-deploy.yml` are installer-owned outputs of
`The-Running-Dev/Docusaurus-Template`. Their optimization must be implemented
in that template and applied here through its supported installer. They must
not accumulate an undocumented local fork. The repository-specific artifact
validation step remains the one documented consumer insertion.

### 15.1 Audit method and baseline

The audit inspected workflow YAML, Docker build inputs, package scripts,
branch-protection settings, monitoring code, and the latest 100 Actions runs
visible on 2026-08-02. The observed run counts were:

| Workflow | Runs | Pull requests | Pushes | Approximate elapsed time |
| --- | ---: | ---: | ---: | ---: |
| `blog-mcp Image` | 35 | 21 | 13 | 142.9 minutes |
| `Docs CI` | 46 | 27 | 19 | 56.4 minutes |
| `Docs Deploy` | 18 | 0 | 18 | 31.4 minutes |

Elapsed time is wall-clock run duration, including queueing and setup. It is a
comparison baseline, not a claim about billable runner minutes.

PR #83 is a representative false-positive case. Its authored changes were only
`tools/blog-mcp/MCP-NEXT.md` and `tools/blog-mcp/README.md`, but the branch ran
Blog-Bot tests and a Docker build twice. After merge, the repository tested and
published the Blog-Bot image, called the stack redeployment webhook, reran the
documentation gate, and rebuilt and deployed the entire site. None of those
image or site artifacts changed because of the two planning documents.

## 16. Audit findings

### 16.1 P0: the image trigger watches a directory, not image inputs

`blog-mcp-image.yml` watches `tools/blog-mcp/**`. That includes tests,
Compose files, `.env.example`, README files, and implementation plans.
Consequently, any change beneath the tool directory runs the full package
suite and Docker build. A merge to `main` also publishes `latest` and invokes
the Portainer webhook even when the final image would be functionally
unchanged.

The Dockerfile shows a much smaller real image contract:

- server `package.json`, `package-lock.json`, `tsconfig.json`, and `src/**`;
- UI package locks/configuration, `index.html`, `public/**`, and `src/**`;
- `Dockerfile` and `docker-entrypoint.sh`.

The runtime image does not copy tests, plans, README files, Compose files, or
`.env.example`. Those inputs require either no CI or a different lightweight
validation path.

### 16.2 P0: every merge deploys the public site

`docs-deploy.yml` runs on every push to `main`. Blog-Bot source, tests,
container configuration, planning documents, and root README changes therefore
build and deploy Docusaurus even when no published-site input changed.

Production deployment is not a branch-protection check. It can safely use a
site-input path boundary as long as manual dispatch remains available and the
publishing monitor understands that a non-site merge has no expected Pages
run.

### 16.3 P0: required checks cannot be optimized with workflow path filters

`Documentation links and terminology` and `Verify Documentation Build` are the
two required contexts on protected `main`. If the entire `Docs CI` workflow is
filtered out by `paths`, GitHub can leave an expected required check pending
and block the pull request indefinitely.

Optimization must therefore keep a workflow and stable required-check result
for every pull request. Expensive work may be conditionally skipped behind a
change classifier, but the required context must still complete successfully
with an explicit `not-applicable` result.

### 16.4 P1: Docs CI repeats work after a validated merge

`Docs CI` runs on every pull request and every push to `main`. Its build job is
already skipped on pushes because `Docs Deploy` builds there, but the Markdown
gate reruns after every merge.

Protected `main` requires an up-to-date branch and both exact-head PR checks,
blocks direct changes, and enforces administration. Under those constraints,
the push gate is normally a duplicate of the check that admitted the merge.
Manual dispatch remains sufficient for an operator-requested rerun.

### 16.5 P1: stale pull-request runs are not cancelled

Neither `Docs CI` nor `blog-mcp Image` defines pull-request concurrency. A new
commit can leave an obsolete test or build consuming a runner while the new
head starts another run. Only checks for the latest head are useful for merge.

Production image publishing and Pages deployment need different treatment:
they must never race floating `latest` or deploy an older result after a newer
one. Cancellation behavior for production must be proven separately rather
than copied from pull-request jobs.

### 16.6 P1: deployment monitoring assumes a Pages run should exist

`blog_wait_for_deploy` polls for up to 20 minutes when no matching Docs Deploy
run exists, and `blog_verify_published_url` treats absence as
`deploy-not-confirmed`. That is correct for a changed post or route, but it
would be misleading after deliberately filtering a Blog-Bot-only merge out of
the Pages workflow.

Monitoring needs a three-state result:

- `expected` — the merge changed a published-site input and must produce a
  successful deploy before a URL can be reported;
- `not-applicable` — the merge did not change a site input and no Pages run
  should exist;
- `unknown` — applicability could not be established, so the tool must not
  claim success.

The hard publication rule remains unchanged: any operation asked to report a
new or changed public route must prove an exact-merge successful deploy and a
successful HTTPS fetch. `not-applicable` is never a shortcut to a published
URL.

### 16.7 P2: setup and cache work can be tightened

The image workflow exports a maximum BuildKit cache on every pull-request
build. It also checks out full history because current tests require an
`origin/main` tracking ref. Correctness takes priority, but follow-up work may:

- retain `cache-from` on pull requests and write the large shared cache only
  from trusted `main` builds;
- replace full-history checkout with an explicit base-ref fetch once tests
  prove no history-dependent behavior was lost;
- avoid installing and building the UI for server-only unit-test partitions
  if the suite is later split without reducing coverage.

These are lower priority than eliminating entire inapplicable jobs.

### 16.8 P2: workflow behavior has no executable trigger contract

The path assumptions currently live only in YAML comments. There is no tested
change classifier, path-matrix fixture, Compose validation, or workflow lint.
Future files can therefore enter the image or site dependency graph without
updating CI, or broad globs can regress and silently restore unnecessary runs.

### 16.9 P1: the combined image job weakens least privilege on PRs

The current `build-and-push` job declares `packages: write` for the entire job.
Its login and push steps are skipped on pull requests, but step conditions do
not remove the job's token permission. The workflow comment claiming that
every PR run lacks a write-capable token is therefore stronger than the YAML
contract, particularly for same-repository pull requests.

Split unprivileged PR image verification from privileged publication. The PR
job receives only `contents: read`; the `main`/manual publication job alone
receives `packages: write`. Do not rely on `push: false` as a permission
boundary.

### 16.10 P2: action references are mutable major-version tags

The workflows pin the Docusaurus container by immutable digest, but GitHub
Actions dependencies use moving major tags such as `actions/checkout@v7` and
`docker/build-push-action@v6`. A complete workflow supply-chain contract should
pin third-party actions to reviewed commit SHAs, retain the readable release
tag in comments, and use an automated dependency updater to propose controlled
SHA changes. Installer-owned action references must be corrected upstream.

## 17. Required change-area contract

Add one repository-owned, unit-tested change classifier. It accepts a base and
head commit and returns independent booleans plus matched paths. It must use
Git's complete changed-file list rather than GitHub's UI-limited file summary.

The initial areas are:

### 17.1 `markdown_gate`

Applicable to Markdown and to the gate itself:

- `**/*.md`;
- `.config/DocumentationRules.psd1`;
- `build/Test-Documentation.ps1`;
- the gate job or classifier implementation.

The gate scans Markdown outside the Docusaurus source, so it cannot be reduced
to `docs/**` alone. In the first implementation it may remain an always-run
required check because it is relatively cheap and broad. Conditional execution
is allowed only after the matrix proves every gate input is represented.

### 17.2 `site_verify`

Applicable when the production site or its repository-specific artifact
contract may change:

- authored and configured site inputs under `docs/**`;
- `build/Test-DocumentationArtifact.ps1`;
- shared-template version/digest or generated workflow changes that alter the
  build path.

Begin with conservative `docs/**` coverage. Narrowing installer-owned helper
files further is optional and must be backed by template dependency tests.

### 17.3 `site_deploy`

Applicable only when the generated Pages artifact may differ:

- authored content, Docusaurus configuration, sidebar, pages, components,
  styles, and static assets under `docs/**`;
- a changed shared-template image or build contract.

A change to a validation script alone requires `site_verify` but does not need
to deploy an identical artifact. `workflow_dispatch` explicitly overrides the
classifier and forces a build/deploy.

### 17.4 `blog_mcp_test`

Applicable to production inputs plus test-only inputs:

- server and UI production inputs listed under `blog_mcp_image`;
- `tools/blog-mcp/test/**`;
- test runner/build configuration and package scripts;
- the image workflow or classifier tests.

README files, `MCP-NEXT.md`, and `TODO-NEXT.md` are not test inputs unless a
specific executable documentation test is introduced.

### 17.5 `blog_mcp_image`

Applicable to output-affecting Docker inputs:

- `tools/blog-mcp/Dockerfile` and `docker-entrypoint.sh`;
- server `package.json`, lockfile, `tsconfig.json`, and `src/**`;
- UI package files, TypeScript/Vite configuration, `index.html`, `public/**`,
  and `src/**`.

Add a `.dockerignore` that excludes tests, local Compose files, documentation,
plans, local environment files, coverage, caches, and build output. The
positive classifier list and `.dockerignore` must be tested for parity with
the Dockerfile's `COPY` instructions.

### 17.6 `blog_mcp_compose`

Applicable to deployment/local runtime configuration without implying an
image build:

- root `docker-compose.yml`;
- `tools/blog-mcp/docker-compose.yml`;
- `.env.example` files and documented Compose defaults.

This area runs `docker compose config` with non-secret fixture values. It does
not publish an image or call a webhook.

### 17.7 `workflow_definition`

Applicable to `.github/workflows/**` and the classifier. It runs pinned
workflow lint and classifier fixtures. Manual dispatch supplies a documented
`force` mode for recovery and republishing.

Mixed changes take the union of all applicable areas. Unknown paths default to
validation, not deployment: they may run lightweight lint/gates, but they must
not publish an image or public site unless they are declared artifact inputs.

## 18. Workflow-by-workflow target design

### 18.1 `blog-mcp Image`

Keep this consumer-owned workflow separate from installer-owned docs
workflows, but replace the directory-wide trigger with the union of explicit
`blog_mcp_test`, `blog_mcp_image`, and workflow-definition paths.

Target jobs:

1. `changes` calculates `blog_mcp_test`, `blog_mcp_image`, and
   `blog_mcp_compose`, emits matched paths, and treats manual dispatch as
   forced.
2. `test` runs only for `blog_mcp_test`.
3. `image-pr` needs `changes` and `test`, uses `if: always()`, and verifies the
   Docker build only when a pull request has `blog_mcp_image`. It has no
   package-write permission or registry login.
4. `publish` is a separate job with `packages: write`. It runs only for a
   qualifying `main` push or explicit manual publish after applicable tests
   pass; no pull-request event can enter it.
5. Stack redeployment runs only after a successful qualifying `main` image
   push. A
   test-only, Compose-only, or documentation-only merge cannot call the
   webhook.
6. A separate lightweight Compose job validates `blog_mcp_compose` paths.

Add pull-request concurrency keyed by workflow and PR number/head ref with
`cancel-in-progress: true`. Keep production publishing serialized until tests
prove that cancelling or superseding a run cannot let an older image redeploy
after a newer one.

### 18.2 `Docs CI`

Keep the workflow present on every pull request so both required contexts are
always created. Implement the reusable optimization in
`The-Running-Dev/Docusaurus-Template`, then regenerate this repository's file.

Target jobs:

1. `changes` computes `markdown_gate` and `site_verify`.
2. The Markdown gate remains unconditional initially, or conditionally runs
   behind an always-completing wrapper with the exact required name
   `Documentation links and terminology`.
3. The containerized build runs only for `site_verify`.
4. An always-running result job named exactly `Verify Documentation Build`
   depends on the classifier and build using `if: always()`. It fails when an
   applicable build failed or was cancelled and succeeds with an explicit
   `not-applicable` summary when the build was correctly skipped.
5. Pull-request concurrency cancels obsolete heads.
6. Remove the routine `push: main` trigger after branch-protection and manual
   dispatch tests pass. Do not leave a second post-merge gate that duplicates
   the exact-head required check.

The result job must be tested against success, failure, cancellation, skipped
work, classifier failure, and mixed changes. A classifier failure is a required
check failure, never `not-applicable`.

### 18.3 `Docs Deploy`

Implement its trigger boundary in the shared template and regenerate locally.
On `push: main`, run only for `site_deploy` paths. Retain `workflow_dispatch`
as an unconditional recovery/redeploy mechanism.

Keep Pages and OIDC permissions isolated to this workflow. Preserve exact
merge-SHA association and the repository-specific artifact validation step.
Evaluate production concurrency with two rapid synthetic merges:

- no older artifact may become final after a newer artifact;
- only one Pages deployment may mutate the environment at a time;
- if cancellation is enabled, cancelling during `deploy-pages` must be proven
  safe;
- otherwise retain serialization and accept the older active deployment while
  ensuring the newest pending deployment runs next.

Do not change `cancel-in-progress: false` merely to save time without this
ordering test.

### 18.4 Monitoring and reporting

Extend deployment-monitor results with `applicability` and `reason`. Determine
applicability from the merged PR's changed paths or, when no PR association is
available, from a first-parent diff against the merge commit's parent.

- `blog_publish_report` reports `not-applicable` immediately for a non-site
  merge instead of implying a missing deployment.
- `blog_wait_for_deploy` returns immediately for proven non-site merges.
- `blog_deploy_status` continues to distinguish a not-yet-created expected run
  from a completed/failed run.
- `blog_verify_published_url` still requires a successful exact-SHA deploy and
  HTTP verification. It rejects `not-applicable` when a URL is requested.
- AGENTS and publishing-workflow instructions wait for Docs Deploy only when
  a new or changed site route is in scope.

This change prevents a filtered deployment from creating a 20-minute false
timeout without weakening publication evidence.

## 19. Expected execution matrix

| Changed paths | Markdown gate | Site build on PR | Blog-Bot tests | Docker build | Publish/redeploy on `main` | Pages deploy on `main` |
| --- | --- | --- | --- | --- | --- | --- |
| `tools/blog-mcp/TODO-NEXT.md` only | Yes | No | No | No | No | No |
| Root `README.md` only | Yes | No | No | No | No | No |
| Blog post, tags, authors, or hub page | Yes | Yes | No | No | No | Yes |
| `tools/blog-mcp/src/**` | No unless Markdown also changed | No | Yes | Yes | Yes | No |
| `tools/blog-mcp/test/**` only | No | No | Yes | No | No | No |
| Blog-Bot UI production input | No | No | Yes | Yes | Yes | No |
| Blog-Bot `Dockerfile` or entrypoint | No | No | Yes | Yes | Yes | No |
| Root/local Compose or `.env.example` only | No | No | No | No | No | No |
| Artifact-validation script only | No | Yes | No | No | No | No |
| Mixed site and Blog-Bot production changes | As applicable | Yes | Yes | Yes | Yes | Yes |

For every pull-request row, both branch-protection contexts must still appear
and complete. A skipped expensive job is represented as successful
`not-applicable`; a missing required context is always a defect.

## 20. CI implementation phases

### CI phase A: executable classifier and fixtures

Deliverables:

- checked-in change-area classifier with base/head inputs;
- table-driven fixtures for every row in the execution matrix;
- rename/delete, merge-base, more-than-300-files, and mixed-change coverage;
- diagnostic summaries listing the paths that activated each area.

Acceptance:

- classification is deterministic locally and in Actions;
- no GitHub API file-count truncation can change the result;
- an unknown/classifier error fails validation without publishing anything.

### CI phase B: stop false image publication

Deliverables:

- narrowed Blog-Bot workflow trigger;
- separate test, image, and Compose conditions;
- separate read-only PR build and write-capable publication jobs;
- `.dockerignore` and Dockerfile/classifier parity test;
- pull-request cancellation and main-only cache publication;
- webhook guarded by a successful qualifying image push.

Acceptance:

- a planning-document change creates no Blog-Bot workflow run;
- a test-only change tests but never builds/pushes/redeploys an image;
- an image input builds on PR and publishes/redeploys only after merge;
- manual publish remains available and is recorded as forced.

### CI phase C: optimize required documentation checks upstream

Deliverables:

- shared-template classifier/result-job support;
- preserved required context names;
- generated `docs-ci.yml` update in this repository;
- regression tests for all result-job states;
- removal of duplicate routine push validation.

Acceptance:

- non-site PRs complete both required contexts without starting the docs
  container;
- site PRs still build, validate routes/feeds, and archive the Pages artifact;
- no PR is blocked because a required workflow or context failed to appear.

### CI phase D: filter production site deployment upstream

Deliverables:

- shared-template `site_deploy` trigger contract;
- regenerated `docs-deploy.yml`;
- manual force-deploy path;
- documented and tested concurrency ordering.

Acceptance:

- non-site merges create no Docs Deploy run;
- site merges deploy the exact merge SHA;
- rapid site merges converge to the newest artifact.

### CI phase E: make Blog-Bot deployment-aware

Deliverables:

- `expected`, `not-applicable`, and `unknown` deployment results;
- changed-path applicability lookup;
- monitor, API, UI, scheduler, and fixture updates;
- revised AGENTS and publish workflow language.

Acceptance:

- non-site reports return immediately as `not-applicable`;
- changed routes can never be reported published without exact-SHA deploy
  success and HTTPS verification;
- unknown applicability fails closed.

### CI phase F: observe and tune

After rollout, record another bounded 100-run or 30-day sample. Compare event,
change area, jobs started, wall-clock duration, cancellation, and outcome with
the 2026-08-02 baseline. Do not add a scheduled workflow merely to collect
this data; use a local/manual audit command or existing Actions metadata.

Targets:

- zero image publications or stack webhooks for non-image changes;
- zero Pages deployments for non-site changes;
- zero missing required-check contexts;
- obsolete pull-request runs cancelled promptly;
- no regression in required checks, route validation, deployment ordering, or
  exact-SHA publication verification.

## 21. CI validation requirements

Add and run:

```powershell
# Unit tests for path classification and required-result aggregation
./build/Test-WorkflowChangeAreas.ps1

# Workflow syntax/static analysis with a pinned actionlint release
./build/Test-GitHubActions.ps1

# Compose expansion with fixture values, without starting services
docker compose --env-file tools/blog-mcp/.env.ci config
docker compose --project-directory tools/blog-mcp `
  --env-file tools/blog-mcp/.env.ci config
```

Secret-shaped fixture values must be generated or supplied only for
validation and never committed as real credentials. The Compose test may use a
checked-in non-secret fixture explicitly marked invalid for production.

For each changed workflow, validate both pull-request and `main` event logic in
a scratch branch/repository before changing required contexts or production
deployment triggers. Confirm live branch protection still requires exactly:

- `Documentation links and terminology`;
- `Verify Documentation Build`.

All existing package and documentation checks in section 12 remain required
when their change areas apply. Finish every phase with `git diff --check` and a
clean, correctly tracking branch.

## 22. CI definition of done

The workflow audit is implemented only when:

- every workflow has a documented artifact/change contract;
- planning and README-only Blog-Bot changes do not test or build the image;
- test-only Blog-Bot changes cannot publish or redeploy;
- only output-affecting Blog-Bot inputs publish `latest` and invoke Portainer;
- no pull-request job receives package-write permission;
- non-site merges do not build or deploy Docusaurus;
- required checks are always present and preserve their exact protected names;
- applicable site changes still receive full production-equivalent PR
  verification and exact-SHA Pages deployment;
- stale PR work is cancelled without creating production ordering races;
- deployment monitors distinguish expected, not-applicable, and unknown runs;
- no public URL is reported without the existing exact-deploy and HTTPS proof;
- installer-owned workflow changes originate upstream and regenerate cleanly;
- external actions are pinned to reviewed immutable commits and updated through
  controlled dependency pull requests;
- classifier, workflow lint, Compose validation, and event-matrix tests prevent
  the broad-trigger regression from returning;
- observed post-rollout runs meet the targets in CI phase F.
