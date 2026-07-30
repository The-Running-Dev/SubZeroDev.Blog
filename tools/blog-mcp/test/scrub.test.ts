import { describe, expect, it } from 'vitest';
import { scrubSecrets } from '../src/exec/scrub.js';

describe('exec/scrub: scrubSecrets', () => {
  it('redacts a gh personal access token embedded in prose', () => {
    const text = `remote: Invalid token gho_${'a'.repeat(36)} rejected`;
    const scrubbed = scrubSecrets(text);
    expect(scrubbed).not.toContain('gho_');
    expect(scrubbed).toContain('[REDACTED]');
  });

  it('redacts a github_pat_ token', () => {
    const text = `Authorization: Bearer github_pat_${'B'.repeat(30)}`;
    const scrubbed = scrubSecrets(text);
    expect(scrubbed).not.toMatch(/github_pat_[A-Za-z0-9_]{20,}/);
  });

  it('redacts multiple occurrences', () => {
    const token = `ghp_${'c'.repeat(36)}`;
    const text = `${token} appears twice: ${token}`;
    const scrubbed = scrubSecrets(text);
    expect(scrubbed.match(/\[REDACTED\]/g)?.length).toBe(2);
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Documentation checks passed across 30 Markdown file(s).';
    expect(scrubSecrets(text)).toBe(text);
  });
});
