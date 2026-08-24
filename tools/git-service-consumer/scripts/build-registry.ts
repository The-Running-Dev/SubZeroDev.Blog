import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compiler } from '../../../../SubZeroDev.GitService/src/contract/compiler.ts';
import { PRODUCTION_TOOL_DECLARATIONS } from '../../../../SubZeroDev.GitService/src/composition-root/production-declarations.ts';
import { EXTRA_TOOL_DECLARATIONS } from '../declarations.ts';
import { EXTRA_GIT_UTILITY_DECLARATIONS } from '../extra-declarations.ts';
import { WATCHED_POST_TOOL_DECLARATIONS } from '../watched-post.ts';

/**
 * S20.7: compiles `PRODUCTION_TOOL_DECLARATIONS` unioned with this
 * workspace's own 20 extra declarations (16 content-authoring tools plus 4
 * blog-owned tools with no base equivalent) through the base's own
 * `compiler`, the same way `example-consumer/scripts/build-registry.ts`
 * does for S35 -- one registry, one fingerprint, over both sets. Both
 * counts are stated on stdout.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const buildDir = path.join(repoRoot, 'tools', 'git-service-consumer', 'build');

function fail(message: string): never {
  console.error(`git-service-consumer build-registry: ${message}`);
  process.exit(1);
}

const extraDeclarations = [...EXTRA_TOOL_DECLARATIONS, ...EXTRA_GIT_UTILITY_DECLARATIONS, ...WATCHED_POST_TOOL_DECLARATIONS];
const declarations = [...PRODUCTION_TOOL_DECLARATIONS, ...extraDeclarations];
const result = compiler.compile(declarations);
if (!result.ok) {
  for (const error of result.error) {
    console.error(`git-service-consumer build-registry: ${error.code}: ${error.summary}`);
  }
  fail(`the derived declaration set failed to compile (${result.error.length} error(s))`);
}

await mkdir(buildDir, { recursive: true });

const registryJson = JSON.stringify(
  result.value.registry,
  (_key, value) => (value instanceof Set ? [...value].sort() : value),
  2,
);
const registryPath = path.join(buildDir, 'registry.json');
await writeFile(registryPath, registryJson, 'utf8');

const registryHash = createHash('sha256').update(registryJson, 'utf8').digest('hex');
await writeFile(path.join(buildDir, 'registry.json.sha256'), `${registryHash}\n`, 'utf8');

await writeFile(path.join(buildDir, 'registry.md'), result.value.documentation.markdown, 'utf8');

console.log(`git-service-consumer build-registry: base tools: ${PRODUCTION_TOOL_DECLARATIONS.length}, blog tools: ${extraDeclarations.length} (16 content-authoring + 5 git-utility + 2 file-watcher), total: ${declarations.length}`);
console.log(`git-service-consumer build-registry: emitted ${registryPath}`);
console.log(`git-service-consumer build-registry: registry fingerprint: ${result.value.fingerprint}`);
