import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { loadConfig } from '../src/config.js';
import { registerSchedulerTools } from '../src/tools/scheduler.js';
import { loadSchedule, saveSchedule } from '../src/scheduler/store.js';
import { CRON_CAPABILITIES } from '../src/serve/capabilities.js';
import { FakeServer, call } from './helpers/fakeServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

describe('blog_schedule_publish / blog_list_scheduled_jobs / blog_cancel_scheduled_job', () => {
  let scratchRoot: string;
  let repo: string;
  let stateDir: string;
  let server: FakeServer;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-tools-scheduler-'));
    repo = path.join(scratchRoot, 'repo');
    stateDir = path.join(scratchRoot, 'state');

    fs.mkdirSync(repo);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: repo });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: repo });
    fs.writeFileSync(path.join(repo, 'README.md'), '# seed\n');
    await gitOrThrow(['add', 'README.md'], { repoRoot: repo });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: repo });
    await gitOrThrow(['remote', 'add', 'origin', 'https://github.com/test-owner/test-repo.git'], { repoRoot: repo });

    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);

    const config = loadConfig(repo);
    server = new FakeServer();
    registerSchedulerTools({
      server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      repoRoot: repo,
      config,
      capabilities: CRON_CAPABILITIES,
      stateDir
    });
  });

  afterAll(() => {
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_IS_DRAFT;
    delete process.env.GH_SHIM_STATE;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    saveSchedule(stateDir, { jobs: [] });
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_IS_DRAFT;
    delete process.env.GH_SHIM_STATE;
  });

  const HEAD_SHA = 'c'.repeat(40);
  const FUTURE = new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  it('schedules a job when the PR is open, not a draft, and the SHA matches', async () => {
    process.env.GH_SHIM_HEAD_SHA = HEAD_SHA;
    const result = await call(server, 'blog_schedule_publish', {
      pr: 42,
      headSha: HEAD_SHA,
      scheduledAt: FUTURE,
      onMissed: { mode: 'catch_up' }
    });
    expect(result.ok).toBe(true);
    const jobs = loadSchedule(stateDir).jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('pending');
    expect(jobs[0]?.pr).toBe(42);
  });

  it('refuses to schedule when the supplied headSha does not match the PR', async () => {
    process.env.GH_SHIM_HEAD_SHA = 'a'.repeat(40);
    const result = await call(server, 'blog_schedule_publish', {
      pr: 42,
      headSha: 'b'.repeat(40),
      scheduledAt: FUTURE,
      onMissed: { mode: 'catch_up' }
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(loadSchedule(stateDir).jobs).toHaveLength(0);
  });

  it('refuses to schedule a draft PR', async () => {
    process.env.GH_SHIM_HEAD_SHA = HEAD_SHA;
    process.env.GH_SHIM_IS_DRAFT = 'true';
    const result = await call(server, 'blog_schedule_publish', {
      pr: 42,
      headSha: HEAD_SHA,
      scheduledAt: FUTURE,
      onMissed: { mode: 'catch_up' }
    });
    expect(result.ok).toBe(false);
    expect(result.summary.toLowerCase()).toContain('draft');
  });

  it('refuses to schedule a PR that is not open', async () => {
    process.env.GH_SHIM_HEAD_SHA = HEAD_SHA;
    process.env.GH_SHIM_STATE = 'CLOSED';
    const result = await call(server, 'blog_schedule_publish', {
      pr: 42,
      headSha: HEAD_SHA,
      scheduledAt: FUTURE,
      onMissed: { mode: 'catch_up' }
    });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('not open');
  });

  it('blog_list_scheduled_jobs lists jobs and honors a status filter', async () => {
    saveSchedule(stateDir, {
      jobs: [
        { id: 'a', pr: 1, headSha: 'a'.repeat(40), scheduledAt: FUTURE, onMissed: { mode: 'catch_up' }, status: 'pending', createdAt: FUTURE, updatedAt: FUTURE },
        { id: 'b', pr: 2, headSha: 'b'.repeat(40), scheduledAt: FUTURE, onMissed: { mode: 'catch_up' }, status: 'merged', createdAt: FUTURE, updatedAt: FUTURE }
      ]
    });
    const all = await call(server, 'blog_list_scheduled_jobs', {});
    expect((all.data as { jobs: unknown[] }).jobs).toHaveLength(2);

    const pendingOnly = await call(server, 'blog_list_scheduled_jobs', { status: 'pending' });
    const jobs = (pendingOnly.data as { jobs: Array<{ id: string }> }).jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('a');
  });

  it('blog_cancel_scheduled_job cancels a pending job', async () => {
    saveSchedule(stateDir, {
      jobs: [{ id: 'cancel-me', pr: 1, headSha: 'a'.repeat(40), scheduledAt: FUTURE, onMissed: { mode: 'catch_up' }, status: 'pending', createdAt: FUTURE, updatedAt: FUTURE }]
    });
    const result = await call(server, 'blog_cancel_scheduled_job', { id: 'cancel-me' });
    expect(result.ok).toBe(true);
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('cancelled');
  });

  it('blog_cancel_scheduled_job refuses to cancel a job that already reached a terminal state', async () => {
    saveSchedule(stateDir, {
      jobs: [{ id: 'already-merged', pr: 1, headSha: 'a'.repeat(40), scheduledAt: FUTURE, onMissed: { mode: 'catch_up' }, status: 'merged', createdAt: FUTURE, updatedAt: FUTURE }]
    });
    const result = await call(server, 'blog_cancel_scheduled_job', { id: 'already-merged' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('merged');
  });

  it('blog_cancel_scheduled_job refuses an unknown id', async () => {
    const result = await call(server, 'blog_cancel_scheduled_job', { id: 'does-not-exist' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('precondition');
  });
});
