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

/**
 * The cron scheduler's own registration profile. The tick engine
 * (src/scheduler/engine.ts) only ever calls blog_pr_status and
 * blog_arm_auto_merge -- both Tier C, gated by `remote` alone (server.ts
 * registers Tier C independent of `write`) -- so `write` stays false here:
 * no blog_create_post, no blog_stage, and, per the milestone's per-consumer
 * profile table, no blog_add_tag. `writablePathPrefixes` is narrowed anyway
 * for defense in depth against a future scheduler feature that does write,
 * dropping the highest-risk prefixes an unattended actor should never touch
 * even accidentally.
 */
export const CRON_CAPABILITIES: Capabilities = {
  write: false,
  remote: true,
  monitor: true,
  scheduler: true,
  writablePathPrefixes: DEFAULT_ALLOWED_PREFIXES.filter(
    (prefix) => !['.github/workflows/', '.config/', 'tools/', 'build/'].includes(prefix)
  )
};

/**
 * The directory watcher's own registration profile (src/watcher/engine.ts).
 * Unlike the scheduler, the watcher genuinely needs write -- it calls
 * blog_create_post/blog_update_post/blog_stage/blog_commit as part of
 * publishing a dropped file, on top of the same blog_create_branch/
 * blog_push/blog_create_pr/blog_arm_auto_merge sequence the scheduler's
 * sibling tools already exercise. `writablePathPrefixes` gets the same
 * defense-in-depth narrowing as CRON_CAPABILITIES: an unattended actor
 * should never be able to touch workflows/config/build tooling, even by
 * accident, regardless of what it's actually asked to do today.
 * `monitor`/`scheduler` are both false -- the watcher never calls a Tier D
 * monitoring tool or a blog_schedule_* tool.
 */
export const WATCHER_CAPABILITIES: Capabilities = {
  write: true,
  remote: true,
  monitor: false,
  scheduler: false,
  writablePathPrefixes: DEFAULT_ALLOWED_PREFIXES.filter(
    (prefix) => !['.github/workflows/', '.config/', 'tools/', 'build/'].includes(prefix)
  )
};
