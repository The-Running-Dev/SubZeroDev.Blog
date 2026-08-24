import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeConsoleDigest, CONSOLE_HASH_FILENAME } from '../../../../SubZeroDev.GitService/src/lifecycle/console-integrity.ts';

/**
 * S37.5: runs `vite build` in `tools/git-service-consumer/console/`, then
 * writes the companion hash file boot's `verifyConsoleArtifact` reads back --
 * same shape as `example-consumer/scripts/build-console-manifest.ts` (S35),
 * pointed at this workspace's own console build (blog post-list and compose
 * screens included) instead of the base's unmodified one S20 used.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const consoleWorkspace = path.join(repoRoot, 'tools', 'git-service-consumer', 'console');
const consoleDir = path.join(consoleWorkspace, 'dist');

function fail(message: string): never {
  console.error(`git-service-consumer build-console-manifest: ${message}`);
  process.exit(1);
}

execFileSync('npm', ['run', 'build'], { cwd: consoleWorkspace, stdio: 'inherit' });

const hash = await computeConsoleDigest(consoleDir).catch((cause) => {
  fail(`could not read the built console directory: ${cause instanceof Error ? cause.message : String(cause)}`);
});

await writeFile(path.join(consoleDir, CONSOLE_HASH_FILENAME), `${hash}\n`, 'utf8');
console.log(`git-service-consumer build-console-manifest: emitted ${path.join(consoleDir, CONSOLE_HASH_FILENAME)}`);
console.log(`git-service-consumer build-console-manifest: console digest (for boot's tamper check): ${hash}`);
