import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { withVolumeAsync } from '../../../SubZeroDev.GitService/src/store/volume-fixture.ts';
import { systemClock } from '../../../SubZeroDev.GitService/src/clock/clock.ts';
import { success } from '../../../SubZeroDev.GitService/src/result/envelope.ts';
import type { ToolResult } from '../../../SubZeroDev.GitService/src/result/envelope.ts';
import type { DispatchRequest, Dispatch } from '../../../SubZeroDev.GitService/src/dispatch/dispatch-pipeline.ts';
import type { Declaration } from '../../../SubZeroDev.GitService/src/declarations/types.ts';
import type { Declarations } from '../../../SubZeroDev.GitService/src/declarations/declarations.ts';
import type { DeclarationFilter } from '../../../SubZeroDev.GitService/src/declarations/types.ts';
import type { CloneStore } from '../../../SubZeroDev.GitService/src/clone/clone-store.ts';
import type { Clone, CloneState } from '../../../SubZeroDev.GitService/src/clone/types.ts';
import type { Audit } from '../../../SubZeroDev.GitService/src/audit/audit.ts';
import type { AuditAppendInput } from '../../../SubZeroDev.GitService/src/audit/types.ts';
import type { Notifier } from '../../../SubZeroDev.GitService/src/notifier/notifier.ts';
import type { NotificationRequest } from '../../../SubZeroDev.GitService/src/journal/types.ts';
import type { StructuredStore, StoreTransaction } from '../../../SubZeroDev.GitService/src/store/structured-store.ts';
import type { ContractCapabilitySet } from '../../../SubZeroDev.GitService/src/contract/capabilities.ts';
import type { CallContext } from '../../../SubZeroDev.GitService/src/shared/call-context.ts';
import type { PathPrefix } from '../../../SubZeroDev.GitService/src/shared/brands.ts';
import { createWatcher, type WatcherDependencies } from '../../../SubZeroDev.GitService/src/watcher/watcher.ts';

import { WATCHED_POST_PLAN_HANDLER, WATCHED_POST_APPLY_HANDLER } from './watched-post.ts';

/**
 * S38.4/S38.5 — end-to-end dispatch through the generic watcher
 * (`src/watcher/watcher.ts`) with the real `watched_post_plan`/
 * `watched_post_apply` handlers wired in as the declaration's file-watcher
 * pair. Model: `src/watcher/watcher.test.ts`'s own "the full protocol
 * delivers a claimed file to processed/" test (S17.6/S17.7) -- same
 * `scriptedDispatch`/fixture-declaration harness, copied here because that
 * module's helpers are not exported for reuse.
 *
 * `git_stage`/`git_commit`/`git_push`/`pr_open`/`repo_status`/
 * `prepare_branch` are stubbed exactly as GitService's own tests stub
 * them -- no real GitHub remote. `watched_post_plan` and `watched_post_apply`
 * are the two names the fake dispatch does NOT stub; instead it builds a
 * real `CallContext` from the `DispatchRequest` and calls the real handler.
 */

const CAPABILITY_SET = new Set(['repo.read', 'git.local.write', 'git.remote.write', 'host.pr.write']) as unknown as ContractCapabilitySet;
const WRITABLE_PREFIXES = ['docs/blog/'] as unknown as readonly PathPrefix[];

function fixtureDeclaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    id: 'blog' as Declaration['id'],
    generation: 1 as Declaration['generation'],
    cloneUrl: 'https://example.com/blog.git' as Declaration['cloneUrl'],
    host: 'github',
    credentialRef: 'cred' as Declaration['credentialRef'],
    capabilityGrant: new Set(['repo.read', 'git.local.write', 'git.remote.write', 'host.pr.write']) as unknown as Declaration['capabilityGrant'],
    writablePathPrefixes: WRITABLE_PREFIXES as unknown as Declaration['writablePathPrefixes'],
    pinned: false,
    fileWatcher: { planTool: 'watched_post_plan' as never, applyTool: 'watched_post_apply' as never, autoMerge: false },
    identity: { gitUserName: 'watcher', gitUserEmail: 'watcher@example.com' },
    state: 'active',
    grantEpoch: 0 as Declaration['grantEpoch'],
    createdAt: systemClock.now(),
    updatedAt: systemClock.now(),
    ...overrides,
  };
}

function stubDeclarations(active: { current: readonly Declaration[] }): Pick<Declarations, 'list'> {
  return {
    async list(filter: DeclarationFilter): Promise<readonly Declaration[]> {
      return active.current.filter((d) => (filter.state === null || d.state === filter.state) && (filter.hasFileWatcher === null || (d.fileWatcher !== null) === filter.hasFileWatcher));
    },
  };
}

function stubCloneStore(state: { current: CloneState }): Pick<CloneStore, 'describe'> {
  return {
    async describe(declarationId) {
      const clone: Clone = { declarationId, generation: 1 as never, state: state.current, path: 'unused' as never, sizeBytes: 0, lastOperationAt: null, observedRemote: null, attentionReason: null };
      return { ok: true, value: clone };
    },
  };
}

function stubAudit(log: AuditAppendInput[]): Pick<Audit, 'append'> {
  return {
    async append(input) {
      log.push(input);
      return { appended: true, sequence: log.length };
    },
  };
}

function stubNotifier(log: NotificationRequest[]): Pick<Notifier, 'enqueue'> {
  return {
    enqueue(request) {
      log.push(request);
    },
  };
}

function stubStore(): Pick<StructuredStore, 'transaction'> {
  const tx: StoreTransaction = { id: 'tx', run() {}, all() { return []; } };
  return {
    async transaction(work) {
      return { ok: true, value: await work(tx) };
    },
  };
}

function diag() {
  return { operationId: null, declarationId: null, generation: null, durationMs: 0 };
}

function repoStatus(dirty: boolean, changedPaths: readonly { path: string; staged: boolean }[] = []): ToolResult<never> {
  return success(
    'status',
    { branch: 'main', baseBranch: 'main', dirty, parkedOffBase: false, ahead: 0, behind: 0, changedPaths, observedRemote: null, readStamp: { lastSettledOperationId: null, mutationInFlight: false } },
    { operationId: null, declarationId: null, generation: null, durationMs: 0 },
  ) as unknown as ToolResult<never>;
}

function inboxRoot(volume: string, declarationId: string): string {
  return path.join(volume, 'watcher-inboxes', declarationId);
}

function callContextFor(req: DispatchRequest, cloneRoot: string | null): CallContext {
  return {
    operationId: 'op-1' as never,
    declarationId: req.declarationId,
    generation: null,
    cloneRoot: cloneRoot as never,
    actorRef: req.session.actorRef,
    capabilities: new Set() as never,
    writablePathPrefixes: (req.declarationId === 'blog' ? WRITABLE_PREFIXES : []) as unknown as readonly PathPrefix[],
    context: req.context,
    scheduledJobId: req.scheduledJobId,
    deadline: systemClock.now(),
    signal: req.signal,
  };
}

const POST_CONTENT = ['---', 'title: "A Watched Post"', 'description: "A post delivered by the watcher."', 'slug: a-watched-post', 'authors:', '  - subzerodev', 'date: 2026-08-24', 'tags:', '  - ai-assisted-engineering', '---', '', 'Body text.', ''].join('\n');

const BAD_POST_CONTENT = ['---', 'title: "Missing Fields"', 'slug: missing-fields', 'date: 2026-08-24', '---', '', 'Body text.', ''].join('\n');

/**
 * Wraps the real handlers behind the `DispatchRequest`-keyed shape
 * `scriptedDispatch` uses, and lets a caller layer the rest of the
 * protocol's stubs (`prepare_branch`, `repo_status`, `git_stage`, ...) on
 * top -- `repoRoot` is a real temp directory the apply handler writes into.
 */
function watchedPostHandlers(repoRoot: string): Record<string, (req: DispatchRequest) => Promise<ToolResult<never>>> {
  return {
    watched_post_plan: async (req) => (await WATCHED_POST_PLAN_HANDLER(callContextFor(req, null), req.input as never)) as unknown as ToolResult<never>,
    watched_post_apply: async (req) => (await WATCHED_POST_APPLY_HANDLER(callContextFor(req, repoRoot), req.input as never)) as unknown as ToolResult<never>,
  };
}

function scriptedDispatch(log: DispatchRequest[], handlers: Record<string, (req: DispatchRequest) => ToolResult<never> | Promise<ToolResult<never>>>): Dispatch {
  return async (request) => {
    log.push(request);
    const handler = handlers[request.toolName as string];
    if (!handler) throw new Error(`unscripted dispatch call: ${request.toolName}`);
    return handler(request);
  };
}

function baseDeps(volume: string, overrides: Partial<WatcherDependencies> = {}): { deps: WatcherDependencies; auditLog: AuditAppendInput[]; notifications: NotificationRequest[]; dispatchLog: DispatchRequest[] } {
  const auditLog: AuditAppendInput[] = [];
  const notifications: NotificationRequest[] = [];
  const dispatchLog: DispatchRequest[] = [];
  const deps: WatcherDependencies = {
    volumeRoot: volume,
    clock: systemClock,
    dispatch: scriptedDispatch(dispatchLog, {}),
    declarations: stubDeclarations({ current: [] }),
    cloneStore: stubCloneStore({ current: 'ready' }),
    audit: stubAudit(auditLog),
    notifier: stubNotifier(notifications),
    store: stubStore(),
    contractCapabilitySet: CAPABILITY_SET,
    remoteOperationsPermitted: true,
    watcherEnabled: true,
    ...overrides,
  };
  return { deps, auditLog, notifications, dispatchLog };
}

// =============================================================================
// S38.4 — happy path: a dropped post file reaches an open pull request.
// =============================================================================

test('S38.4 — a complete post file dropped in the inbox reaches an open pull request via the real plan/apply pair', async () => {
  await withVolumeAsync(async (volume) => {
    const repoRoot = fs.mkdtempSync(path.join(volume, 'clone-'));
    const root = inboxRoot(volume, 'blog');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'a-watched-post.md'), POST_CONTENT, 'utf8');

    const dispatchLog: DispatchRequest[] = [];
    const { deps, auditLog } = baseDeps(volume, {
      declarations: stubDeclarations({ current: [fixtureDeclaration()] }),
      dispatch: scriptedDispatch(dispatchLog, {
        ...watchedPostHandlers(repoRoot),
        repo_status: (() => {
          let call = 0;
          return () => {
            call += 1;
            if (call === 1) return repoStatus(false);
            const entry = { path: 'docs/blog/2026-08-24-a-watched-post.md', staged: call >= 3 };
            return repoStatus(true, [entry]);
          };
        })(),
        prepare_branch: () => success('prepared', {}, diag()) as unknown as ToolResult<never>,
        git_stage: () => success('staged', { staged: ['docs/blog/2026-08-24-a-watched-post.md'] }, diag()) as unknown as ToolResult<never>,
        git_commit: () => success('committed', { sha: 'a'.repeat(40), branch: 'watcher/post-a-watched-post', changedPaths: ['docs/blog/2026-08-24-a-watched-post.md'] }, diag()) as unknown as ToolResult<never>,
        git_push: () => success('pushed', { branch: 'watcher/post-a-watched-post', headSha: 'a'.repeat(40), alreadyUpToDate: false }, diag()) as unknown as ToolResult<never>,
        pr_open: () => success('opened', { ref: { number: 42, url: 'https://example.com/pr/42', branch: 'watcher/post-a-watched-post' } }, diag()) as unknown as ToolResult<never>,
      }),
    });

    const reports = await createWatcher(deps).tick();
    assert.equal(reports[0]!.outcome?.kind, 'succeeded');
    if (reports[0]!.outcome?.kind === 'succeeded') {
      assert.equal(reports[0]!.outcome.pullRequest.number, 42);
    }

    assert.deepEqual(
      dispatchLog.map((r) => r.toolName),
      ['repo_status', 'watched_post_plan', 'prepare_branch', 'watched_post_apply', 'repo_status', 'git_stage', 'repo_status', 'git_commit', 'git_push', 'pr_open'],
      'pr_open was reached through the real plan/apply pair',
    );

    assert.equal(existsSync(path.join(root, 'a-watched-post.md')), false, 'the file left the inbox');
    const processedDir = path.join(root, 'processed');
    assert.equal(readdirSync(processedDir).some((f) => f.endsWith('-a-watched-post.md')), true, 'the file reached processed/');

    const writtenPath = path.join(repoRoot, 'docs', 'blog', '2026-08-24-a-watched-post.md');
    assert.equal(existsSync(writtenPath), true, 'watched_post_apply actually wrote the post file to the working tree');
    assert.equal(readFileSync(writtenPath, 'utf8'), POST_CONTENT);

    assert.equal(auditLog.length, 1);
    assert.equal(auditLog[0]!.form, 'file-watcher');
  });
});

// =============================================================================
// S38.5 — a post with invalid front matter never reaches a git command.
// =============================================================================

test("S38.5 — a post file missing required front matter fails at the plan step, dispatches no git or host action, and is not reprocessed", async () => {
  await withVolumeAsync(async (volume) => {
    const repoRoot = fs.mkdtempSync(path.join(volume, 'clone-'));
    const root = inboxRoot(volume, 'blog');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'missing-fields.md'), BAD_POST_CONTENT, 'utf8');

    const dispatchLog: DispatchRequest[] = [];
    const { deps, auditLog, notifications } = baseDeps(volume, {
      declarations: stubDeclarations({ current: [fixtureDeclaration()] }),
      dispatch: scriptedDispatch(dispatchLog, {
        ...watchedPostHandlers(repoRoot),
        repo_status: () => repoStatus(false),
        prepare_branch: () => {
          throw new Error('prepare_branch must not be dispatched when the plan step fails validation');
        },
        watched_post_apply: () => {
          throw new Error('watched_post_apply must not be dispatched when the plan step fails validation');
        },
        git_stage: () => {
          throw new Error('git_stage must not be dispatched when the plan step fails validation');
        },
        git_commit: () => {
          throw new Error('git_commit must not be dispatched when the plan step fails validation');
        },
        git_push: () => {
          throw new Error('git_push must not be dispatched when the plan step fails validation');
        },
        pr_open: () => {
          throw new Error('pr_open must not be dispatched when the plan step fails validation');
        },
      }),
    });

    const reports = await createWatcher(deps).tick();
    assert.equal(reports[0]!.outcome?.kind, 'rejected');
    if (reports[0]!.outcome?.kind === 'rejected') {
      assert.equal(reports[0]!.outcome.step, 'plan');
      assert.equal(reports[0]!.outcome.result, 'validation');
    }

    assert.deepEqual(
      dispatchLog.map((r) => r.toolName),
      ['repo_status', 'watched_post_plan'],
      'the sequence stopped at the plan step -- no git or host action was ever dispatched',
    );

    assert.equal(existsSync(path.join(root, 'missing-fields.md')), false, 'the file left the inbox');
    const failedDir = path.join(root, 'failed');
    const failedFiles = readdirSync(failedDir);
    const dataFile = failedFiles.find((f) => f.endsWith('-missing-fields.md'));
    const errorFile = failedFiles.find((f) => f.endsWith('-missing-fields.md.error.txt'));
    assert.ok(dataFile, 'the file itself landed in failed/');
    assert.ok(errorFile, 'a sibling *.error.txt landed in failed/');
    const errorText = readFileSync(path.join(failedDir, errorFile!), 'utf8');
    assert.match(errorText, /plan/);
    assert.match(errorText, /validation/);

    assert.equal(existsSync(path.join(repoRoot, 'docs', 'blog')), false, 'nothing was ever written to the working tree');

    assert.equal(auditLog.length, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]!.severity, 'attention');

    // A second tick must not reprocess it -- it is already out of inbox/.
    dispatchLog.length = 0;
    const secondTick = await createWatcher(deps).tick();
    assert.equal(secondTick[0]!.claimed, null, 'nothing left in the inbox to claim');
    assert.deepEqual(
      dispatchLog.map((r) => r.toolName),
      ['repo_status'],
      'the second tick only re-checks clone cleanliness -- it finds nothing to claim',
    );
  });
});
