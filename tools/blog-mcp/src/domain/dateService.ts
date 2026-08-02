export type DateOrder = 'MDY' | 'DMY' | 'YMD';

export interface DateNormalizationOptions {
  order: DateOrder;
  defaultTimeZone: string;
}

/**
 * BLOG_MCP_DATE_ORDER / BLOG_MCP_DEFAULT_TIME_ZONE, read fresh on every call
 * -- the same env-derived-on-every-use pattern as isReadOnly()/
 * isRemoteEnabled() (tools/context.ts), not a repo-committed BlogConfig
 * field, since these are capability-flag-shaped operator settings, not
 * authoring content.
 */
export function resolveDateNormalizationOptions(): DateNormalizationOptions {
  const raw = process.env.BLOG_MCP_DATE_ORDER;
  const order: DateOrder = raw === 'DMY' || raw === 'YMD' ? raw : 'MDY';
  return { order, defaultTimeZone: process.env.BLOG_MCP_DEFAULT_TIME_ZONE ?? 'UTC' };
}

export type NormalizeDateResult = { ok: true; canonical: string } | { ok: false; reason: string };

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function toCanonical(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Date.UTC silently rolls an out-of-range component into the next unit
 * (month 13 -> next January, day 32 -> next month) instead of rejecting it.
 * Round-tripping through the UTC getters catches that -- a genuinely invalid
 * calendar date (Feb 30) fails normalization instead of silently becoming a
 * different, unrequested date.
 */
function isValidComponents(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour &&
    check.getUTCMinutes() === minute &&
    check.getUTCSeconds() === second
  );
}

/**
 * Interprets a wall-clock date/time as occurring in `timeZone` and returns
 * the equivalent UTC instant, using Intl.DateTimeFormat's own IANA timezone
 * data -- Node's ICU already carries this, so no dependency is needed.
 * Exact for 'UTC'. For any other zone: format an initial UTC guess back
 * through that zone, diff against the guess to get the zone's offset at
 * roughly that instant, and apply it once -- accurate to the minute,
 * including across DST transitions, which is all a publish date needs.
 * Throws (via the Intl.DateTimeFormat constructor) for an unrecognized zone
 * name; callers let that surface as a precondition, same as an unparseable
 * date.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  if (timeZone === 'UTC') return new Date(guess);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = asUtc - guess;
  return new Date(guess - offsetMs);
}

/** 'Z' -> 0; '+05:00'/'+0500'/'-05:00'/'-0500' -> signed minutes. */
function parseOffsetMinutes(raw: string): number {
  if (raw === 'Z') return 0;
  const sign = raw[0] === '-' ? -1 : 1;
  const digits = raw.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  return sign * (hours * 60 + minutes);
}

// Seconds and fractional seconds are optional -- this is also what makes
// this family accept <input type="datetime-local">'s native value
// (2026-08-02T10:00) with no special-casing on the Compose side.
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})?$/;

function tryIso(input: string, options: DateNormalizationOptions): Date | undefined {
  const match = ISO_PATTERN.exec(input);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, se, offset] = match as unknown as [string, string, string, string, string, string, string | undefined, string | undefined];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = se ? Number(se) : 0;
  if (!isValidComponents(year, month, day, hour, minute, second)) return undefined;

  if (offset) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - parseOffsetMinutes(offset) * 60000);
  }
  return zonedTimeToUtc(year, month, day, hour, minute, second, options.defaultTimeZone);
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date-only and month-name dates both lack a time-of-day, so both resolve to midnight in the configured default timezone (UTC by default). */
function tryDateOnly(input: string, options: DateNormalizationOptions): Date | undefined {
  const match = DATE_ONLY_PATTERN.exec(input);
  if (!match) return undefined;
  const [, y, mo, d] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!isValidComponents(year, month, day, 0, 0, 0)) return undefined;
  return zonedTimeToUtc(year, month, day, 0, 0, 0, options.defaultTimeZone);
}

const MONTH_NAME_PATTERN = /^(?:[A-Za-z]+day,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;

function tryMonthName(input: string, options: DateNormalizationOptions): Date | undefined {
  const match = MONTH_NAME_PATTERN.exec(input);
  if (!match) return undefined;
  const [, monthName, d, y] = match;
  const month = MONTH_NAMES[(monthName as string).toLowerCase()];
  if (!month) return undefined;
  const day = Number(d);
  const year = Number(y);
  if (!isValidComponents(year, month, day, 0, 0, 0)) return undefined;
  return zonedTimeToUtc(year, month, day, 0, 0, 0, options.defaultTimeZone);
}

// Military zone letters and named US zones (EST, PST, ...) are deliberately
// unsupported -- the same "never guess differently across machines"
// reasoning sec6.3 states explicitly for ambiguous numeric dates.
const RFC2822_PATTERN = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|UT|GMT|UTC|Z)$/;

function tryRfc2822(input: string): Date | undefined {
  const match = RFC2822_PATTERN.exec(input);
  if (!match) return undefined;
  const [, d, monthAbbr, y, h, mi, se, zone] = match as unknown as [string, string, string, string, string, string, string | undefined, string];
  const month = MONTH_NAMES[(monthAbbr as string).toLowerCase()];
  if (!month) return undefined;
  const day = Number(d);
  const year = Number(y);
  const hour = Number(h);
  const minute = Number(mi);
  const second = se ? Number(se) : 0;
  if (!isValidComponents(year, month, day, hour, minute, second)) return undefined;

  const offsetMinutes = zone === 'UT' || zone === 'GMT' || zone === 'UTC' || zone === 'Z' ? 0 : parseOffsetMinutes(zone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60000);
}

const NUMERIC_PATTERN = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/;

/** Ambiguous MM/DD/YYYY-shaped input, resolved per options.order (BLOG_MCP_DATE_ORDER) rather than guessed -- sec6.3. */
function tryNumeric(input: string, options: DateNormalizationOptions): Date | undefined {
  const match = NUMERIC_PATTERN.exec(input);
  if (!match) return undefined;
  const [, a, b, c] = match;

  let year: number;
  let month: number;
  let day: number;
  if (options.order === 'YMD') {
    if ((a as string).length !== 4) return undefined;
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (options.order === 'DMY') {
    if ((c as string).length !== 4) return undefined;
    day = Number(a);
    month = Number(b);
    year = Number(c);
  } else {
    if ((c as string).length !== 4) return undefined;
    month = Number(a);
    day = Number(b);
    year = Number(c);
  }

  if (!isValidComponents(year, month, day, 0, 0, 0)) return undefined;
  return zonedTimeToUtc(year, month, day, 0, 0, 0, options.defaultTimeZone);
}

function acceptedFormatsMessage(options: DateNormalizationOptions): string {
  const numericExample = options.order === 'YMD' ? '2026/08/01' : options.order === 'DMY' ? '01/08/2026' : '08/01/2026';
  return `accepted formats: ISO 8601 (2026-08-02T10:00:00Z), date-only (2026-08-02), RFC 2822 (Mon, 02 Aug 2026 10:00:00 GMT), month-name (August 2, 2026), or numeric (${numericExample}, per BLOG_MCP_DATE_ORDER=${options.order})`;
}

/**
 * Normalizes a caller-supplied date string to canonical
 * YYYY-MM-DDTHH:MM:SSZ (TODO-NEXT.md sec6). `input` undefined or blank uses
 * `now` -- captured once by the caller before this is called, per sec3.4
 * ("one injectable request clock... every default derived during that
 * operation uses that same instant"). Otherwise tries each accepted family
 * (sec6.3) in a fixed order; the first structural match wins, so no input
 * is ever interpreted two different ways depending on what else happens to
 * match.
 */
export function normalizeDate(input: string | undefined, options: DateNormalizationOptions, now: Date): NormalizeDateResult {
  const trimmed = input?.trim();
  if (!trimmed) return { ok: true, canonical: toCanonical(now) };

  try {
    const resolved = tryIso(trimmed, options) ?? tryDateOnly(trimmed, options) ?? tryRfc2822(trimmed) ?? tryMonthName(trimmed, options) ?? tryNumeric(trimmed, options);
    if (!resolved) {
      return { ok: false, reason: `Date '${trimmed}' could not be parsed; ${acceptedFormatsMessage(options)}.` };
    }
    return { ok: true, canonical: toCanonical(resolved) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Date '${trimmed}' could not be normalized (${message}); ${acceptedFormatsMessage(options)}.` };
  }
}
