import { useEffect, useRef } from 'react';
import { prStatus } from './tool-api.ts';

// Matches DEFAULT_POLL_SECONDS in tools/blog-mcp/src/tools/monitor.ts.
const POLL_MS = 15_000;
// 30 minutes of polling, same bound the base's own checks_await caps at server-side -- an abandoned tab must not poll forever.
const MAX_POLLS = 120;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Ported from `tools/blog-mcp/ui/src/lib/usePrWatcher.ts`, pointed at the
 * base's own `pr_status` tool (`ToolCallError` on failure, not `ApiError`)
 * instead of blog-mcp's `/api/pr/:number`. `PullRequestState` is lowercase
 * here (`'open' | 'merged' | 'closed'`, `src/host/types.ts`), not the
 * legacy server's uppercase GitHub literals.
 */
export function usePrWatcher(declarationId: string, pr: number | null, onEvent: (text: string, isError?: boolean) => void, onMerged?: () => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;

  useEffect(() => {
    if (!pr) return;

    let cancelled = false;
    let polls = 0;
    let consecutiveFailures = 0;
    let lastState: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      polls++;
      try {
        const { status } = await prStatus(declarationId, pr as number);
        if (cancelled) return;
        consecutiveFailures = 0;
        if (status.state !== lastState) {
          if (status.state === 'merged') {
            onEventRef.current(`PR #${pr} merged.`);
            onMergedRef.current?.();
          } else if (status.state === 'closed') {
            onEventRef.current(`PR #${pr} closed without merging.`, true);
          } else {
            onEventRef.current(`PR #${pr}: ${status.state}`);
          }
          lastState = status.state;
        }
        if (status.state === 'merged' || status.state === 'closed') return;
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures === 1) {
          const message = err instanceof Error ? err.message : String(err);
          onEventRef.current(`Lost track of PR #${pr}'s status: ${message}`, true);
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          onEventRef.current(`Stopped watching PR #${pr} after ${MAX_CONSECUTIVE_FAILURES} failed checks.`, true);
          return;
        }
      }
      if (cancelled || polls >= MAX_POLLS) return;
      timer = setTimeout(() => void poll(), POLL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [declarationId, pr]);
}
