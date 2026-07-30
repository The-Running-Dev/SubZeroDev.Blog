#!/usr/bin/env node
// A fake `gh` used only by tests: logs every invocation's argv to
// GH_SHIM_LOG (one JSON array per line) and returns canned responses shaped
// like the real CLI, so blog_push/blog_create_pr/blog_arm_auto_merge/
// blog_pr_status/blog_pr_comments can be exercised end to end without ever
// touching a real GitHub repository.
import fs from 'node:fs';

const args = process.argv.slice(2);

if (process.env.GH_SHIM_LOG) {
  fs.appendFileSync(process.env.GH_SHIM_LOG, JSON.stringify(args) + '\n');
}

const prNumber = Number(process.env.GH_SHIM_PR_NUMBER ?? '42');
const prUrl = process.env.GH_SHIM_PR_URL ?? `https://github.com/test-owner/test-repo/pull/${prNumber}`;
const headSha = process.env.GH_SHIM_HEAD_SHA ?? '0'.repeat(40);
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
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
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
  const payload = { repository: { pullRequest: { reviewThreads: { nodes: threads } } } };
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}

fail(`gh-shim: unhandled invocation: ${args.join(' ')}`);
