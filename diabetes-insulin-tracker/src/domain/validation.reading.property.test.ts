import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { validateReading } from './validation';

// Feature: diabetes-insulin-tracker, Property 11: Reading validation domain
//
// For any candidate reading, validateReading accepts the reading
// (valid: true) if and only if glucose is in [20, 600] AND mealTag is one of
// {"pre", "post"}; otherwise it is rejected with a validation message.
//
// Validates: Requirements 5.4, 5.5

/**
 * Independently computes whether a candidate reading should be accepted,
 * directly mirroring the acceptance criteria (not the implementation).
 */
function expectedValid(glucose: number, mealTag: string): boolean {
  return glucose >= 20 && glucose <= 600 && (mealTag === 'pre' || mealTag === 'post');
}

/**
 * Wide generator for glucose: mixes negatives, zero, out-of-range, and
 * in-range values plus the exact boundaries 20 and 600 so the accept/reject
 * boundary is exercised from both sides.
 */
const wideGlucose: fc.Arbitrary<number> = fc.oneof(
  // Broad continuous range spanning negatives through out-of-range positives.
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  // Boundary-focused values around the [20, 600] edges.
  fc.constantFrom(-100, -1, 0, 19, 19.9999, 20, 20.0001, 300, 599.9999, 600, 600.0001, 601, 1000),
);

/**
 * Wide generator for mealTag: includes the two valid tags plus arbitrary
 * strings (including near-misses and empty) so the membership check is
 * exercised from both sides.
 */
const wideMealTag: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('pre', 'post'),
  fc.constantFrom('', 'PRE', 'Post', 'pre-meal', 'post ', ' pre', 'before', 'after', 'snack'),
  fc.string(),
);

describe('Property 11: Reading validation domain', () => {
  it('accepts iff glucose in [20, 600] and mealTag in {"pre","post"}', () => {
    fc.assert(
      fc.property(wideGlucose, wideMealTag, (glucose, mealTag) => {
        const result = validateReading({ glucose, mealTag });
        const shouldBeValid = expectedValid(glucose, mealTag);

        expect(result.valid).toBe(shouldBeValid);

        if (!shouldBeValid) {
          // Rejection must include a non-empty validation message.
          expect(typeof result.message).toBe('string');
          expect(result.message!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
