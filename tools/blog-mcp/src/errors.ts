/** Thrown by domain/exec code for conditions that should surface as a `precondition` result. */
export class PreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreconditionError';
  }
}

/** Thrown by exec code for conditions that should surface as an `infrastructure` result. */
export class InfrastructureError extends Error {
  readonly command?: string[] | undefined;
  readonly exitCode?: number | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;

  constructor(
    message: string,
    opts?: { command?: string[]; exitCode?: number; stdout?: string; stderr?: string }
  ) {
    super(message);
    this.name = 'InfrastructureError';
    this.command = opts?.command;
    this.exitCode = opts?.exitCode;
    this.stdout = opts?.stdout;
    this.stderr = opts?.stderr;
  }
}
