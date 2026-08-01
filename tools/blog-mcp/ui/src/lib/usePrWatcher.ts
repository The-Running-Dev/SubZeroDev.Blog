import { useEffect, useRef } from 'react';
import { api } from './api';

interface PrStatus {
  state: string;
  mergeStateStatus?: string;
}

// Matches DEFAULT_POLL_SECONDS in src/tools/monitor.ts.
const POLL_MS = 15_000;
// 30 minutes of polling, same bound blog_wait_for_checks/blog_wait_for_merge
// use server-side -- an abandoned tab must not poll forever.
const MAX_POLLS = 120;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Polls a PR's status every POLL_MS and calls `onEvent` only when `state` or
 * `mergeStateStatus` changed since the last poll -- a quiet PR produces
 * exactly one toast, on the first poll, not one every interval. Stops once
 * `state` reaches MERGED or CLOSED, after MAX_POLLS, or after
 * MAX_CONSECUTIVE_FAILURES fetch failures in a row (one error toast, not
 * one per failed poll). Per-hook-instance only -- unmounting (navigating
 * away) stops polling; there is no cross-page shared watch state.
 */
export function usePrWatcher(pr: number | null, onEvent: (text: string, isError?: boolean) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!pr) return;

    let cancelled = false;
    let polls = 0;
    let consecutiveFailures = 0;
    let last: { state: string; mergeStateStatus?: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      polls++;
      try {
        const res = await api<PrStatus>(`/api/pr/${pr}`);
        if (cancelled) return;
        consecutiveFailures = 0;
        const status = res.data;
        if (status && (!last || last.state !== status.state || last.mergeStateStatus !== status.mergeStateStatus)) {
          if (status.state === 'MERGED') {
            onEventRef.current(`PR #${pr} merged.`);
          } else if (status.state === 'CLOSED') {
            onEventRef.current(`PR #${pr} closed without merging.`, true);
          } else {
            onEventRef.current(`PR #${pr}: ${status.state}${status.mergeStateStatus ? ` (${status.mergeStateStatus})` : ''}`);
          }
          last = { state: status.state, mergeStateStatus: status.mergeStateStatus };
        }
        if (status?.state === 'MERGED' || status?.state === 'CLOSED') return;
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
  }, [pr]);
}
