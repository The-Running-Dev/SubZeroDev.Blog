import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { gitOrThrow } from '../src/exec/git.js';
import { runWatchTick, startWatcher, type WatchTickResult } from '../src/watcher/engine.js';
import { WATCHER_CAPABILITIES } from '../src/serve/capabilities.js';
import type { CreateServerOptions } from '../src/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VALID_POST = [
  '---',
  'title: "Watcher Fixture"',
  'description: "A post published via the directory watcher."',
  'slug: watcher-fixture',
  'tags:',
  '  - test',
  '---',
  '',
  'Body text from the watcher.'
].join('\n');

/**
 * Exercises src/watcher/engine.ts end to end against a real scratch bare
 * remote + clone -- never the live SubZeroDev.Blog checkout, same pattern as
 * test/scheduler-engine.test.ts and test/serve-writes.test.ts. Local git
 * (branch/stage/commit/push) runs for real; PR/auto-merge run against
 * test/fixtures-bin/gh-shim.mjs.
 */
describe('watcher engine: runWatchTick', () => {
  let scratchRoot: string;
  let clone: string;
  let watchDir: string;
  let ghShimLog: string;
  let serverOptions: CreateServerOptions;

  beforeAll(async () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-watcher-'));
    const bareRemote = path.join(scratchRoot, 'origin.git');
    clone = path.join(scratchRoot, 'clone');
    watchDir = path.join(scratchRoot, 'watch');
    ghShimLog = path.join(scratchRoot, 'gh-shim.log');
    fs.mkdirSync(watchDir);

    fs.mkdirSync(bareRemote);
    await gitOrThrow(['init', '--bare', '-b', 'main'], { repoRoot: bareRemote });

    const seed = path.join(scratchRoot, 'seed');
    fs.mkdirSync(seed);
    await gitOrThrow(['init', '-b', 'main'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: seed });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), '# seed\n');
    // clone_url is a GitHub-shaped URL so blog_arm_auto_merge's review-thread
    // check can resolve owner/repo -- the real git remote below is a local
    // bare path (needed for real push testing), which cannot resolve to one.
    fs.mkdirSync(path.join(seed, '.config'));
    fs.writeFileSync(
      path.join(seed, '.config', 'blog.json'),
      JSON.stringify({ base_branch: 'main', clone_url: 'https://github.com/test-owner/test-repo.git' })
    );
    fs.mkdirSync(path.join(seed, 'docs', 'blog'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'docs', 'blog', 'tags.yml'), 'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n');
    fs.writeFileSync(path.join(seed, 'docs', 'blog', 'authors.yml'), 'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n');
    await gitOrThrow(['add', '.'], { repoRoot: seed });
    await gitOrThrow(['commit', '-m', 'chore: seed'], { repoRoot: seed });
    await gitOrThrow(['remote', 'add', 'origin', bareRemote], { repoRoot: seed });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: seed });

    await gitOrThrow(['clone', bareRemote, clone], { repoRoot: scratchRoot });
    await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: clone });
    await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: clone });

    process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
    serverOptions = { repoRoot: clone, auditLogPath: path.join(scratchRoot, 'audit.log'), capabilities: WATCHER_CAPABILITIES };
  });

  afterAll(() => {
    delete process.env.BLOG_MCP_GH_COMMAND;
    delete process.env.GH_SHIM_LOG;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_REPO_ROOT;
    delete process.env.GH_SHIM_THREADS_JSON;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.writeFileSync(ghShimLog, '');
    process.env.GH_SHIM_LOG = ghShimLog;
    delete process.env.GH_SHIM_HEAD_SHA;
    delete process.env.GH_SHIM_REPO_ROOT;
    // The shim's default thread list includes one unresolved thread;
    // blog_arm_auto_merge refuses to arm while any are unresolved, so tests
    // that expect a successful arm must opt into a clean list.
    process.env.GH_SHIM_THREADS_JSON = '[]';
  });

  function dropFile(name: string, content: string): void {
    fs.writeFileSync(path.join(watchDir, name), content, 'utf8');
  }

  function listSubdir(sub: string): string[] {
    const dir = path.join(watchDir, sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  }

  function shimCalls(): string[][] {
    return fs
      .readFileSync(ghShimLog, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
  }

  it('publishes a complete file end to end: branch, commit, push, PR opened, auto-merge armed', async () => {
    dropFile('post.md', VALID_POST);
    process.env.GH_SHIM_HEAD_SHA = 'GIT_HEAD';
    process.env.GH_SHIM_REPO_ROOT = clone;

    const result: WatchTickResult = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });

    expect(result.skippedRepoNotReady).toBe(false);
    expect(result.filesConsidered).toBe(1);
    expect(result.filesPublished).toBe(1);
    expect(result.filesFailed).toBe(0);

    expect(listSubdir('processed')).toHaveLength(1);
    expect(listSubdir('failed')).toHaveLength(0);
    expect(fs.readdirSync(watchDir).filter((n) => n.endsWith('.md'))).toHaveLength(0);

    const postFiles = fs.readdirSync(path.join(clone, 'docs', 'blog')).filter((f) => f.endsWith('-watcher-fixture.md'));
    expect(postFiles).toHaveLength(1);
    const written = fs.readFileSync(path.join(clone, 'docs', 'blog', postFiles[0] as string), 'utf8');
    expect(written).toContain('Body text from the watcher.');

    const calls = shimCalls();
    expect(calls.some((c) => c[0] === 'pr' && c[1] === 'create')).toBe(true);
    expect(calls.some((c) => c[0] === 'pr' && c[1] === 'merge')).toBe(true);
  });

  it('rejects a file missing required front matter fields before touching git at all', async () => {
    const incomplete = ['---', 'title: "No Tags Here"', 'description: "Missing tags."', 'slug: no-tags', '---', '', 'Body.'].join('\n');
    dropFile('incomplete.md', incomplete);

    const before = await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: clone });
    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });
    const after = await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: clone });

    expect(result.filesConsidered).toBe(1);
    expect(result.filesFailed).toBe(1);
    expect(result.filesPublished).toBe(0);
    expect(before.stdout).toBe(after.stdout); // no commit happened

    const failed = listSubdir('failed');
    expect(failed.some((f) => f.endsWith('incomplete.md'))).toBe(true);
    const errorFile = failed.find((f) => f.endsWith('incomplete.md.error.txt'));
    expect(errorFile).toBeTruthy();
    const errorText = fs.readFileSync(path.join(watchDir, 'failed', errorFile as string), 'utf8');
    expect(errorText).toContain('tags');

    const calls = shimCalls();
    expect(calls).toHaveLength(0); // never even reached gh
  });

  it('rejects a file with no front matter fences at all -- unlike Compose, no heading-detection fallback', async () => {
    dropFile('no-fences.md', '# Just a heading\n\nNo front matter here.');
    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });
    expect(result.filesFailed).toBe(1);
    const failed = listSubdir('failed');
    const errorFile = failed.find((f) => f.endsWith('no-fences.md.error.txt'));
    const errorText = fs.readFileSync(path.join(watchDir, 'failed', errorFile as string), 'utf8');
    expect(errorText).toContain('front matter');
  });

  it('updates an existing post instead of creating a new one when the slug already matches', async () => {
    // Simulate a post that was already published previously: seed it
    // directly onto main, independent of the watcher.
    await gitOrThrow(['switch', 'main'], { repoRoot: clone });
    const existingPath = path.join(clone, 'docs', 'blog', '2020-01-01-existing-fixture.md');
    fs.writeFileSync(
      existingPath,
      [
        '---',
        'title: "Existing"',
        'description: "Original description."',
        'slug: existing-fixture',
        'authors:',
        '  - subzerodev',
        'date: 2020-01-01T00:00:00Z',
        'tags:',
        '  - test',
        '---',
        '',
        'Original body.'
      ].join('\n'),
      'utf8'
    );
    await gitOrThrow(['add', '--', 'docs/blog/2020-01-01-existing-fixture.md'], { repoRoot: clone });
    await gitOrThrow(['commit', '-m', 'chore: seed existing-fixture'], { repoRoot: clone });
    await gitOrThrow(['push', 'origin', 'main'], { repoRoot: clone });

    const update = [
      '---',
      'title: "Existing, Updated"',
      'description: "Updated description."',
      'slug: existing-fixture',
      'tags:',
      '  - test',
      '---',
      '',
      'Updated body.'
    ].join('\n');
    dropFile('update.md', update);
    process.env.GH_SHIM_HEAD_SHA = 'GIT_HEAD';
    process.env.GH_SHIM_REPO_ROOT = clone;

    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });
    expect(result.filesPublished).toBe(1);
    expect(result.filesFailed).toBe(0);

    const matches = fs.readdirSync(path.join(clone, 'docs', 'blog')).filter((f) => f.includes('existing-fixture'));
    expect(matches).toHaveLength(1); // still one file for this slug, not two
    const content = fs.readFileSync(path.join(clone, 'docs', 'blog', matches[0] as string), 'utf8');
    expect(content).toContain('Updated body.');
    expect(content).toContain('Existing, Updated');
  });

  it('opens the PR but does not arm auto-merge when autoMerge is false', async () => {
    const post = ['---', 'title: "No Auto Merge"', 'description: "desc"', 'slug: no-auto-merge', 'tags:', '  - test', '---', '', 'Body.'].join('\n');
    dropFile('no-auto-merge.md', post);

    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: false, serverOptions });
    expect(result.filesPublished).toBe(1);

    const calls = shimCalls();
    expect(calls.some((c) => c[0] === 'pr' && c[1] === 'create')).toBe(true);
    expect(calls.some((c) => c[0] === 'pr' && c[1] === 'merge')).toBe(false);
  });

  it('does nothing when the tree is dirty -- fail-safe, not an error', async () => {
    dropFile('during-dirty.md', VALID_POST);
    fs.writeFileSync(path.join(clone, 'dirty.txt'), 'x');

    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });
    expect(result.skippedRepoNotReady).toBe(true);
    expect(result.filesConsidered).toBe(0);
    // Untouched -- still sitting in the watch dir root, not claimed.
    expect(fs.existsSync(path.join(watchDir, 'during-dirty.md'))).toBe(true);

    fs.rmSync(path.join(clone, 'dirty.txt'));
    fs.rmSync(path.join(watchDir, 'during-dirty.md'));
  });

  it('recovers a file left in processing/ by a prior interrupted run -- never silently reprocesses it', async () => {
    const processingDir = path.join(watchDir, 'processing');
    fs.mkdirSync(processingDir, { recursive: true });
    fs.writeFileSync(path.join(processingDir, 'interrupted.md'), VALID_POST, 'utf8');

    const result = await runWatchTick({ repoRoot: clone, watchDir, autoMerge: true, serverOptions });

    expect(fs.existsSync(path.join(processingDir, 'interrupted.md'))).toBe(false);
    const failed = listSubdir('failed');
    const recovered = failed.find((f) => f.endsWith('interrupted.md'));
    expect(recovered).toBeTruthy();
    const errorFile = failed.find((f) => f.endsWith('interrupted.md.error.txt'));
    const errorText = fs.readFileSync(path.join(watchDir, 'failed', errorFile as string), 'utf8');
    expect(errorText).toContain('interrupted');
    // The recovery scan isn't counted as a "considered" file from this tick's
    // own watch-dir listing.
    expect(result.filesConsidered).toBe(0);

    const calls = shimCalls();
    expect(calls).toHaveLength(0); // never re-ran the pipeline against it
  });
});

describe('startWatcher', () => {
  it('processes files automatically on its own timer, and stop() drains an in-flight tick before resolving', async () => {
    let callCount = 0;
    let resolveTick: (() => void) | undefined;
    const slowTick = async (): Promise<WatchTickResult> => {
      callCount++;
      await new Promise<void>((resolve) => {
        resolveTick = resolve;
      });
      return { skippedRepoNotReady: false, filesConsidered: 0, filesPublished: 0, filesFailed: 0 };
    };

    const handle = startWatcher({
      repoRoot: '/irrelevant',
      watchDir: '/irrelevant',
      autoMerge: true,
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
