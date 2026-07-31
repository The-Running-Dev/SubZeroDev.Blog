import { DEFAULT_ALLOWED_PREFIXES } from '../domain/paths.js';
import type { Capabilities } from '../tools/context.js';

/**
 * The `serve` mode UI session's registration profile (see MILESTONES.md
 * Milestone 8's per-consumer profile table): full write + remote + monitor,
 * same allowlist as the default. Write tools are registered starting this
 * phase even though the read-only-first rollout (Phase 4) only wires GET
 * routes against them -- Phase 5 adds write routes without touching
 * capabilities again. The cron scheduler (a later phase) gets its own,
 * narrower Capabilities object instead of this one.
 */
export const UI_CAPABILITIES: Capabilities = {
  write: true,
  remote: true,
  monitor: true,
  scheduler: false,
  writablePathPrefixes: DEFAULT_ALLOWED_PREFIXES
};
