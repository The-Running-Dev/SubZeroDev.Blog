import { describe, expect, it } from 'vitest';
import { withRepoLock } from '../src/exec/repoLock.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withRepoLock', () => {
  it('serializes overlapping calls -- the second never starts until the first finishes', async () => {
    const events: string[] = [];

    const first = withRepoLock(async () => {
      events.push('first:start');
      await delay(30);
      events.push('first:end');
      return 'first';
    });

    // Started while `first` is still in its delay -- proves queuing, not
    // just "happens to run after" due to call order alone.
    const second = withRepoLock(async () => {
      events.push('second:start');
      await delay(5);
      events.push('second:end');
      return 'second';
    });

    const results = await Promise.all([first, second]);
    expect(results).toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('a rejected call does not wedge the queue for calls behind it', async () => {
    const events: string[] = [];

    const failing = withRepoLock(async () => {
      events.push('failing');
      throw new Error('boom');
    });

    const after = withRepoLock(async () => {
      events.push('after');
      return 'after';
    });

    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('after');
    expect(events).toEqual(['failing', 'after']);
  });

  it('returns each call\'s own result, not some other call\'s', async () => {
    const results = await Promise.all([1, 2, 3].map((n) => withRepoLock(async () => n * 10)));
    expect(results).toEqual([10, 20, 30]);
  });
});
