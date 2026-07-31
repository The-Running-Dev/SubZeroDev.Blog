import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { runTick, startScheduler, type TickResult } from '../src/scheduler/engine.js';
import { loadSchedule, saveSchedule, type ScheduledJob } from '../src/scheduler/store.js';
import { CRON_CAPABILITIES } from '../src/serve/capabilities.js';
import type { CreateServerOptions } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('scheduler engine: runTick', () => {
  let scratchRoot: string;
  let clone: string;
  let stateDir: string;
  let serverOptions: CreateServerOptions;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-scheduler-'));
    const bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');
    stateDir = path.join(scratchRoot, 'state');

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), '# seed\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });

    await gitOrThrow(['clone', bareRemote, clone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: clone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: clone });

    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    serverOptions = { repoRoot: clone, capabilities: CRON_CAPABILITIES };
  });

  afterAll(() => {
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_STATE;
    delete process.env.GH_SHIM_MERGEABLE;
    delete process.env.GH_SHIM_HEAD_SHA;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.GH_SHIM_STATE;
    delete process.env.GH_SHIM_MERGEABLE;
    delete process.env.GH_SHIM_HEAD_SHA;
  });

  function baseJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
    const now = new Date().toISOString();
    return {
      id: 'job-1',
      pr: 42,
      headSha: 'd'.repeat(40),
      scheduledAt: now,
      onMissed: { mode: 'catch_up' },
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }

  it('does nothing when the tree is dirty -- fail-safe, not an error', async () => {
    fs.writeFileSync(path.join(clone, 'dirty.txt'), 'x');
    saveSchedule(stateDir, { jobs: [baseJob()] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.skippedRepoNotReady).toBe(true);
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('pending');
    fs.rmSync(path.join(clone, 'dirty.txt'));
  });

  it('does nothing when parked off the base branch', async () => {
    await gitOrThrow(['switch', '-c', 'blog/other'], { repoRoot: clone });
    saveSchedule(stateDir, { jobs: [baseJob()] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.skippedRepoNotReady).toBe(true);
    await gitOrThrow(['switch', 'main'], { repoRoot: clone });
    await gitOrThrow(['branch', '-D', 'blog/other'], { repoRoot: clone });
  });

  it('leaves a not-yet-due job untouched', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    saveSchedule(stateDir, { jobs: [baseJob({ scheduledAt: future })] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.jobsConsidered).toBe(0);
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('pending');
  });

  it('arms auto-merge for a due job once the SHA matches and the PR is open', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'd'.repeat(40);
    saveSchedule(stateDir, { jobs: [baseJob({ headSha: 'd'.repeat(40) })] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.jobsAdvanced).toBe(1);
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('armed');
  });

  it('marks a job merged once GitHub reports MERGED', async () => {
    process.env.GH_SHIM_STATE = 'MERGED';
    saveSchedule(stateDir, { jobs: [baseJob()] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('merged');
  });

  it('marks a job needs-attention (terminal) when the PR closed without merging', async () => {
    process.env.GH_SHIM_STATE = 'CLOSED';
    saveSchedule(stateDir, { jobs: [baseJob()] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    const job = loadSchedule(stateDir).jobs[0];
    expect(job?.status).toBe('needs-attention');
    expect(job?.reason).toContain('closed');
  });

  it('marks a job needs-attention (terminal, never retried) on a merge conflict', async () => {
    process.env.GH_SHIM_MERGEABLE = 'CONFLICTING';
    saveSchedule(stateDir, { jobs: [baseJob()] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    const job = loadSchedule(stateDir).jobs[0];
    expect(job?.status).toBe('needs-attention');
    expect(job?.reason).toContain('conflict');
  });

  it('marks a job needs-attention when the stored headSha no longer matches the PR -- never substitutes a new SHA', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40); // PR moved since scheduling
    saveSchedule(stateDir, { jobs: [baseJob({ headSha: 'b'.repeat(40) })] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    const job = loadSchedule(stateDir).jobs[0];
    expect(job?.status).toBe('needs-attention');
    expect(job?.reason).toContain('does not match');
  });

  it('abandons a job past its skip_if_older_than threshold', async () => {
    const wayPast = new Date(Date.now() - 3_600_000).toISOString();
    saveSchedule(stateDir, { jobs: [baseJob({ scheduledAt: wayPast, onMissed: { mode: 'skip_if_older_than', seconds: 60 } })] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.jobsAdvanced).toBe(1);
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('skipped');
  });

  it('runs a catch_up job no matter how late', async () => {
    const wayPast = new Date(Date.now() - 3_600_000).toISOString();
    process.env.GH_SHIM_HEAD_SHA = 'd'.repeat(40);
    saveSchedule(stateDir, { jobs: [baseJob({ scheduledAt: wayPast, headSha: 'd'.repeat(40), onMissed: { mode: 'catch_up' } })] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('armed');
  });

  it('leaves a job pending on a transient infrastructure failure -- never a terminal verdict from a hiccup', async () => {
    const original = process.env.BLOG_MCP_GH_COMMAND;
    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', path.join(scratchRoot, 'does-not-exist.mjs')]);
    saveSchedule(stateDir, { jobs: [baseJob()] });
    await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('pending');
    process.env.BLOG_MCP_GH_COMMAND = original;
  });

  it('ignores jobs that are not pending (already terminal)', async () => {
    saveSchedule(stateDir, { jobs: [baseJob({ status: 'merged' })] });
    const result = await runTick({ repoRoot: clone, baseBranch: 'main', stateDir, serverOptions });
    expect(result.jobsConsidered).toBe(0);
  });
});

describe('startScheduler', () => {
  it('processes a due job automatically on its own timer, and stop() drains an in-flight tick before resolving', async () => {
    let callCount = 0;
    let resolveTick: (() => void) | undefined;
    const slowTick = async (): Promise<TickResult> => {
      callCount++;
      await new Promise<void>((resolve) => {
        resolveTick = resolve;
      });
      return { skippedRepoNotReady: false, jobsConsidered: 0, jobsAdvanced: 0 };
    };

    const handle = startScheduler({
      repoRoot: '/irrelevant',
      baseBranch: 'main',
      stateDir: '/irrelevant',
      serverOptions: { repoRoot: '/irrelevant' },
      tickIntervalMs: 20,
      tickFn: slowTick
    });

    // Let several intervals fire while the first tick is still "in flight".
    await delay(100);
    expect(callCount).toBe(1); // the inFlight guard prevented overlapping ticks

    let stopResolved = false;
    const stopPromise = handle.stop().then(() => {
      stopResolved = true;
    });
    await delay(20);
    expect(stopResolved).toBe(false); // stop() must not resolve while a tick is in flight

    resolveTick?.();
    await stopPromise;
    expect(stopResolved).toBe(true);

    await delay(50);
    expect(callCount).toBe(1); // no further ticks fired after stop()
  });
});
