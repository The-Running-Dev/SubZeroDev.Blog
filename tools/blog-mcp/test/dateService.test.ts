import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { normalizeDate, resolveDateNormalizationOptions, type DateNormalizationOptions } from '../src/domain/dateService.js';

const UTC: DateNormalizationOptions = { order: 'MDY', defaultTimeZone: 'UTC' };
const NOW = new Date('2026-08-02T12:34:56Z');

describe('normalizeDate', () => {
  it('uses the passed now when input is undefined', () => {
    const result = normalizeDate(undefined, UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T12:34:56Z' });
  });

  it('uses the passed now when input is blank', () => {
    const result = normalizeDate('   ', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T12:34:56Z' });
  });

  it('normalizes a canonical ISO timestamp unchanged', () => {
    const result = normalizeDate('2026-08-02T10:00:00Z', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });

  it('strips milliseconds from an ISO timestamp', () => {
    const result = normalizeDate('2026-08-02T10:00:00.123Z', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });

  it('converts an ISO timestamp with a positive offset to UTC', () => {
    const result = normalizeDate('2026-08-02T10:00:00+05:00', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T05:00:00Z' });
  });

  it('converts an ISO timestamp with a negative offset (no colon) to UTC', () => {
    const result = normalizeDate('2026-08-02T10:00:00-0500', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T15:00:00Z' });
  });

  it('accepts a bare datetime-local value with no seconds', () => {
    const result = normalizeDate('2026-08-02T10:00', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });

  it('normalizes a date-only input to midnight UTC by default', () => {
    const result = normalizeDate('2026-08-02', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T00:00:00Z' });
  });

  it('normalizes a month-name date to midnight UTC by default', () => {
    const result = normalizeDate('August 2, 2026', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T00:00:00Z' });
  });

  it('normalizes a month-name date with a weekday prefix', () => {
    const result = normalizeDate('Sunday, August 2, 2026', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T00:00:00Z' });
  });

  it('normalizes an RFC 2822 timestamp with a numeric offset', () => {
    const result = normalizeDate('Sun, 02 Aug 2026 10:00:00 +0000', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });

  it('normalizes an RFC 2822 timestamp with a GMT zone token', () => {
    const result = normalizeDate('02 Aug 2026 10:00:00 GMT', UTC, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });

  it('resolves ambiguous numeric input according to the configured order (MDY)', () => {
    const result = normalizeDate('08/01/2026', { order: 'MDY', defaultTimeZone: 'UTC' }, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-01T00:00:00Z' });
  });

  it('resolves the identical digits differently under DMY', () => {
    const result = normalizeDate('08/01/2026', { order: 'DMY', defaultTimeZone: 'UTC' }, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-01-08T00:00:00Z' });
  });

  it('resolves numeric input under YMD', () => {
    const result = normalizeDate('2026/08/01', { order: 'YMD', defaultTimeZone: 'UTC' }, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-01T00:00:00Z' });
  });

  it('rejects an unparseable string, listing accepted formats and the configured order', () => {
    const result = normalizeDate('not a date at all', UTC, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('not a date at all');
    expect(result.reason).toContain('ISO 8601');
    expect(result.reason).toContain('BLOG_MCP_DATE_ORDER=MDY');
  });

  it('rejects a genuinely invalid calendar date instead of rolling it forward', () => {
    const result = normalizeDate('2026-02-30', UTC, NOW);
    expect(result.ok).toBe(false);
  });

  it('converts a timezone-free timestamp using a configured non-UTC default zone', () => {
    // 10:00 local in America/New_York in August (EDT, UTC-4) is 14:00 UTC.
    const options: DateNormalizationOptions = { order: 'MDY', defaultTimeZone: 'America/New_York' };
    const result = normalizeDate('2026-08-02T10:00:00', options, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T14:00:00Z' });
  });

  it('an offset-bearing input ignores the configured default zone entirely', () => {
    const options: DateNormalizationOptions = { order: 'MDY', defaultTimeZone: 'America/New_York' };
    const result = normalizeDate('2026-08-02T10:00:00Z', options, NOW);
    expect(result).toEqual({ ok: true, canonical: '2026-08-02T10:00:00Z' });
  });
});

describe('normalizeDate: independent of the host process timezone', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const cases: Array<[string, DateNormalizationOptions, string]> = [
    [undefined as unknown as string, UTC, '2026-08-02T12:34:56Z'],
    ['2026-08-02', UTC, '2026-08-02T00:00:00Z'],
    ['August 2, 2026', UTC, '2026-08-02T00:00:00Z'],
    ['2026-08-02T10:00:00', UTC, '2026-08-02T10:00:00Z'],
    ['08/01/2026', { order: 'MDY', defaultTimeZone: 'UTC' }, '2026-08-01T00:00:00Z']
  ];

  for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`produces identical canonical values under process.env.TZ='${tz}'`, () => {
      process.env.TZ = tz;
      for (const [input, options, expected] of cases) {
        const result = normalizeDate(input, options, NOW);
        expect(result).toEqual({ ok: true, canonical: expected });
      }
    });
  }
});

describe('resolveDateNormalizationOptions', () => {
  const originalOrder = process.env.BLOG_MCP_DATE_ORDER;
  const originalZone = process.env.BLOG_MCP_DEFAULT_TIME_ZONE;

  beforeEach(() => {
    delete process.env.BLOG_MCP_DATE_ORDER;
    delete process.env.BLOG_MCP_DEFAULT_TIME_ZONE;
  });

  afterEach(() => {
    if (originalOrder === undefined) delete process.env.BLOG_MCP_DATE_ORDER;
    else process.env.BLOG_MCP_DATE_ORDER = originalOrder;
    if (originalZone === undefined) delete process.env.BLOG_MCP_DEFAULT_TIME_ZONE;
    else process.env.BLOG_MCP_DEFAULT_TIME_ZONE = originalZone;
  });

  it('defaults to MDY and UTC when unset', () => {
    expect(resolveDateNormalizationOptions()).toEqual({ order: 'MDY', defaultTimeZone: 'UTC' });
  });

  it('reads BLOG_MCP_DATE_ORDER and BLOG_MCP_DEFAULT_TIME_ZONE when set', () => {
    process.env.BLOG_MCP_DATE_ORDER = 'DMY';
    process.env.BLOG_MCP_DEFAULT_TIME_ZONE = 'America/New_York';
    expect(resolveDateNormalizationOptions()).toEqual({ order: 'DMY', defaultTimeZone: 'America/New_York' });
  });

  it('falls back to MDY for an unrecognized order value', () => {
    process.env.BLOG_MCP_DATE_ORDER = 'not-a-real-order';
    expect(resolveDateNormalizationOptions().order).toBe('MDY');
  });
});
