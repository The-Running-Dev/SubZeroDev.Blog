import { run, type RunResult } from './run.js';
import { InfrastructureError } from '../errors.js';

const GH_TIMEOUT_MS = 60_000;

export interface GhOptions {
  repoRoot: string;
  timeoutMs?: number;
}

/**
 * Resolves the `gh` invocation as {command, prefixArgs} rather than a bare
 * 'gh' string. Tests point BLOG_MCP_GH_COMMAND at a JSON array like
 * `["node","/path/to/gh-shim.mjs"]` -- resolving by PATH lookup of a literal
 * "gh" name is unreliable on Windows (a .cmd/.bat shim cannot be spawned
 * under shell:false at all; Node rejects it outright), so tests never rely
 * on PATH-based executable resolution in the first place.
 */
function ghCommand(): { command: string; prefixArgs: string[] } {
  const override = process.env.BLOG_MCP_GH_COMMAND;
  if (override) {
    const parts = JSON.parse(override) as string[];
    const [command, ...prefixArgs] = parts;
    if (!command) throw new Error('BLOG_MCP_GH_COMMAND must be a non-empty JSON array.');
    return { command, prefixArgs };
  }
  return { command: 'gh', prefixArgs: [] };
}

/** Runs `gh` with an explicit argv array (never a shell string) and returns the raw result. */
export async function gh(args: string[], options: GhOptions): Promise<RunResult> {
  const { command, prefixArgs } = ghCommand();
  return run(command, [...prefixArgs, ...args], {
    cwd: options.repoRoot,
    timeoutMs: options.timeoutMs ?? GH_TIMEOUT_MS
  });
}

export async function ghOrThrow(args: string[], options: GhOptions): Promise<RunResult> {
  const result = await gh(args, options);
  if (result.exitCode !== 0) {
    throw new InfrastructureError(`gh ${args.join(' ')} failed (exit ${result.exitCode})`, {
      command: ['gh', ...args],
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    });
  }
  return result;
}

/** Runs `gh ... --json <fields>` (or any gh subcommand producing a single JSON document on stdout) and parses it. */
export async function ghJson<T>(args: string[], options: GhOptions): Promise<T> {
  const result = await ghOrThrow(args, options);
  try {
    return JSON.parse(result.stdout) as T;
  } catch (err) {
    throw new InfrastructureError(`gh ${args.join(' ')} did not return parseable JSON: ${err instanceof Error ? err.message : String(err)}`, {
      command: ['gh', ...args],
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    });
  }
}

interface GraphQlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Runs a GitHub GraphQL query via `gh api graphql`. `fields` become `-F
 * key=value` arguments (typed, so a numeric PR number is not silently
 * stringified in a way GraphQL's Int type rejects).
 *
 * `gh api graphql` prints the raw HTTP response body -- always wrapped in a
 * top-level `data` key (confirmed against the real API, not assumed: `gh api
 * graphql -f query='query { viewer { login } }'` returns
 * `{"data":{"viewer":{"login":"..."}}}`, never the bare query shape).
 * Unwrapped here so every caller works with the actual query result
 * directly, and a top-level `errors` array (a GraphQL query can fail with
 * HTTP 200 and `data: null`) is surfaced as a thrown error instead of a
 * silent `Cannot read properties of undefined` deeper in the caller.
 */
export async function ghGraphQl<T>(query: string, fields: Record<string, string | number>, options: GhOptions): Promise<T> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(fields)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
  }
  const envelope = await ghJson<GraphQlEnvelope<T>>(args, options);
  if (envelope.errors && envelope.errors.length > 0) {
    throw new InfrastructureError(`gh api graphql returned error(s): ${envelope.errors.map((e) => e.message).join('; ')}`, {
      command: ['gh', ...args]
    });
  }
  if (envelope.data === undefined) {
    throw new InfrastructureError('gh api graphql returned no data.', { command: ['gh', ...args] });
  }
  return envelope.data;
}
