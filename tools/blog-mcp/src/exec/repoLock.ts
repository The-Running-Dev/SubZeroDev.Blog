/**
 * In-process mutex serializing repo-mutating tool calls. `serve` mode
 * (Phase 4+) has multiple actors -- an external MCP client, the UI, and the
 * scheduler tick -- sharing one working tree and one HEAD; without this,
 * two concurrent `blog_create_branch` calls switch HEAD out from under each
 * other, and concurrent `git add` hits `index.lock`. A simple promise-chain
 * queue is sufficient: Node is single-threaded, so this only needs to
 * serialize *await points*, not real concurrent execution.
 */
let queue: Promise<void> = Promise.resolve();

export function withRepoLock<T>(fn: () => Promise<T>): Promise<T> {
  // `queue` always resolves (see below), so it is safe to chain with a
  // single onFulfilled handler.
  const run = queue.then(fn);
  // Derive the next queue tail so it always resolves regardless of fn's
  // outcome -- one failed call must never wedge the queue for everyone
  // waiting behind it.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
