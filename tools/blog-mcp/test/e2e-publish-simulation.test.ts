import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { git, gitOrThrow, currentBranch } from '../src/exec/git.js';
import { ensureRepo } from '../src/bootstrap/repo.js';
import { callToolInProcess } from '../src/serve/client.js';
import { WATCHER_CAPABILITIES } from '../src/serve/capabilities.js';
import type { CreateServerOptions } from '../src/server.js';
import { runWatchTick } from '../src/watcher/engine.js';
import { loadPendingMerges } from '../src/watcher/pendingMerges.js';
import { createAdditionalClone, createScratchRemote, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GH_SHIM_SCRIPT = path.join(__dirname, 'fixtures-bin', 'gh-shim.mjs');

interface SeededRepo {
  remote: ScratchRemote;
  serverOptions: CreateServerOptions;
}

interface PublishResult {
  branch: string;
  path: string;
  sha: string;
  pr: number;
}

const POST = {
  title: 'End-to-end publishing fixture',
  description: 'A fixture that exercises the complete publishing contract.',
  slug: 'end-to-end-publishing-fixture',
  date: '2026-08-02T12:00:00Z',
  body: 'This body is written by the end-to-end publishing simulation.',
  tags: ['fixture-tag'],
  authors: ['fixture-author']
};

afterEach(() => {
  for (const key of [
    'BLOG_MCP_GH_COMMAND',
    'GH_SHIM_LOG',
    'GH_SHIM_HEAD_SHA',
    'GH_SHIM_REPO_ROOT',
    'GH_SHIM_THREADS_JSON',
    'GH_SHIM_STATE',
    'GH_SHIM_MERGE_COMMIT',
    'GH_SHIM_HEAD_REF_NAME'
  ]) {
    delete process.env[key];
  }
});

async function seedBlogRepo(prefix: string): Promise<SeededRepo> {
  const remote = await createScratchRemote(prefix);
  const { clone } = remote;
  fs.mkdirSync(path.join(clone, '.config'));
  fs.writeFileSync(
    path.join(clone, '.config', 'blog.json'),
    JSON.stringify({
      base_branch: 'main',
      clone_url: 'https://github.com/test-owner/test-repo.git',
      blog_dir: 'docs/blog',
      author_id: 'subzerodev'
    })
  );
  fs.mkdirSync(path.join(clone, 'docs', 'blog'), { recursive: true });
  fs.writeFileSync(
    path.join(clone, 'docs', 'blog', 'tags.yml'),
    'test:\n  label: Test\n  permalink: /test\n  description: Fixture tag for tests.\n'
  );
  fs.writeFileSync(
    path.join(clone, 'docs', 'blog', 'authors.yml'),
    'subzerodev:\n  name: SubZeroDev\n  url: https://blog.subzerodev.com/\n'
  );
  await gitOrThrow(['add', '--', '.config/blog.json', 'docs/blog/authors.yml', 'docs/blog/tags.yml'], { repoRoot: clone });
  await gitOrThrow(['commit', '-m', 'chore: seed blog fixture'], { repoRoot: clone });
  await gitOrThrow(['push', 'origin', 'main'], { repoRoot: clone });

  process.env.BLOG_MCP_GH_COMMAND = JSON.stringify(['node', GH_SHIM_SCRIPT]);
  process.env.GH_SHIM_THREADS_JSON = '[]';
  process.env.GH_SHIM_HEAD_SHA = 'GIT_HEAD';
  process.env.GH_SHIM_REPO_ROOT = clone;

  return {
    remote,
    serverOptions: {
      repoRoot: clone,
      auditLogPath: path.join(remote.scratchRoot, 'audit.log'),
      capabilities: WATCHER_CAPABILITIES
    }
  };
}

async function tool<T>(options: CreateServerOptions, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await callToolInProcess(options, name, args);
  expect(result.ok, `${name}: ${result.summary}`).toBe(true);
  return result.data as T;
}

async function publishDirect(options: CreateServerOptions, post = POST): Promise<PublishResult> {
  const branch = await tool<{ branch: string }>(options, 'blog_prepare_publish_branch', { slug: post.slug, kind: 'blog' });
  const write = await tool<{ path: string; changedPaths: string[] }>(options, 'blog_create_post', post);
  await tool(options, 'blog_stage', { paths: write.changedPaths });
  const commit = await tool<{ sha: string }>(options, 'blog_commit', { type: 'feat', scope: 'blog', summary: `add ${post.slug}` });
  const push = await tool<{ localSha: string }>(options, 'blog_push', {});
  expect(push.localSha).toBe(commit.sha);
  const pr = await tool<{ pr: number }>(options, 'blog_create_pr', {
    title: `Add ${post.title}`,
    body: 'End-to-end publishing simulation.',
    head: branch.branch
  });
  return { branch: branch.branch, path: write.path, sha: commit.sha, pr: pr.pr };
}

function postMarkdown(post = POST): string {
  return [
    '---',
    `title: "${post.title}"`,
    `description: "${post.description}"`,
    `slug: ${post.slug}`,
    `date: ${post.date}`,
    'authors:',
    ...post.authors.map((author) => `  - ${author}`),
    'tags:',
    ...post.tags.map((tag) => `  - ${tag}`),
    '---',
    '',
    post.body
  ].join('\n');
}

describe.sequential('Milestone 11 Phase 7: end-to-end publish simulation', () => {
  it('create: direct MCP-shaped publishing and the directory watcher produce equivalent authored content', async () => {
    const direct = await seedBlogRepo('e2e-direct-create');
    const watcher = await seedBlogRepo('e2e-watcher-create');
    try {
      const directResult = await publishDirect(direct.serverOptions);

      const watchDir = path.join(watcher.remote.scratchRoot, 'watch');
      fs.mkdirSync(watchDir);
      fs.writeFileSync(path.join(watchDir, 'post.md'), postMarkdown());
      const watchResult = await runWatchTick({
        repoRoot: watcher.remote.clone,
        watchDir,
        autoMerge: false,
        serverOptions: watcher.serverOptions
      });
      expect(watchResult.filesPublished).toBe(1);

      const directPost = await gitOrThrow(['show', `${directResult.branch}:${directResult.path}`], { repoRoot: direct.remote.clone });
      const watcherPost = await gitOrThrow(['show', `blog/${POST.slug}:${directResult.path}`], { repoRoot: watcher.remote.clone });
      expect(watcherPost.stdout).toBe(directPost.stdout);

      for (const metadataPath of ['docs/blog/authors.yml', 'docs/blog/tags.yml']) {
        const directMetadata = await gitOrThrow(['show', `${directResult.branch}:${metadataPath}`], { repoRoot: direct.remote.clone });
        const watcherMetadata = await gitOrThrow(['show', `blog/${POST.slug}:${metadataPath}`], { repoRoot: watcher.remote.clone });
        expect(watcherMetadata.stdout).toBe(directMetadata.stdout);
      }
    } finally {
      removeScratchRemote(direct.remote);
      removeScratchRemote(watcher.remote);
    }
  }, 20_000);

  it('retry: an interrupted local write can be repeated without duplicating generated metadata', async () => {
    const seeded = await seedBlogRepo('e2e-retry');
    try {
      await tool(seeded.serverOptions, 'blog_prepare_publish_branch', { slug: POST.slug, kind: 'blog' });
      const first = await tool<{ changedPaths: string[] }>(seeded.serverOptions, 'blog_create_post', POST);
      expect(first.changedPaths).toEqual(expect.arrayContaining(['docs/blog/authors.yml', 'docs/blog/tags.yml']));

      const retry = await tool<{ createdAuthors: unknown[]; createdTags: unknown[] }>(seeded.serverOptions, 'blog_create_post', {
        ...POST,
        overwrite: true
      });
      expect(retry.createdAuthors).toEqual([]);
      expect(retry.createdTags).toEqual([]);

      const authors = fs.readFileSync(path.join(seeded.remote.clone, 'docs', 'blog', 'authors.yml'), 'utf8');
      const tags = fs.readFileSync(path.join(seeded.remote.clone, 'docs', 'blog', 'tags.yml'), 'utf8');
      expect((authors.match(/^fixture-author:/gm) ?? [])).toHaveLength(1);
      expect((tags.match(/^fixture-tag:/gm) ?? [])).toHaveLength(1);
    } finally {
      removeScratchRemote(seeded.remote);
    }
  });

  it('conflict: preserves the local-only commit when a competing publisher advances the base incompatibly', async () => {
    const seeded = await seedBlogRepo('e2e-conflict');
    try {
      fs.writeFileSync(path.join(seeded.remote.clone, 'README.md'), '# local publisher\n');
      await gitOrThrow(['add', '--', 'README.md'], { repoRoot: seeded.remote.clone });
      await gitOrThrow(['commit', '-m', 'chore: local publisher change'], { repoRoot: seeded.remote.clone });
      const localSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: seeded.remote.clone })).stdout.trim();

      const competingClone = await createAdditionalClone(seeded.remote, 'competing-publisher');
      fs.writeFileSync(path.join(competingClone, 'README.md'), '# competing publisher\n');
      await gitOrThrow(['add', '--', 'README.md'], { repoRoot: competingClone });
      await gitOrThrow(['commit', '-m', 'chore: competing publisher change'], { repoRoot: competingClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: competingClone });

      const result = await callToolInProcess(seeded.serverOptions, 'blog_prepare_publish_branch', { slug: 'conflict', kind: 'blog' });
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      const data = result.data as { branch: string; preservedCommits: Array<{ sha: string }> };
      expect(data.branch).toBe('blog/conflict');
      expect(data.preservedCommits[0]?.sha).toBe(localSha);
      const log = await gitOrThrow(['log', '--format=%H', 'blog/conflict'], { repoRoot: seeded.remote.clone });
      expect(log.stdout).toContain(localSha);
    } finally {
      removeScratchRemote(seeded.remote);
    }
  });

  it('merge: a squash-merged publish is reconciled to the remote base and removes its local branch', async () => {
    const seeded = await seedBlogRepo('e2e-merge');
    try {
      const published = await publishDirect(seeded.serverOptions);
      const mergeClone = await createAdditionalClone(seeded.remote, 'merge-publisher');
      const source = fs.readFileSync(path.join(seeded.remote.clone, published.path), 'utf8');
      fs.mkdirSync(path.dirname(path.join(mergeClone, published.path)), { recursive: true });
      fs.writeFileSync(path.join(mergeClone, published.path), source);
      for (const metadataPath of ['docs/blog/authors.yml', 'docs/blog/tags.yml']) {
        fs.copyFileSync(path.join(seeded.remote.clone, metadataPath), path.join(mergeClone, metadataPath));
      }
      await gitOrThrow(['add', '--', published.path, 'docs/blog/authors.yml', 'docs/blog/tags.yml'], { repoRoot: mergeClone });
      await gitOrThrow(['commit', '-m', 'feat(blog): add end-to-end publishing fixture'], { repoRoot: mergeClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: mergeClone });
      const mergeCommitSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: mergeClone })).stdout.trim();

      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_MERGE_COMMIT = mergeCommitSha;
      process.env.GH_SHIM_HEAD_REF_NAME = published.branch;
      const reconciliation = await tool<{ reconciledBaseSha: string; branchDeleted: boolean }>(seeded.serverOptions, 'blog_reconcile_after_merge', {
        pr: published.pr,
        expectedHeadSha: published.sha
      });
      expect(reconciliation.reconciledBaseSha).toBe(mergeCommitSha);
      expect(reconciliation.branchDeleted).toBe(true);
      expect(await currentBranch({ repoRoot: seeded.remote.clone })).toBe('main');
      expect((await git(['rev-parse', '--verify', '--quiet', published.branch], { repoRoot: seeded.remote.clone })).exitCode).not.toBe(0);
    } finally {
      removeScratchRemote(seeded.remote);
    }
  }, 20_000);

  it('restart: a clean, unmerged feature checkout remains recoverable after a process restart without duplicate content', async () => {
    const seeded = await seedBlogRepo('e2e-restart');
    try {
      await tool(seeded.serverOptions, 'blog_prepare_publish_branch', { slug: POST.slug, kind: 'blog' });
      const write = await tool<{ changedPaths: string[] }>(seeded.serverOptions, 'blog_create_post', POST);
      await tool(seeded.serverOptions, 'blog_stage', { paths: write.changedPaths });
      await tool(seeded.serverOptions, 'blog_commit', { type: 'feat', scope: 'blog', summary: `add ${POST.slug}` });

      const restarted = await ensureRepo({
        repoPath: seeded.remote.clone,
        cloneUrl: seeded.remote.bareRemote,
        gitUserName: 'Test',
        gitUserEmail: 'test@example.test'
      });
      expect(restarted.action).toBe('left-on-feature-branch');
      expect(restarted.branch).toBe(`blog/${POST.slug}`);

      const posts = fs.readdirSync(path.join(seeded.remote.clone, 'docs', 'blog')).filter((name) => name.endsWith(`-${POST.slug}.md`));
      expect(posts).toHaveLength(1);
      expect((fs.readFileSync(path.join(seeded.remote.clone, 'docs', 'blog', 'authors.yml'), 'utf8').match(/^fixture-author:/gm) ?? [])).toHaveLength(1);
      expect((fs.readFileSync(path.join(seeded.remote.clone, 'docs', 'blog', 'tags.yml'), 'utf8').match(/^fixture-tag:/gm) ?? [])).toHaveLength(1);
    } finally {
      removeScratchRemote(seeded.remote);
    }
  });

  it('reconciliation: a restarted watcher observes a merged pending PR and converges its checkout', async () => {
    const seeded = await seedBlogRepo('e2e-watcher-reconcile');
    try {
      const watchDir = path.join(seeded.remote.scratchRoot, 'watch');
      const stateDir = path.join(seeded.remote.scratchRoot, 'state');
      fs.mkdirSync(watchDir);
      fs.writeFileSync(path.join(watchDir, 'post.md'), postMarkdown());
      const firstTick = await runWatchTick({
        repoRoot: seeded.remote.clone,
        watchDir,
        stateDir,
        autoMerge: false,
        serverOptions: seeded.serverOptions
      });
      expect(firstTick.filesPublished).toBe(1);
      expect(loadPendingMerges(stateDir).pending).toHaveLength(1);

      const mergeClone = await createAdditionalClone(seeded.remote, 'watcher-merge-publisher');
      const branch = `blog/${POST.slug}`;
      for (const relativePath of [
        `docs/blog/${fs.readdirSync(path.join(seeded.remote.clone, 'docs', 'blog')).find((name) => name.endsWith(`-${POST.slug}.md`)) as string}`,
        'docs/blog/authors.yml',
        'docs/blog/tags.yml'
      ]) {
        const destination = path.join(mergeClone, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(seeded.remote.clone, relativePath), destination);
      }
      await gitOrThrow(['add', '--', 'docs/blog'], { repoRoot: mergeClone });
      await gitOrThrow(['commit', '-m', 'feat(blog): add watcher fixture'], { repoRoot: mergeClone });
      await gitOrThrow(['push', 'origin', 'main'], { repoRoot: mergeClone });
      const mergeCommitSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: mergeClone })).stdout.trim();

      process.env.GH_SHIM_STATE = 'MERGED';
      process.env.GH_SHIM_MERGE_COMMIT = mergeCommitSha;
      process.env.GH_SHIM_HEAD_REF_NAME = branch;
      await runWatchTick({ repoRoot: seeded.remote.clone, watchDir, stateDir, autoMerge: false, serverOptions: seeded.serverOptions });

      expect(loadPendingMerges(stateDir).pending).toEqual([]);
      expect(await currentBranch({ repoRoot: seeded.remote.clone })).toBe('main');
      expect((await git(['rev-parse', '--verify', '--quiet', branch], { repoRoot: seeded.remote.clone })).exitCode).not.toBe(0);
    } finally {
      removeScratchRemote(seeded.remote);
    }
  }, 20_000);
});
