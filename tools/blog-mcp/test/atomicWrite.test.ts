import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InfrastructureError } from '../src/errors.js';
import { writeFilesAtomically } from '../src/domain/atomicWrite.js';

let scratchRoot: string | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  if (scratchRoot) fs.rmSync(scratchRoot, { recursive: true, force: true });
  scratchRoot = undefined;
});

describe('writeFilesAtomically failure handling', () => {
  it('wraps failure while capturing prior bytes as InfrastructureError', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-atomic-read-'));
    const target = path.join(scratchRoot, 'target.md');
    fs.writeFileSync(target, 'before');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('read denied');
    });

    expect(() => writeFilesAtomically([{ absolutePath: target, content: 'after' }])).toThrow(InfrastructureError);
  });

  it('restores renamed destinations and removes every remaining temp file after rename failure', () => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-atomic-rename-'));
    const first = path.join(scratchRoot, 'first.md');
    const second = path.join(scratchRoot, 'second.md');
    fs.writeFileSync(first, 'first-before');
    fs.writeFileSync(second, 'second-before');

    const realRename = fs.renameSync.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      renameCount += 1;
      if (renameCount === 2) throw new Error('rename denied');
      return realRename(oldPath, newPath);
    });

    expect(() =>
      writeFilesAtomically([
        { absolutePath: first, content: 'first-after' },
        { absolutePath: second, content: 'second-after' }
      ])
    ).toThrow(InfrastructureError);

    expect(fs.readFileSync(first, 'utf8')).toBe('first-before');
    expect(fs.readFileSync(second, 'utf8')).toBe('second-before');
    expect(fs.readdirSync(scratchRoot).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
