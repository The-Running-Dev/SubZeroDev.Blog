import { spawn } from 'node:child_process';
import { InfrastructureError } from '../errors.js';
import { scrubSecrets } from './scrub.js';

const MAX_CAPTURE_BYTES = 256 * 1024;
const TRUNCATION_MARKER = '\n… [truncated]';

/** Env vars forced on every child process so nothing can block waiting on a TTY. */
const SAFE_CHILD_ENV = {
  NO_COLOR: '1',
  TERM: 'dumb',
  GIT_PAGER: 'cat',
  GH_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  GH_PROMPT_DISABLED: '1'
} as const;

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}

export interface RunResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function capture(chunks: Buffer[], maxBytes: number): { text: string; truncated: boolean } {
  let total = 0;
  const kept: Buffer[] = [];
  for (const chunk of chunks) {
    if (total >= maxBytes) break;
    const remaining = maxBytes - total;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    kept.push(slice);
    total += slice.length;
  }
  const truncated = total < chunks.reduce((sum, c) => sum + c.length, 0);
  const text = scrubSecrets(Buffer.concat(kept).toString('utf8'));
  return { text: truncated ? text + TRUNCATION_MARKER : text, truncated };
}

/**
 * Spawn a child process with no shell, captured (never inherited) stdio, and
 * a bounded wall-clock timeout. Never rejects on a non-zero exit code -- that
 * is a normal outcome for validation-style commands (git diff --check, the
 * doc gate). Only spawn failure, timeout, or an unparseable process state
 * throws InfrastructureError.
 */
export function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const fullCommand = [command, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...SAFE_CHILD_ENV, ...options.env }
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new InfrastructureError(`Failed to start '${command}': ${err.message}`, {
          command: fullCommand
        })
      );
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const { text: stdout } = capture(stdoutChunks, MAX_CAPTURE_BYTES);
      const { text: stderr } = capture(stderrChunks, MAX_CAPTURE_BYTES);

      if (timedOut) {
        reject(
          new InfrastructureError(`'${fullCommand.join(' ')}' timed out after ${timeoutMs}ms`, {
            command: fullCommand,
            stdout,
            stderr
          })
        );
        return;
      }

      if (code === null) {
        reject(
          new InfrastructureError(`'${fullCommand.join(' ')}' terminated by signal ${signal ?? 'unknown'}`, {
            command: fullCommand,
            stdout,
            stderr
          })
        );
        return;
      }

      resolve({ command: fullCommand, exitCode: code, stdout, stderr, timedOut: false });
    });
  });
}
