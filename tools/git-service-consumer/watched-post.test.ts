import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { compiler } from '../../../SubZeroDev.GitService/src/contract/compiler.ts';
import { PRODUCTION_TOOL_DECLARATIONS } from '../../../SubZeroDev.GitService/src/composition-root/production-declarations.ts';
import type { CallContext } from '../../../SubZeroDev.GitService/src/shared/call-context.ts';
import type { PathPrefix } from '../../../SubZeroDev.GitService/src/shared/brands.ts';

import { EXTRA_TOOL_DECLARATIONS } from './declarations.ts';
import { EXTRA_GIT_UTILITY_DECLARATIONS } from './extra-declarations.ts';
import {
  WATCHED_POST_TOOL_DECLARATIONS,
  WATCHED_POST_PLAN_HANDLER,
  WATCHED_POST_APPLY_HANDLER,
  type WatchedPostPlan,
} from './watched-post.ts';

/**
 * S38 unit tests. Model: `src/watcher/watcher.test.ts` and
 * `src/declarations/declarations.test.ts` (node:test / node:assert style).
 * Run with:
 *   node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     --test tools/git-service-consumer/watched-post.test.ts
 */

function fixtureCallContext(overrides: Partial<CallContext> = {}): CallContext {
  return {
    operationId: 'op-1' as never,
    declarationId: 'blog' as never,
    generation: null,
    cloneRoot: null,
    actorRef: { kind: 'watcher', subject: 'watcher:blog' as never, clientId: null, grantId: null },
    capabilities: new Set() as never,
    writablePathPrefixes: [] as unknown as readonly PathPrefix[],
    context: 'normal',
    scheduledJobId: null,
    deadline: new Date().toISOString() as never,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function postFile(overrides: Partial<{ title: string; description: string; slug: string; date: string; tags: readonly string[]; body: string }> = {}): string {
  const fm = {
    title: overrides.title ?? 'A New Post',
    description: overrides.description ?? 'A description.',
    slug: overrides.slug ?? 'a-new-post',
    date: overrides.date ?? '2026-08-24',
    tags: overrides.tags ?? ['ai-assisted-engineering'],
  };
  const body = overrides.body ?? 'Hello, world.';
  return [
    '---',
    `title: "${fm.title}"`,
    `description: "${fm.description}"`,
    `slug: ${fm.slug}`,
    'authors:',
    '  - subzerodev',
    `date: ${fm.date}`,
    'tags:',
    ...fm.tags.map((t) => `  - ${t}`),
    '---',
    '',
    body,
    '',
  ].join('\n');
}

// =============================================================================
// S38.1 — registry-compile test: both tools present, correctly annotated.
// =============================================================================

test('S38.1 — watched_post_plan and watched_post_apply compile into the registry, correctly annotated', () => {
  const declarations = [
    ...PRODUCTION_TOOL_DECLARATIONS,
    ...EXTRA_TOOL_DECLARATIONS,
    ...EXTRA_GIT_UTILITY_DECLARATIONS,
    ...WATCHED_POST_TOOL_DECLARATIONS,
  ];
  const result = compiler.compile(declarations);
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) return;

  const plan = result.value.registry.entries.find((e) => e.name === 'watched_post_plan');
  const apply = result.value.registry.entries.find((e) => e.name === 'watched_post_apply');
  assert.ok(plan, 'watched_post_plan is present in the compiled registry');
  assert.ok(apply, 'watched_post_apply is present in the compiled registry');
  assert.equal(plan?.annotations.fileWatcher, 'plan');
  assert.equal(apply?.annotations.fileWatcher, 'apply');
});

// =============================================================================
// S38.2 — two different front-matter inputs route to two different
// permittedPaths in one run; the plan input schema carries no path field.
// =============================================================================

test('S38.2 — two posts with different dates/slugs plan two different permittedPaths; the caller supplies no path itself', async () => {
  const planDeclaration = WATCHED_POST_TOOL_DECLARATIONS.find((d) => d.name === 'watched_post_plan')!;
  assert.deepEqual(
    Object.keys((planDeclaration.inputSchema as { properties: Record<string, unknown> }).properties),
    ['sourceFile', 'content'],
    'the plan input schema has no path field at all',
  );

  const ctx = fixtureCallContext({ cloneRoot: null });

  const first = await WATCHED_POST_PLAN_HANDLER(ctx, {
    sourceFile: 'post-a.md' as never,
    content: postFile({ slug: 'first-post', date: '2026-08-24' }),
  });
  const second = await WATCHED_POST_PLAN_HANDLER(ctx, {
    sourceFile: 'post-b.md' as never,
    content: postFile({ slug: 'second-post', date: '2026-09-01' }),
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok || !first.data || !second.data) return;

  assert.deepEqual(first.data.permittedPaths, ['docs/blog/2026-08-24-first-post.md']);
  assert.deepEqual(second.data.permittedPaths, ['docs/blog/2026-09-01-second-post.md']);
  assert.notDeepEqual(first.data.permittedPaths, second.data.permittedPaths, 'the two posts route to two different paths');
  assert.equal((first.data.plan as WatchedPostPlan).path, 'docs/blog/2026-08-24-first-post.md');
  assert.equal((second.data.plan as WatchedPostPlan).path, 'docs/blog/2026-09-01-second-post.md');
});

// =============================================================================
// S38.5 (plan half) — a post whose front matter is missing a required field
// is refused by `validation`, never touching the filesystem or git.
// =============================================================================

test('S38.5 — a post missing a required front matter field is refused by validation, not thrown', async () => {
  const ctx = fixtureCallContext({ cloneRoot: null });
  const content = [
    '---',
    'title: "Missing Fields"',
    'slug: missing-fields',
    'date: 2026-08-24',
    'tags:',
    '  - ai-assisted-engineering',
    '---',
    '',
    'Body text.',
    '',
  ].join('\n');

  const result = await WATCHED_POST_PLAN_HANDLER(ctx, { sourceFile: 'bad-post.md' as never, content });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'validation');
  assert.match(result.summary, /description/);
});

// =============================================================================
// S38.6 — watched_post_apply, called directly (not through the watcher),
// refuses a path outside the declaration's writable path prefixes.
// =============================================================================

test('S38.6 — watched_post_apply refuses a plan path outside writablePathPrefixes, called directly', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's38-apply-'));
  try {
    const ctx = fixtureCallContext({
      cloneRoot: tmp as never,
      writablePathPrefixes: ['docs/blog/'] as unknown as readonly PathPrefix[],
    });

    const plan: WatchedPostPlan = { path: 'docs/src/pages/other.tsx', content: 'not a post' };
    const result = await WATCHED_POST_APPLY_HANDLER(ctx, { permittedPaths: [plan.path as never], plan });

    assert.equal(result.ok, false);
    assert.equal(result.kind, 'authorization');
    assert.equal(fs.existsSync(path.join(tmp, plan.path)), false, 'nothing was written');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('S38.6 — watched_post_apply refuses a malformed path with validation, called directly', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's38-apply-malformed-'));
  try {
    const ctx = fixtureCallContext({
      cloneRoot: tmp as never,
      writablePathPrefixes: ['docs/blog/'] as unknown as readonly PathPrefix[],
    });

    const plan: WatchedPostPlan = { path: '../escape.md', content: 'not a post' };
    const result = await WATCHED_POST_APPLY_HANDLER(ctx, { permittedPaths: [plan.path as never], plan });

    assert.equal(result.ok, false);
    assert.equal(result.kind, 'validation');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('watched_post_apply writes the file and reports changedPaths when the path is within a writable prefix', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's38-apply-ok-'));
  try {
    const ctx = fixtureCallContext({
      cloneRoot: tmp as never,
      writablePathPrefixes: ['docs/blog/'] as unknown as readonly PathPrefix[],
    });
    const content = postFile({ slug: 'writable-post', date: '2026-08-24' });
    const plan: WatchedPostPlan = { path: 'docs/blog/2026-08-24-writable-post.md', content };

    const result = await WATCHED_POST_APPLY_HANDLER(ctx, { permittedPaths: [plan.path as never], plan });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data?.changedPaths, [plan.path]);
    assert.equal(fs.readFileSync(path.join(tmp, plan.path), 'utf8'), content);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
