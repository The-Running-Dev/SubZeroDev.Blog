// A GitHub token that leaks into a captured stdout/stderr blob (a verbose
// git error, a gh debug line) would otherwise flow straight into a tool
// result and an audit log. Applied centrally in exec/run.ts's capture(), so
// every subprocess -- git, gh, pwsh -- is covered by construction rather
// than by remembering to scrub at each call site.
const TOKEN_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g
];

export function scrubSecrets(text: string): string {
  let scrubbed = text;
  for (const pattern of TOKEN_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}
