import { test } from 'node:test';
import assert from 'node:assert/strict';

import { systemClock } from '../../../SubZeroDev.GitService/src/clock/clock.ts';
import { createStructuredStore } from '../../../SubZeroDev.GitService/src/store/structured-store.ts';
import { withVolumeAsync } from '../../../SubZeroDev.GitService/src/store/volume-fixture.ts';
import type { RemoteHost } from '../../../SubZeroDev.GitService/src/shared/brands.ts';
import type { DeploymentCeiling } from '../../../SubZeroDev.GitService/src/contract/capabilities.ts';
import type { SafeToEvictVerdict } from '../../../SubZeroDev.GitService/src/clone/types.ts';
import { createDeclarations, type CloneAdoptionCheck } from '../../../SubZeroDev.GitService/src/declarations/declarations.ts';
import type { DeclareInput } from '../../../SubZeroDev.GitService/src/declarations/types.ts';
import type { ToolDeclaration } from '../../../SubZeroDev.GitService/src/contract/tool-declaration.ts';
import type { JsonSchema } from '../../../SubZeroDev.GitService/src/contract/json.ts';

import { WATCHED_POST_TOOL_DECLARATIONS } from './watched-post.ts';

/**
 * S38.3 — model: `src/declarations/declarations.test.ts`'s own
 * "declaration creation states 1 valid pair persisted and 2 invalid pairs
 * rejected" / "a valid watcher survives restart and boot re-validation
 * rejects registry drift" tests (S23.2), same `declarationsFor` /
 * `declareInputFor` fixture shape, applied to this repo's real
 * `watched_post_plan`/`watched_post_apply` pair plus a deliberately
 * mutated second copy of the apply tool's declaration.
 */

const OPERATOR = { kind: 'operator' as const, subject: 'op' as never, clientId: null, grantId: null };
const GITHUB_ALLOWLIST = ['github.com'] as unknown as readonly RemoteHost[];

function ceilingOf(...capabilities: readonly string[]): DeploymentCeiling {
  return new Set(capabilities) as unknown as DeploymentCeiling;
}

async function withMigratedVolume<T>(fn: (volume: string) => Promise<T>): Promise<T> {
  return withVolumeAsync(async (volume) => {
    const store = createStructuredStore({ volumeRoot: volume, clock: systemClock });
    await store.open();
    await store.migrate();
    await store.close();
    return fn(volume);
  });
}

function declarationsFor(volume: string, registryEntries: readonly ToolDeclaration[]) {
  const adoptionCheck: CloneAdoptionCheck = {
    observedRemote: async () => ({ cloneExists: false }),
    isSafeToAdopt: async (): Promise<SafeToEvictVerdict> => ({ safe: true }),
  };
  return createDeclarations({
    volumeRoot: volume,
    clock: systemClock,
    remoteHostAllowlist: GITHUB_ALLOWLIST,
    ceiling: ceilingOf('repo.read', 'git.local.write', 'git.remote.write'),
    registryEntry: (name) => registryEntries.find((entry) => entry.name === name) ?? null,
    cloneAdoptionCheck: () => adoptionCheck,
  });
}

function declareInputFor(id: string, overrides: Partial<DeclareInput> = {}): DeclareInput {
  return {
    id: id as DeclareInput['id'],
    cloneUrl: `https://github.com/example/${id}.git` as DeclareInput['cloneUrl'],
    host: 'generic',
    credentialRef: 'unused' as DeclareInput['credentialRef'],
    capabilityGrant: ['repo.read'],
    writablePathPrefixes: [],
    pinned: false,
    fileWatcher: null,
    identity: { gitUserName: 'fixture', gitUserEmail: 'fixture@example.com' },
    ...overrides,
  };
}

const PLAN_TOOL = WATCHED_POST_TOOL_DECLARATIONS.find((d) => d.name === 'watched_post_plan')!;
const APPLY_TOOL = WATCHED_POST_TOOL_DECLARATIONS.find((d) => d.name === 'watched_post_apply')!;

/** A clone of the real apply tool's declaration with one property of `inputSchema.properties.plan` mutated -- simulates a deployed apply tool whose schema has drifted from the plan tool it is paired with. */
function mismatchedApplyTool(): ToolDeclaration {
  const inputSchema = APPLY_TOOL.inputSchema as unknown as { properties: { plan: { properties: Record<string, unknown> } } };
  return {
    ...APPLY_TOOL,
    inputSchema: {
      ...(APPLY_TOOL.inputSchema as object),
      properties: {
        ...inputSchema.properties,
        plan: {
          ...inputSchema.properties.plan,
          properties: { ...inputSchema.properties.plan.properties, extra: { type: 'string' } },
        },
      },
    } as unknown as JsonSchema,
  };
}

test('S38.3 — a valid watched_post_plan/watched_post_apply pair validates cleanly at declaration time', async () => {
  await withMigratedVolume(async (volume) => {
    const declarations = declarationsFor(volume, [PLAN_TOOL, APPLY_TOOL]);
    const declared = await declarations.declare(
      declareInputFor('blog', { fileWatcher: { planTool: PLAN_TOOL.name, applyTool: APPLY_TOOL.name, autoMerge: false } }),
      OPERATOR,
    );
    assert.equal(declared.ok, true, declared.ok ? '' : declared.error.summary);
    if (!declared.ok) return;
    assert.deepEqual(declared.value.fileWatcher, { planTool: PLAN_TOOL.name, applyTool: APPLY_TOOL.name, autoMerge: false });
  });
});

test('S38.3 — a deliberately mismatched plan/apply pair is refused at declaration time, code watcher-plan-schema-mismatch', async () => {
  await withMigratedVolume(async (volume) => {
    const mismatched = mismatchedApplyTool();
    const declarations = declarationsFor(volume, [PLAN_TOOL, mismatched]);
    const result = await declarations.declare(
      declareInputFor('blog-mismatch', { fileWatcher: { planTool: PLAN_TOOL.name, applyTool: mismatched.name, autoMerge: false } }),
      OPERATOR,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, 'watcher-plan-schema-mismatch');
    if (result.error.code === 'watcher-plan-schema-mismatch') {
      assert.equal(result.error.planTool, PLAN_TOOL.name);
      assert.equal(result.error.applyTool, mismatched.name);
    }
  });
});

test('S38.3 — boot re-validation (revalidateFileWatchers) also refuses a mismatched pair that somehow got stored, same code', async () => {
  await withMigratedVolume(async (volume) => {
    // Store the pair while the registry reports it valid (mirrors the real
    // world: the pair validated at declare-time, and later one side's
    // deployed schema drifted).
    const validAtDeclareTime = declarationsFor(volume, [PLAN_TOOL, APPLY_TOOL]);
    const declared = await validAtDeclareTime.declare(
      declareInputFor('blog-drift', { fileWatcher: { planTool: PLAN_TOOL.name, applyTool: APPLY_TOOL.name, autoMerge: false } }),
      OPERATOR,
    );
    assert.equal(declared.ok, true);

    // A fresh Declarations instance, as boot constructs one, now sees a
    // registry where the apply tool's schema has drifted.
    const mismatched = mismatchedApplyTool();
    const atBoot = declarationsFor(volume, [PLAN_TOOL, mismatched]);
    const revalidated = await atBoot.revalidateFileWatchers();
    assert.equal(revalidated.ok, false);
    if (revalidated.ok) return;
    assert.equal(revalidated.error.code, 'watcher-plan-schema-mismatch');
    if (revalidated.error.code === 'watcher-plan-schema-mismatch') {
      assert.equal(revalidated.error.planTool, PLAN_TOOL.name);
      assert.equal(revalidated.error.applyTool, APPLY_TOOL.name, "the stored declaration still names the tool's real name, unchanged");
    }
  });
});
