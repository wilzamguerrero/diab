import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { timeInRange } from './metrics';
import type { Reading } from '../types';

// Feature: diabetes-insulin-tracker, Property 18: Time-in-range proportion
//
// For any non-empty set of readings and any target range, the proportion
// returned by `timeInRange` equals count(readings within [targetLow, targetHigh])
// / total, and always lies within [0, 1].
//
// Validates: Requirements 7.4

/** Generator for a single Reading with a realistic glucose value. */
const anyReading: fc.Arbitrary<Reading> = fc.record({
  glucose: fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
  mealTag: fc.constantFrom<'pre' | 'post'>('pre', 'post'),
  timestamp: fc
    .date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2100-01-01T00:00:00.000Z') })
    .map((d) => d.toISOString()),
});

/** Non-empty array of readings. */
const nonEmptyReadings: fc.Arbitrary<Reading[]> = fc.array(anyReading, { minLength: 1, maxLength: 200 });

/** Independently count readings whose glucose lies within [low, high] inclusive. */
function countWithin(readings: Reading[], low: number, high: number): number {
  let n = 0;
  for (const { glucose } of readings) {
    if (glucose >= low && glucose <= high) {
      n += 1;
    }
  }
  return n;
}

describe('Property 18: Time-in-range proportion', () => {
  it('proportion equals count(within target) / total and lies within [0, 1]', () => {
    fc.assert(
      fc.property(
        nonEmptyReadings,
        // Two independent target bounds; normalize so low <= high.
        fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
        (readings, a, b) => {
          const targetLow = Math.min(a, b);
          const targetHigh = Math.max(a, b);

          const result = timeInRange(readings, targetLow, targetHigh);

          // Non-empty input must always yield a numeric result.
          expect(result).not.toBeNull();

          const expected = countWithin(readings, targetLow, targetHigh) / readings.length;
          expect(result!).toBeCloseTo(expected, 10);

          // Proportion is bounded within [0, 1].
          expect(result!).toBeGreaterThanOrEqual(0);
          expect(result!).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
