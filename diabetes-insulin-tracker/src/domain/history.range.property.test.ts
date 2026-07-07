import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { rangeFor, filterInRange } from './history';
import type { Reading, RangeKind } from '../types';

// Feature: diabetes-insulin-tracker, Property 14: Range retrieval correctness
//
// For any set of readings and any selected day/week/month/year range, the
// filtered set contains EXACTLY the readings whose timestamp falls within the
// half-open range [start, end) — no extras and no drops.
//
// Validates: Requirements 6.1

const rangeKindArb: fc.Arbitrary<RangeKind> = fc.constantFrom('day', 'week', 'month', 'year');

// An anchor Date generated from a bounded epoch millisecond value so that the
// derived local-time ranges are well-behaved (avoids far-future/past extremes).
// Roughly spans 1990-01-01 .. 2040-01-01.
const MIN_MS = new Date(1990, 0, 1).getTime();
const MAX_MS = new Date(2040, 0, 1).getTime();

const anchorArb: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms));

// A Reading whose timestamp is an ISO 8601 string. Timestamps are drawn from a
// window slightly wider than the anchor window so the readings are a healthy
// mix of in-range and out-of-range values relative to any computed range.
const readingArb: fc.Arbitrary<Reading> = fc.record({
  glucose: fc.double({ min: 20, max: 600, noNaN: true, noDefaultInfinity: true }),
  mealTag: fc.constantFrom<'pre' | 'post'>('pre', 'post'),
  timestamp: fc
    .integer({ min: MIN_MS - 90 * 24 * 60 * 60 * 1000, max: MAX_MS + 90 * 24 * 60 * 60 * 1000 })
    .map((ms) => new Date(ms).toISOString()),
});

describe('Property 14: Range retrieval correctness', () => {
  it('filterInRange returns exactly the readings whose timestamp is within [start, end)', () => {
    fc.assert(
      fc.property(
        fc.array(readingArb, { maxLength: 50 }),
        rangeKindArb,
        anchorArb,
        (readings, kind, anchor) => {
          const range = rangeFor(kind, anchor);
          const startMs = range.start.getTime();
          const endMs = range.end.getTime();

          // Independently determine the expected in-range set.
          const expected = readings.filter((r) => {
            const t = new Date(r.timestamp).getTime();
            return Number.isFinite(t) && t >= startMs && t < endMs;
          });

          const actual = filterInRange(readings, range);

          // Same membership: no extras and no drops. Since filterInRange
          // preserves input order and expected is computed with the same
          // ordering, the arrays must be strictly equal element-by-element.
          expect(actual).toEqual(expected);

          // Every returned reading truly lies within the half-open range.
          for (const r of actual) {
            const t = new Date(r.timestamp).getTime();
            expect(t).toBeGreaterThanOrEqual(startMs);
            expect(t).toBeLessThan(endMs);
          }

          // Every excluded reading truly lies outside the range.
          const excluded = readings.filter((r) => !actual.includes(r));
          for (const r of excluded) {
            const t = new Date(r.timestamp).getTime();
            const inside = Number.isFinite(t) && t >= startMs && t < endMs;
            expect(inside).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
