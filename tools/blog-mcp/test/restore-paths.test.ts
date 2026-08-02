import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { gitOrThrow, isClean } from '../src/exec/git.js';
import { registerLocalGitTools } from '../src/tools/localGit.js';
import { FakeServer, call } from './helpers/fakeServer.js';
import { createScratchRemote, removeScratchRemote, type ScratchRemote } from './helpers/scratchRemote.js';

function readNormalized(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

async function setUp(prefix: string): Promise<{ remote: ScratchRemote; server: FakeServer }> {
  const remote = await createScratchRemote(prefix);
  const config = loadConfig(remote.clone);
  const server = new FakeServer();
  registerLocalGitTools({
    server: server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
    repoRoot: remote.clone,
    config
  });
  return { remote, server };
}

describe('blog_restore_paths', () => {
  it('restores an allowed tracked path from origin/<base> by default', async () => {
    const { remote, server } = await setUp('restore-default');
    try {
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# unwanted change\n');

      const result = await call(server, 'blog_restore_paths', { paths: ['README.md'] });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ paths: ['README.md'], source: 'origin/main' });
      expect(readNormalized(path.join(remote.clone, 'README.md'))).toBe('# seed\n');
      expect(await isClean({ repoRoot: remote.clone })).toBe(true);
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('honors an explicit source ref', async () => {
    const { remote, server } = await setUp('restore-source');
    try {
      const seedSha = (await gitOrThrow(['rev-parse', 'HEAD'], { repoRoot: remote.clone })).stdout.trim();
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# committed second version\n');
      await gitOrThrow(['add', 'README.md'], { repoRoot: remote.clone });
      await gitOrThrow(['commit', '-m', 'docs: update readme'], { repoRoot: remote.clone });
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# unwanted third version\n');

      const result = await call(server, 'blog_restore_paths', { paths: ['README.md'], source: seedSha });

      expect(result.ok).toBe(true);
      expect((result.data as { source: string }).source).toBe(seedSha);
      expect(readNormalized(path.join(remote.clone, 'README.md'))).toBe('# seed\n');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('rejects paths outside the publishing allowlist', async () => {
    const { remote, server } = await setUp('restore-allowlist');
    try {
      fs.writeFileSync(path.join(remote.clone, 'outside.txt'), 'do not touch\n');

      const result = await call(server, 'blog_restore_paths', { paths: ['outside.txt'] });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect(fs.readFileSync(path.join(remote.clone, 'outside.txt'), 'utf8')).toBe('do not touch\n');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it.each(['.', '-A', '--all'])('rejects the broad path selector %s', async (selector) => {
    const { remote, server } = await setUp(`restore-selector-${selector.replace(/[^a-z]/g, 'x')}`);
    try {
      const result = await call(server, 'blog_restore_paths', { paths: [selector] });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('refuses a staged path and points to blog_reset_stage without changing it', async () => {
    const { remote, server } = await setUp('restore-staged');
    try {
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# staged change\n');
      await gitOrThrow(['add', 'README.md'], { repoRoot: remote.clone });

      const result = await call(server, 'blog_restore_paths', { paths: ['README.md'] });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect(result.summary).toContain('blog_reset_stage');
      expect(fs.readFileSync(path.join(remote.clone, 'README.md'), 'utf8')).toBe('# staged change\n');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('cannot delete an untracked file', async () => {
    const { remote, server } = await setUp('restore-untracked');
    try {
      fs.writeFileSync(path.join(remote.clone, 'DRAFT.md'), '# irreplaceable draft\n');

      const result = await call(server, 'blog_restore_paths', { paths: ['DRAFT.md'] });

      expect(result.ok).toBe(false);
      expect(result.kind).toBe('precondition');
      expect(result.summary).toContain('cannot delete an untracked file');
      expect(fs.readFileSync(path.join(remote.clone, 'DRAFT.md'), 'utf8')).toBe('# irreplaceable draft\n');
    } finally {
      removeScratchRemote(remote);
    }
  });

  it('closes the dirty-tree dead end so branch preparation can succeed', async () => {
    const { remote, server } = await setUp('restore-then-prepare');
    try {
      fs.writeFileSync(path.join(remote.clone, 'README.md'), '# unwanted metadata-like change\n');

      const refused = await call(server, 'blog_prepare_publish_branch', { slug: 'recovered', kind: 'blog' });
      expect(refused.ok).toBe(false);
      expect(refused.kind).toBe('precondition');
      expect(refused.summary).toContain('blog_restore_paths');

      const restored = await call(server, 'blog_restore_paths', { paths: ['README.md'] });
      expect(restored.ok).toBe(true);

      const prepared = await call(server, 'blog_prepare_publish_branch', { slug: 'recovered', kind: 'blog' });
      expect(prepared.ok).toBe(true);
      expect((prepared.data as { branch: string }).branch).toBe('blog/recovered');
    } finally {
      removeScratchRemote(remote);
    }
  });
});
