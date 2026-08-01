# Blog-Bot publishing integrity bugs and implementation plan

Status: proposed. This document records observed defects and required behavior;
it does not describe functionality that has already been implemented.

Reference post:
[GitOps Isn't Just for Infrastructure Anymore](https://blog.subzerodev.com/gitops-isnt-just-for-infrastructure-anymore/)

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
