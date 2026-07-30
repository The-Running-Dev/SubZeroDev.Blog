import path from 'node:path';
import { run } from './run.js';
import type { Finding } from '../result.js';

const PWSH_TIMEOUT_MS = 120_000;

export interface PwshRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  findings: Finding[];
  command: string[];
}

// "docs/blog/foo.md:12:3 [Warning] Terminology: ..." -- the exact shape
// build/Test-Documentation.ps1 writes to stdout (see its Write-Host loop).
const FINDING_LINE = /^(?<path>.+?):(?<line>\d+):(?<column>\d+) \[(?<severity>\w+)\] (?<rule>\w+): (?<message>.*)$/;

export function parseFindings(stdout: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = FINDING_LINE.exec(line);
    if (!match?.groups) continue;
    const severity = match.groups.severity === 'Warning' ? 'warning' : 'error';
    findings.push({
      path: match.groups.path,
      line: Number(match.groups.line),
      column: Number(match.groups.column),
      severity,
      rule: match.groups.rule ?? 'Unknown',
      message: match.groups.message ?? ''
    });
  }
  return findings;
}

/**
 * Invoke a repo PowerShell script by argv array (never -Command with an
 * interpolated string). CWD is always the repo root, matching what both
 * scripts assume (Test-DocumentationArtifact.ps1 resolves its defaults
 * against process CWD; Test-Documentation.ps1's repo-root walk also finds
 * it from there).
 */
export async function runPwshScript(
  repoRoot: string,
  scriptRelativePath: string,
  params: Record<string, string | boolean> = {}
): Promise<PwshRunResult> {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  const args = ['-NoProfile', '-NoLogo', '-NonInteractive', '-File', scriptPath];
  for (const [key, value] of Object.entries(params)) {
    if (value === false) continue;
    args.push(`-${key}`);
    if (typeof value === 'string') args.push(value);
  }

  const result = await run('pwsh', args, { cwd: repoRoot, timeoutMs: PWSH_TIMEOUT_MS });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    findings: parseFindings(result.stdout),
    command: result.command
  };
}
