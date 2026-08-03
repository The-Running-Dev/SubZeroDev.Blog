import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it, afterEach } from 'vitest';
import { createFakeDeploymentServer, defaultFakeDeploymentState, type FakeDeploymentState } from './helpers/fakeDeploymentServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'build', 'Confirm-BlogMcpDeployment.ps1');
const execFileAsync = promisify(execFile);

const REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);

interface VerifierResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runVerifier(
  baseUrl: string,
  expectedRevision: string,
  token: string,
  extraArgs: string[] = []
): Promise<VerifierResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'pwsh',
      [
        '-NoProfile',
        '-File',
        SCRIPT_PATH,
        '-BaseUri',
        baseUrl,
        '-ExpectedRevision',
        expectedRevision,
        '-TimeoutSeconds',
        '4',
        '-PollIntervalSeconds',
        '1',
        '-StabilitySampleCount',
        '2',
        ...extraArgs
      ],
      {
        env: { ...process.env, BLOG_MCP_DEPLOY_VERIFY_TOKEN: token },
        timeout: 30_000
      }
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const failure = err as { code?: number; stdout?: string; stderr?: string; message: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message };
  }
}

let server: Server | undefined;

async function startFakeServer(state: FakeDeploymentState): Promise<string> {
  server = createFakeDeploymentServer(state);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server!.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe('Confirm-BlogMcpDeployment.ps1', () => {
  it('classifies a fully current, well-formed deployment as verified, and deletes its MCP session', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=verified');
    expect(result.code).toBe(0);
    expect(state.deleteReceived).toBe(true);
  }, 20_000);

  it('succeeds identically whether /mcp frames responses as plain JSON or as SSE', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION, useSse: true });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=verified');
    expect(result.code).toBe(0);
  }, 20_000);

  it('follows tools/list pagination and still finds every required tool', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION, paginate: true });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=verified');
    expect(result.stdout).toMatch(/tools\/list returned 4 tool\(s\)/);
  }, 20_000);

  it('recovers once a stale revision transitions to the expected one mid-poll', async () => {
    const state = defaultFakeDeploymentState({ revision: OTHER_REVISION });
    const baseUrl = await startFakeServer(state);
    setTimeout(() => {
      state.revision = REVISION;
    }, 1500);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=verified');
    expect(result.code).toBe(0);
  }, 20_000);

  it('classifies a permanently stale revision as stale-runtime and times out', async () => {
    const state = defaultFakeDeploymentState({ revision: OTHER_REVISION });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=stale-runtime');
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('classifies an instance/revision that never stabilizes as mixed-runtime', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION });
    const baseUrl = await startFakeServer(state);
    // Flip instanceId (a "new parallel instance" signal) on every poll so
    // consecutiveMatch can never reach the stability threshold.
    const interval = setInterval(() => {
      state.instanceId = `instance-${Math.random().toString(36).slice(2)}`;
    }, 900);

    const result = await runVerifier(baseUrl, REVISION, state.token);
    clearInterval(interval);

    expect(result.stdout).toContain('CLASSIFICATION=mixed-runtime');
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('treats a schema-tagged but malformed health response as not-yet-ready rather than crashing', async () => {
    const state = defaultFakeDeploymentState({ healthBodyOverride: { schema: 'blog-mcp-health/v1', ok: true } });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    // Must fail closed (never crash into a stack trace / unhandled classification), not succeed.
    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/CLASSIFICATION=(stale-runtime|unreachable)/);
    expect(result.stdout).not.toMatch(/PropertyNotFoundException|cannot be found on this object/);
  }, 20_000);

  it('classifies a 401 on MCP initialize as verification-credential', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, 'wrong-token');

    expect(result.stdout).toContain('CLASSIFICATION=verification-credential');
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('classifies a missing required tool as unexpected-profile-or-catalog', async () => {
    const state = defaultFakeDeploymentState({
      revision: REVISION,
      toolNames: ['blog_repo_status', 'blog_prepare_publish_branch', 'blog_create_post'] // blog_restore_paths missing
    });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=unexpected-profile-or-catalog');
    expect(result.stdout + result.stderr).toMatch(/blog_restore_paths/);
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('classifies a write:false profile on the primary token as unexpected-profile-or-catalog', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION, repoStatusWrite: false });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=unexpected-profile-or-catalog');
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('classifies a revision mismatch between /healthz and blog_repo_status as unexpected-profile-or-catalog', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION, repoStatusRevision: OTHER_REVISION });
    const baseUrl = await startFakeServer(state);

    const result = await runVerifier(baseUrl, REVISION, state.token);

    expect(result.stdout).toContain('CLASSIFICATION=unexpected-profile-or-catalog');
    expect(result.stdout + result.stderr).toMatch(/runtime identity mismatch/);
    expect(result.code).not.toBe(0);
  }, 20_000);

  it('never echoes the bearer token in stdout or stderr, on either a successful or failing run', async () => {
    const secretToken = 'super-secret-deploy-token-should-never-leak';
    const state = defaultFakeDeploymentState({ revision: REVISION, token: secretToken });
    const baseUrl = await startFakeServer(state);

    const okResult = await runVerifier(baseUrl, REVISION, secretToken);
    expect(okResult.stdout).not.toContain(secretToken);
    expect(okResult.stderr).not.toContain(secretToken);

    const failResult = await runVerifier(baseUrl, REVISION, 'a-completely-different-wrong-token');
    expect(failResult.stdout).not.toContain(secretToken);
    expect(failResult.stderr).not.toContain(secretToken);
  }, 20_000);

  it('fails closed with a non-zero exit and no network call when BLOG_MCP_DEPLOY_VERIFY_TOKEN is unset', async () => {
    const state = defaultFakeDeploymentState({ revision: REVISION });
    const baseUrl = await startFakeServer(state);

    const env = { ...process.env };
    delete env.BLOG_MCP_DEPLOY_VERIFY_TOKEN;
    try {
      await execFileAsync(
        'pwsh',
        ['-NoProfile', '-File', SCRIPT_PATH, '-BaseUri', baseUrl, '-ExpectedRevision', REVISION],
        { env, timeout: 15_000 }
      );
      expect.unreachable('expected the verifier to throw when the token env var is unset');
    } catch (err) {
      const failure = err as { code?: number; stderr?: string };
      expect(failure.code).not.toBe(0);
      expect(failure.stderr ?? '').toMatch(/BLOG_MCP_DEPLOY_VERIFY_TOKEN is not set/);
    }
  }, 20_000);
});
