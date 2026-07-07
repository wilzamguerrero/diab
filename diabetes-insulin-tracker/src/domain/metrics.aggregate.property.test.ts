import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { computeMetrics } from './metrics';
import type { Reading } from '../types';

// Feature: diabetes-insulin-tracker, Property 17: Aggregate metric correctness
//
// For any NON-EMPTY set of readings, `computeMetrics` returns metrics where:
// - `average` equals the arithmetic mean of the glucose values.
// - `preCount + postCount` partitions the total count (equals `count`), which
//   equals the number of readings.
// - `min` and `max` are members of the set that bound every glucose value:
//   `min <= glucose <= max` for all readings, and both `min` and `max` appear
//   among the glucose values.
//
// Validates: Requirements 7.1, 7.2, 7.3

// Arbitrary for a single Reading:
// - glucose: finite double (bounded to realistic magnitudes to keep the mean
//   well-conditioned and free of overflow to Infinity).
// - mealTag: one of the two valid tags.
// - timestamp: an arbitrary ISO 8601 string (irrelevant to these metrics).
const readingArb: fc.Arbitrary<Reading> = fc.record({
  glucose: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  mealTag: fc.constantFrom<'pre' | 'post'>('pre', 'post'),
  timestamp: fc.date().map((d) => d.toISOString()),
});

// Non-empty arrays of readings.
const nonEmptyReadingsArb: fc.Arbitrary<Reading[]> = fc.array(readingArb, {
  minLength: 1,
  maxLength: 200,
});

describe('Property 17: Aggregate metric correctness', () => {
  it('average is the mean, pre/post partition the count, and min/max bound and belong to the set', () => {
    fc.assert(
      fc.property(nonEmptyReadingsArb, (readings) => {
        const metrics = computeMetrics(readings);

        // A non-empty set must always produce metrics (never null).
        expect(metrics).not.toBeNull();
        const m = metrics!;

        const glucoseValues = readings.map((r) => r.glucose);

        // count equals the number of readings.
        expect(m.count).toBe(readings.length);

        // Average equals the arithmetic mean, within a magnitude-scaled tolerance
        // to absorb accumulated floating-point rounding error.
        const expectedAverage =
          glucoseValues.reduce((sum, g) => sum + g, 0) / glucoseValues.length;
        const tolerance = 1e-6 * Math.max(1, Math.abs(expectedAverage));
        expect(Math.abs(m.average - expectedAverage)).toBeLessThanOrEqual(tolerance);

        // preCount + postCount partitions the total count (every reading is
        // tagged 'pre' or 'post').
        expect(m.preCount + m.postCount).toBe(m.count);

        // min and max bound every glucose value.
        for (const g of glucoseValues) {
          expect(m.min).toBeLessThanOrEqual(g);
          expect(m.max).toBeGreaterThanOrEqual(g);
        }

        // min and max are themselves members of the set.
        expect(glucoseValues).toContain(m.min);
        expect(glucoseValues).toContain(m.max);
      }),
      { numRuns: 200 },
    );
  });
});
