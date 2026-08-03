import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_REVISION,
  formatCapabilityProfile,
  formatServerVersion,
  runtimeInfo,
  validateBuildRevision
} from '../src/runtimeInfo.js';
import { READONLY_CAPABILITIES, type Capabilities } from '../src/tools/context.js';
import { UI_CAPABILITIES, CRON_CAPABILITIES, WATCHER_CAPABILITIES } from '../src/serve/capabilities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_VERSION = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
).version;

const FULL_SHA = 'd1c218f0c270a7b4d144feda5b4581ac554845e1';

describe('validateBuildRevision', () => {
  it('defaults an unset or empty value to the development sentinel', () => {
    expect(validateBuildRevision(undefined)).toBe(DEVELOPMENT_REVISION);
    expect(validateBuildRevision('')).toBe(DEVELOPMENT_REVISION);
  });

  it('accepts the literal development sentinel', () => {
    expect(validateBuildRevision('development')).toBe('development');
  });

  it('accepts a full 40-character lowercase hex commit SHA unchanged', () => {
    expect(validateBuildRevision(FULL_SHA)).toBe(FULL_SHA);
  });

  it('rejects a short SHA', () => {
    expect(() => validateBuildRevision(FULL_SHA.slice(0, 12))).toThrow(/40-character/);
  });

  it('rejects an uppercase SHA', () => {
    expect(() => validateBuildRevision(FULL_SHA.toUpperCase())).toThrow(/40-character/);
  });

  it('rejects a SHA-length string with non-hex characters', () => {
    expect(() => validateBuildRevision('z'.repeat(40))).toThrow(/40-character/);
  });

  it('rejects arbitrary garbage, including a near-miss on the sentinel', () => {
    expect(() => validateBuildRevision('Development')).toThrow(/40-character/);
    expect(() => validateBuildRevision('latest')).toThrow(/40-character/);
  });
});

describe('formatServerVersion', () => {
  it('appends the development sentinel unchanged', () => {
    expect(formatServerVersion('0.1.0', 'development')).toBe('0.1.0+development');
  });

  it('appends the first 12 characters of a full SHA', () => {
    expect(formatServerVersion('0.1.0', FULL_SHA)).toBe(`0.1.0+${FULL_SHA.slice(0, 12)}`);
  });
});

describe('formatCapabilityProfile', () => {
  it('formats an all-false profile as read-only', () => {
    const capabilities: Capabilities = { write: false, remote: false, monitor: false, scheduler: false, writablePathPrefixes: [] };
    expect(formatCapabilityProfile(capabilities)).toBe('read-only');
  });

  it('formats an all-true profile with every flag in fixed order', () => {
    const capabilities: Capabilities = { write: true, remote: true, monitor: true, scheduler: true, writablePathPrefixes: [] };
    expect(formatCapabilityProfile(capabilities)).toBe('write+remote+monitor+scheduler');
  });

  it('matches the documented READONLY_CAPABILITIES profile (a capped OAuth read grant)', () => {
    expect(formatCapabilityProfile(READONLY_CAPABILITIES)).toBe('monitor');
  });

  it('matches the documented serve-mode session profiles', () => {
    expect(formatCapabilityProfile(UI_CAPABILITIES)).toBe('write+remote+monitor');
    expect(formatCapabilityProfile(CRON_CAPABILITIES)).toBe('remote+monitor+scheduler');
    expect(formatCapabilityProfile(WATCHER_CAPABILITIES)).toBe('write+remote');
  });

  it('is stable field order regardless of which flags are set', () => {
    const capabilities: Capabilities = { write: false, remote: true, monitor: false, scheduler: true, writablePathPrefixes: [] };
    expect(formatCapabilityProfile(capabilities)).toBe('remote+scheduler');
  });
});

describe('runtimeInfo (process-wide singleton)', () => {
  it('falls back to the development sentinel when BLOG_MCP_BUILD_REVISION is unset, as in this test process', () => {
    expect(runtimeInfo.revision).toBe(DEVELOPMENT_REVISION);
    expect(runtimeInfo.catalogRevision).toBe(DEVELOPMENT_REVISION);
  });

  it('reads its version from package.json', () => {
    expect(runtimeInfo.version).toBe(PACKAGE_VERSION);
  });

  it('has a stable instanceId and startedAt across repeated reads within one process', () => {
    const { instanceId, startedAt } = runtimeInfo;
    // Re-reading the same exported singleton -- Node's ESM module cache
    // guarantees this is the same object, not a freshly computed one, which
    // is exactly the "one identity per container" contract issue #109 needs.
    expect(runtimeInfo.instanceId).toBe(instanceId);
    expect(runtimeInfo.startedAt).toBe(startedAt);
  });

  it('instanceId is a valid UUID and startedAt is a valid ISO instant', () => {
    expect(runtimeInfo.instanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(() => new Date(runtimeInfo.startedAt).toISOString()).not.toThrow();
  });
});
