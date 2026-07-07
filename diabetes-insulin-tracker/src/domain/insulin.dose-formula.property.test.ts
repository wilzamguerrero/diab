import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { calculateDose } from './insulin';
import type { PatientProfile, DoseInput } from '../types';

// Feature: diabetes-insulin-tracker, Property 3: Dose formula correctness
//
// For any VALID profile (icRatio > 0, isf > 0, targetGlucose in [40, 400]) and
// any DoseInput, the raw computed dose (`result.rawDose`) equals
// (carbs / icRatio) + ((currentGlucose - targetGlucose) / isf) within
// floating-point tolerance.
//
// Validates: Requirements 3.1

// Arbitrary for a clinically valid PatientProfile.
// - icRatio, isf: strictly positive, finite (bounded away from 0 to keep the
//   division well-conditioned and free of overflow to Infinity).
// - targetGlucose: within the inclusive accepted range [40, 400].
const validProfileArb: fc.Arbitrary<PatientProfile> = fc.record({
  icRatio: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  isf: fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }),
  targetGlucose: fc.double({ min: 40, max: 400, noNaN: true, noDefaultInfinity: true }),
});

// Arbitrary for a DoseInput with reasonable, finite clinical magnitudes.
const doseInputArb: fc.Arbitrary<DoseInput> = fc.record({
  currentGlucose: fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
  carbs: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
});

describe('Property 3: Dose formula correctness', () => {
  it('rawDose equals (carbs / icRatio) + ((currentGlucose - targetGlucose) / isf)', () => {
    fc.assert(
      fc.property(validProfileArb, doseInputArb, (profile, input) => {
        const result = calculateDose(profile, input);

        // A valid profile must always produce a result (never withheld).
        expect(result).not.toBeNull();

        const expectedRawDose =
          input.carbs / profile.icRatio +
          (input.currentGlucose - profile.targetGlucose) / profile.isf;

        // Compare within a floating-point tolerance that scales with the
        // magnitude of the expected value to absorb accumulated rounding error.
        const tolerance = 1e-9 * Math.max(1, Math.abs(expectedRawDose));
        expect(Math.abs(result!.rawDose - expectedRawDose)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 200 },
    );
  });
});
