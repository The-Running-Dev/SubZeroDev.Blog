export type FindingSeverity = 'error' | 'warning';

export interface Finding {
  path?: string;
  line?: number;
  column?: number;
  severity: FindingSeverity;
  rule: string;
  message: string;
}

export interface Diagnostics {
  command?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export type ResultKind = 'success' | 'validation' | 'precondition' | 'infrastructure';

export interface ToolResult<T = unknown> {
  ok: boolean;
  kind: ResultKind;
  summary: string;
  data?: T;
  findings?: Finding[];
  diagnostics?: Diagnostics;
}

export function ok<T>(summary: string, data?: T, findings?: Finding[]): ToolResult<T> {
  return { ok: true, kind: 'success', summary, ...(data !== undefined ? { data } : {}), ...(findings ? { findings } : {}) };
}

export function validationFailure<T>(summary: string, findings: Finding[], data?: T): ToolResult<T> {
  return { ok: false, kind: 'validation', summary: `FAILED: ${summary}`, findings, ...(data !== undefined ? { data } : {}) };
}

export function precondition<T>(summary: string, data?: T): ToolResult<T> {
  return { ok: false, kind: 'precondition', summary: `FAILED: ${summary}`, ...(data !== undefined ? { data } : {}) };
}

export function infrastructureFailure<T>(summary: string, diagnostics?: Diagnostics): ToolResult<T> {
  return { ok: false, kind: 'infrastructure', summary: `FAILED: ${summary}`, ...(diagnostics ? { diagnostics } : {}) };
}

/** Highest-severity-first: any 'error' finding makes a result non-ok validation. */
export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}

/**
 * The return type here is intentionally loose (not the SDK's CallToolResult)
 * so this module has no compile-time dependency on the SDK; tools/context.ts
 * casts to CallToolResult at the one place that actually needs the SDK's
 * exact shape.
 */
export function toCallToolResult(result: ToolResult): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
} {
  const isError = result.kind === 'infrastructure';
  return {
    content: [{ type: 'text', text: renderText(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
    ...(isError ? { isError: true } : {})
  };
}

function renderText(result: ToolResult): string {
  const lines = [result.summary];
  if (result.data !== undefined) {
    try {
      lines.push(JSON.stringify(result.data, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`[data omitted: not JSON-serializable -- ${message}]`);
    }
  }
  if (result.findings && result.findings.length > 0) {
    for (const f of result.findings) {
      const loc = f.path ? `${f.path}${f.line ? `:${f.line}${f.column ? `:${f.column}` : ''}` : ''}` : '';
      lines.push(`  ${loc ? `${loc} ` : ''}[${f.severity}] ${f.rule}: ${f.message}`);
    }
  }
  if (result.diagnostics?.stderr) {
    lines.push('--- stderr ---', result.diagnostics.stderr);
  }
  return lines.join('\n');
}
