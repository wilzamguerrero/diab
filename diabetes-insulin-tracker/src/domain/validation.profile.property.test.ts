import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { validateProfile } from './validation';

// Feature: diabetes-insulin-tracker, Property 2: Profile validation domain
//
// For any candidate profile values, validateProfile accepts the profile
// (valid: true) if and only if icRatio > 0 AND isf > 0 AND
// 40 <= targetGlucose <= 400; otherwise it is rejected with a validation
// message.
//
// Validates: Requirements 2.2, 2.3, 2.4

/**
 * Independently computes whether a candidate profile should be accepted,
 * directly mirroring the acceptance criteria (not the implementation).
 */
function expectedValid(icRatio: number, isf: number, targetGlucose: number): boolean {
  return icRatio > 0 && isf > 0 && targetGlucose >= 40 && targetGlucose <= 400;
}

/**
 * Wide generator for a single field: mixes negatives, zero, small positives,
 * out-of-range, and in-range values so that the accept/reject boundary is
 * exercised from both sides.
 */
const wideNumber: fc.Arbitrary<number> = fc.oneof(
  // Broad continuous range spanning negatives through out-of-range positives.
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  // Boundary-focused values around the icRatio/isf > 0 and targetGlucose edges.
  fc.constantFrom(-100, -1, -0.0001, 0, 0.0001, 1, 39, 39.9999, 40, 400, 400.0001, 401, 600),
);

describe('Property 2: Profile validation domain', () => {
  it('accepts iff icRatio > 0, isf > 0, and 40 <= targetGlucose <= 400', () => {
    fc.assert(
      fc.property(wideNumber, wideNumber, wideNumber, (icRatio, isf, targetGlucose) => {
        const result = validateProfile({ icRatio, isf, targetGlucose });
        const shouldBeValid = expectedValid(icRatio, isf, targetGlucose);

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
