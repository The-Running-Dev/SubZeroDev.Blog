import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeAndStart } from '../../../SubZeroDev.GitService/src/composition-root/compose.ts';
import { toModuleHandler } from '../../../SubZeroDev.GitService/src/module-adapter/module-adapter.ts';
import { EXTRA_TOOL_DECLARATIONS, EXTRA_MODULE_HANDLERS } from './declarations.ts';
import { EXTRA_GIT_UTILITY_DECLARATIONS, EXTRA_GIT_UTILITY_MODULE_HANDLERS } from './extra-declarations.ts';
import { WATCHED_POST_TOOL_DECLARATIONS, WATCHED_POST_MODULE_HANDLERS } from './watched-post.ts';

/**
 * S20's composition root for the blog's derived image: calls the base's
 * published `composeAndStart` (`20-contract.md` § *Tool registry
 * extension*) with the blog's 16 content-authoring tools plus the 4
 * blog-owned tools with no base equivalent (2026-08-21 decision log entry),
 * per `example-consumer/server.ts`'s shape (S35).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

await composeAndStart({
  buildDir: path.join(repoRoot, 'tools', 'git-service-consumer', 'build'),
  // S37: this workspace's own console bundle, consuming the base's
  // published console package (registers the blog's post-list and compose
  // screens) rather than the base's unmodified one S20 used.
  consoleDir: path.join(repoRoot, 'tools', 'git-service-consumer', 'console', 'dist'),
  extraToolDeclarations: [...EXTRA_TOOL_DECLARATIONS, ...EXTRA_GIT_UTILITY_DECLARATIONS, ...WATCHED_POST_TOOL_DECLARATIONS],
  extraModuleHandlers: [
    ...EXTRA_MODULE_HANDLERS.map(({ target, handler }) => ({ target, handler: toModuleHandler(handler as never) })),
    ...EXTRA_GIT_UTILITY_MODULE_HANDLERS.map(({ target, handler }) => ({ target, handler: toModuleHandler(handler as never) })),
    ...WATCHED_POST_MODULE_HANDLERS.map(({ target, handler }) => ({ target, handler: toModuleHandler(handler as never) })),
  ],
});
