import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Capabilities } from './tools/context.js';

/**
 * One immutable identity for this process's build/instance, attached to
 * every ToolContext and reported by both `GET /healthz` and
 * `blog_repo_status` so a client can tell "this server is the exact commit
 * that was merged/redeployed" from "this server is current but my cached
 * tool catalog is stale" (issue #109). `catalogRevision` equals `revision`
 * today because every tool registration compiles into the one image build;
 * they're kept as separate fields so a future build that can vary its
 * registered catalog independently of source revision doesn't need a schema
 * change.
 */
export interface RuntimeInfo {
  version: string;
  revision: string;
  catalogRevision: string;
  startedAt: string;
  instanceId: string;
}

/** Sentinel used for every non-image execution (local dev, `npm test`, stdio). Never a valid production revision. */
export const DEVELOPMENT_REVISION = 'development';

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Pure and independently testable: accepts the raw env value (or undefined)
 * rather than reading `process.env` itself, so tests can exercise every
 * accepted/rejected shape without touching global state. An unset/empty
 * value defaults to `development` -- this is the normal case for every
 * non-image execution; the Dockerfile only sets a real value.
 */
export function validateBuildRevision(raw: string | undefined): string {
  if (raw === undefined || raw === '') return DEVELOPMENT_REVISION;
  if (raw === DEVELOPMENT_REVISION || FULL_SHA_PATTERN.test(raw)) return raw;
  throw new Error(
    `BLOG_MCP_BUILD_REVISION='${raw}' is not valid -- it must be the literal ` +
      `'${DEVELOPMENT_REVISION}' or a full 40-character lowercase hex commit SHA.`
  );
}

function readPackageVersion(): string {
  // Resolved at runtime against the compiled module's own location (dist/runtimeInfo.js), not a
  // TypeScript-time import: package.json sits one directory above dist/ both in this repository
  // and in the runtime image (Dockerfile COPYs it to /app/package.json, sibling to /app/dist), so
  // '../package.json' resolves correctly in both places without adding package.json to rootDir.
  const url = new URL('../package.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version === '') {
    throw new Error(`package.json at '${url}' has no non-empty string "version" field.`);
  }
  return parsed.version;
}

function createRuntimeInfo(): RuntimeInfo {
  const revision = validateBuildRevision(process.env.BLOG_MCP_BUILD_REVISION);
  return {
    version: readPackageVersion(),
    revision,
    catalogRevision: revision,
    startedAt: new Date().toISOString(),
    instanceId: randomUUID()
  };
}

/**
 * Computed once at module load and shared by every per-session McpServer/
 * ToolContext this process creates. A container replacement is what changes
 * this identity, never a new session within the same process -- see
 * src/server.ts, which attaches this same object to every ToolContext it
 * builds rather than constructing a fresh one per call.
 */
export const runtimeInfo: RuntimeInfo = createRuntimeInfo();

/** Pure. `serverInfo.version` for the MCP initialize response and human-facing diagnostics. */
export function formatServerVersion(version: string, revision: string): string {
  if (revision === DEVELOPMENT_REVISION) return `${version}+${DEVELOPMENT_REVISION}`;
  return `${version}+${revision.slice(0, 12)}`;
}

const PROFILE_FLAG: ReadonlyArray<readonly [keyof Pick<Capabilities, 'write' | 'remote' | 'monitor' | 'scheduler'>, string]> = [
  ['write', 'write'],
  ['remote', 'remote'],
  ['monitor', 'monitor'],
  ['scheduler', 'scheduler']
];

/**
 * Pure. A stable, human-readable key for the session's effective
 * registration profile -- e.g. `write+remote+monitor` for the UI session,
 * `remote+monitor+scheduler` for cron, `read-only` for a capped OAuth read
 * grant. Field order is fixed so the same profile always formats identically.
 */
export function formatCapabilityProfile(capabilities: Capabilities): string {
  const active = PROFILE_FLAG.filter(([key]) => capabilities[key]).map(([, label]) => label);
  return active.length > 0 ? active.join('+') : 'read-only';
}
