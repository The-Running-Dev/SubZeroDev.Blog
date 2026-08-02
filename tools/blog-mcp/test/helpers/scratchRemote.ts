import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitOrThrow } from '../../src/exec/git.js';

export interface ScratchRemote {
  scratchRoot: string;
  bareRemote: string;
  clone: string;
}

/**
 * A real bare remote plus a real clone with an identity configured and one
 * seed commit already pushed, for tests that exercise git-backed tools
 * end to end rather than mocking git output. This exact setup was already
 * copy-pasted verbatim across test/repoInfo.test.ts, test/remote.test.ts,
 * test/localgit.test.ts, and test/serve-writes.test.ts before this helper
 * existed -- extracted here as the first alternative to a fifth copy, not
 * as a retroactive mandate; those four are left exactly as they are.
 */
export async function createScratchRemote(prefix: string): Promise<ScratchRemote> {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), `blog-mcp-${prefix}-`));
  const bareRemote = path.join(scratchRoot, 'origin.git');
  const clone = path.join(scratchRoot, 'clone');

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

  return { scratchRoot, bareRemote, clone };
}

export function removeScratchRemote(remote: ScratchRemote): void {
  fs.rmSync(remote.scratchRoot, { recursive: true, force: true });
}

/**
 * A second real clone of the same bare remote, for scenarios that need to
 * push from somewhere other than the primary clone under test (e.g.
 * diverging origin/main while the primary clone stays on a local-only
 * commit).
 */
export async function createAdditionalClone(remote: ScratchRemote, name: string): Promise<string> {
  const additionalClone = path.join(remote.scratchRoot, name);
  await gitOrThrow(['clone', remote.bareRemote, additionalClone], { repoRoot: remote.scratchRoot });
  await gitOrThrow(['config', 'user.email', 'test@example.test'], { repoRoot: additionalClone });
  await gitOrThrow(['config', 'user.name', 'Test'], { repoRoot: additionalClone });
  return additionalClone;
}
