#!/usr/bin/env node
// A fake `gh` used only by tests: logs every invocation's argv to
// GH_SHIM_LOG (one JSON array per line) and returns canned responses shaped
// like the real CLI, so blog_push/blog_create_pr/blog_arm_auto_merge/
// blog_pr_status/blog_pr_comments can be exercised end to end without ever
// touching a real GitHub repository.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (process.env.GH_SHIM_LOG) {
  fs.appendFileSync(process.env.GH_SHIM_LOG, JSON.stringify(args) + '\n');
}

function resolveHeadSha() {
  // GH_SHIM_HEAD_SHA='GIT_HEAD' + GH_SHIM_REPO_ROOT: for tests whose own
  // pipeline commits for real mid-test (the watcher's publish pipeline, for
  // one), so the exact SHA blog_arm_auto_merge must cross-check against
  // can't be known ahead of time the way a fixed, pre-chosen SHA can for
  // tests that never commit anything themselves (e.g. the scheduler's,
  // which only ever act against an already-existing PR).
  if (process.env.GH_SHIM_HEAD_SHA === 'GIT_HEAD' && process.env.GH_SHIM_REPO_ROOT) {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.env.GH_SHIM_REPO_ROOT, encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  return process.env.GH_SHIM_HEAD_SHA ?? '0'.repeat(40);
}

const prNumber = Number(process.env.GH_SHIM_PR_NUMBER ?? '42');
const prUrl = process.env.GH_SHIM_PR_URL ?? `https://github.com/test-owner/test-repo/pull/${prNumber}`;
const headSha = resolveHeadSha();
const isDraft = process.env.GH_SHIM_IS_DRAFT === 'true';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [group, action] = args;

if (group === 'pr' && action === 'create') {
  process.stdout.write(prUrl + '\n');
  process.exit(0);
}

if (group === 'pr' && action === 'view') {
  const payload = {
    number: prNumber,
    url: prUrl,
    state: process.env.GH_SHIM_STATE ?? 'OPEN',
    isDraft,
    mergeable: process.env.GH_SHIM_MERGEABLE ?? 'MERGEABLE',
    mergeStateStatus: process.env.GH_SHIM_MERGE_STATE_STATUS ?? 'CLEAN',
    headRefOid: headSha,
    mergeCommit: process.env.GH_SHIM_MERGE_COMMIT ? { oid: process.env.GH_SHIM_MERGE_COMMIT } : null,
    reviewDecision: process.env.GH_SHIM_REVIEW_DECISION ?? null,
    autoMergeRequest: null
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

if (group === 'pr' && action === 'merge') {
  if (process.env.GH_SHIM_MERGE_FAIL === 'true') {
    fail('gh-shim: pr merge failed (forced by GH_SHIM_MERGE_FAIL)');
  }
  process.stdout.write(`Auto-merge enabled for pull request #${prNumber}\n`);
  process.exit(0);
}

if (group === 'run' && action === 'list') {
  const runs = process.env.GH_SHIM_DEPLOY_RUNS_JSON
    ? JSON.parse(process.env.GH_SHIM_DEPLOY_RUNS_JSON)
    : [];
  process.stdout.write(JSON.stringify(runs) + '\n');
  process.exit(0);
}

if (group === 'api' && args[1] !== 'graphql' && String(args[1] ?? '').includes('/check-runs')) {
  const checkRuns = process.env.GH_SHIM_CHECK_RUNS_JSON ? JSON.parse(process.env.GH_SHIM_CHECK_RUNS_JSON) : [];
  const payload = { total_count: checkRuns.length, check_runs: checkRuns };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

if (group === 'api' && args[1] === 'graphql') {
  // GH_SHIM_THREADS_PAGES_JSON simulates real pagination: an ordered array
  // of {nodes, pageInfo} pages, each with its own opaque pageInfo.endCursor
  // string (not a numeric index -- real GraphQL cursors are opaque tokens,
  // and a shim that only accepts numbers would hide bugs in real cursor
  // propagation). No `after` argument serves page 0; an `after=<cursor>`
  // argument is matched against the *previous* page's endCursor to find
  // which page comes next, exactly like a real paginated API.
  if (process.env.GH_SHIM_THREADS_PAGES_JSON) {
    const pages = JSON.parse(process.env.GH_SHIM_THREADS_PAGES_JSON);
    const afterArg = args.find((a) => a.startsWith('after='));
    const afterCursor = afterArg ? afterArg.slice('after='.length) : undefined;
    let page;
    if (afterCursor === undefined) {
      page = pages[0];
    } else {
      const priorIndex = pages.findIndex((p) => p.pageInfo.endCursor === afterCursor);
      page = priorIndex === -1 ? undefined : pages[priorIndex + 1];
    }
    const resolved = page ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    const payload = { repository: { pullRequest: { reviewThreads: { pageInfo: resolved.pageInfo, nodes: resolved.nodes } } } };
    process.stdout.write(JSON.stringify(payload) + '\n');
    process.exit(0);
  }

  const threads = process.env.GH_SHIM_THREADS_JSON
    ? JSON.parse(process.env.GH_SHIM_THREADS_JSON)
    : [
        {
          id: 'thread-1',
          isResolved: false,
          comments: { nodes: [{ path: 'docs/blog/example.md', line: 12, body: 'Fix this.', url: `${prUrl}#discussion-1` }] }
        },
        {
          id: 'thread-2',
          isResolved: true,
          comments: { nodes: [{ path: 'docs/blog/example.md', line: 20, body: 'Already fine.', url: `${prUrl}#discussion-2` }] }
        }
      ];
  const payload = { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: threads } } } };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

fail(`gh-shim: unhandled invocation: ${args.join(' ')}`);
