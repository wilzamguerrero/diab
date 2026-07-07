// Pure history range domain logic.
// Side-effect-free helpers for computing half-open date ranges and filtering
// readings that fall within a range.
//
// See Requirement 6.1 and design.md (domain/history.ts).

import type { Reading, RangeKind, DateRange } from '../types';

/**
 * Week-start convention: weeks begin on MONDAY.
 *
 * JavaScript's Date.getDay() returns 0 for Sunday..6 for Saturday. We map that
 * so Monday is day 0 of the week and Sunday is day 6, giving an ISO-8601-style
 * week that starts on Monday.
 */
const MONDAY_BASED_OFFSET = (jsDay: number): number => (jsDay + 6) % 7;

/**
 * Produce a half-open date range `[start, end)` for the given kind, anchored at
 * `anchor`. The range always contains `anchor` and boundaries are computed in
 * local time.
 *
 *   day:   start of anchor's day        -> start of the next day
 *   week:  start of week (Monday) containing anchor -> start of next week
 *   month: start of anchor's month      -> start of the next month
 *   year:  start of anchor's year       -> start of the next year
 *
 * See Requirement 6.1.
 */
export function rangeFor(kind: RangeKind, anchor: Date): DateRange {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const date = anchor.getDate();

  switch (kind) {
    case 'day': {
      const start = new Date(year, month, date, 0, 0, 0, 0);
      const end = new Date(year, month, date + 1, 0, 0, 0, 0);
      return { start, end };
    }
    case 'week': {
      const offset = MONDAY_BASED_OFFSET(anchor.getDay());
      const start = new Date(year, month, date - offset, 0, 0, 0, 0);
      const end = new Date(year, month, date - offset + 7, 0, 0, 0, 0);
      return { start, end };
    }
    case 'month': {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
      return { start, end };
    }
    case 'year': {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);
      return { start, end };
    }
    default: {
      // Exhaustiveness guard: if RangeKind grows, this surfaces a type error.
      const exhaustive: never = kind;
      throw new Error(`Unsupported range kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Return the readings whose timestamp falls within the half-open range
 * `[start, end)` — the start is inclusive and the end is exclusive.
 *
 * A reading's `timestamp` is an ISO 8601 string; it is parsed to a millisecond
 * epoch value for comparison. Readings with an unparseable timestamp are
 * excluded.
 *
 * See Requirement 6.1.
 */
export function filterInRange(readings: Reading[], range: DateRange): Reading[] {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  return readings.filter((reading) => {
    const t = new Date(reading.timestamp).getTime();
    if (!Number.isFinite(t)) {
      return false;
    }
    return t >= startMs && t < endMs;
  });
}
