import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPendingMerges, savePendingMerges } from '../src/watcher/pendingMerges.js';

let stateDir: string | undefined;

afterEach(() => {
  if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
  stateDir = undefined;
});

describe('pending merge persistence', () => {
  it('drops malformed entries while preserving valid pending merges', () => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-pending-merges-'));
    fs.writeFileSync(
      path.join(stateDir, 'pending-merges.json'),
      JSON.stringify({
        pending: [
          { pr: 42, headSha: 'a'.repeat(40), slug: 'valid-post' },
          { pr: '42', headSha: 'b'.repeat(40), slug: 'wrong-pr-type' },
          { pr: 43, headSha: '', slug: 'empty-sha' },
          null
        ]
      })
    );

    expect(loadPendingMerges(stateDir).pending).toEqual([{ pr: 42, headSha: 'a'.repeat(40), slug: 'valid-post' }]);
  });

  it('round-trips a valid pending merge file', () => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-pending-merges-roundtrip-'));
    const file = { pending: [{ pr: 42, headSha: 'a'.repeat(40), slug: 'valid-post' }] };
    savePendingMerges(stateDir, file);
    expect(loadPendingMerges(stateDir)).toEqual(file);
  });
});
