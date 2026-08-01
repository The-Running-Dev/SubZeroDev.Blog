import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { loadSchedule, saveSchedule, type ScheduledJob } from '../src/scheduler/store.js';

describe('scheduler store', () => {
  let scratchRoot: string | undefined;

  afterEach(() => {
    if (scratchRoot) fs.rmSync(scratchRoot, { recursive: true, force: true });
    scratchRoot = undefined;
  });

  it('loadSchedule returns an empty job list when the file does not exist', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    expect(loadSchedule(stateDir)).toEqual({ jobs: [] });
  });

  it('loadSchedule tolerates a corrupted file rather than throwing', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'schedule.json'), 'not valid json {{{');
    expect(loadSchedule(stateDir)).toEqual({ jobs: [] });
  });

  it('loadSchedule tolerates a file whose top-level shape is wrong', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'schedule.json'), JSON.stringify({ notJobs: 'oops' }));
    expect(loadSchedule(stateDir)).toEqual({ jobs: [] });
  });

  it('saveSchedule creates the state directory and round-trips through loadSchedule', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'nested', 'state');
    const job: ScheduledJob = {
      id: 'job-1',
      pr: 7,
      headSha: 'a'.repeat(40),
      scheduledAt: '2026-01-01T00:00:00Z',
      onMissed: { mode: 'catch_up' },
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    saveSchedule(stateDir, { jobs: [job] });
    expect(loadSchedule(stateDir)).toEqual({ jobs: [job] });
  });

  it('saveSchedule never leaves a stray temp file behind on success', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    saveSchedule(stateDir, { jobs: [] });
    const entries = fs.readdirSync(stateDir);
    expect(entries).toEqual(['schedule.json']);
  });

  it('loadSchedule normalizes a pre-rename "armed" status to "auto-merge-enabled"', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    const onDiskJob = {
      id: 'job-1',
      pr: 7,
      headSha: 'a'.repeat(40),
      scheduledAt: '2026-01-01T00:00:00Z',
      onMissed: { mode: 'catch_up' },
      status: 'armed',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    fs.writeFileSync(path.join(stateDir, 'schedule.json'), JSON.stringify({ jobs: [onDiskJob] }));
    expect(loadSchedule(stateDir).jobs[0]?.status).toBe('auto-merge-enabled');
  });

  it('a second save fully replaces the first (not a merge)', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-schedule-store-'));
    const stateDir = path.join(scratchRoot, 'state');
    const jobA: ScheduledJob = {
      id: 'a',
      pr: 1,
      headSha: 'a'.repeat(40),
      scheduledAt: '2026-01-01T00:00:00Z',
      onMissed: { mode: 'catch_up' },
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    saveSchedule(stateDir, { jobs: [jobA] });
    saveSchedule(stateDir, { jobs: [] });
    expect(loadSchedule(stateDir)).toEqual({ jobs: [] });
  });
});
