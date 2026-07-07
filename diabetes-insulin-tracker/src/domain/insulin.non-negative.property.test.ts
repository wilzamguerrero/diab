import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { calculateDose } from './insulin';
import type { PatientProfile, DoseInput } from '../types';

// Feature: diabetes-insulin-tracker, Property 5: Dose is never negative
//
// For any valid profile and any DoseInput (including inputs producing a
// strongly negative correction term), the presented result.dose is always >= 0.
//
// Validates: Requirements 3.3

/** Generator for clinically valid, usable profiles (icRatio > 0, isf > 0, targetGlucose in [40, 400]). */
const validProfile: fc.Arbitrary<PatientProfile> = fc.record({
  icRatio: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
  isf: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
  targetGlucose: fc.double({ min: 40, max: 400, noNaN: true, noDefaultInfinity: true }),
});

/** General DoseInput generator across a wide, realistic input space. */
const anyDoseInput: fc.Arbitrary<DoseInput> = fc.record({
  currentGlucose: fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
  carbs: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
});

describe('Property 5: Dose is never negative', () => {
  it('presents a dose >= 0 for any valid profile and any input', () => {
    fc.assert(
      fc.property(validProfile, anyDoseInput, (profile, input) => {
        const result = calculateDose(profile, input);
        // A valid profile must always yield a result.
        expect(result).not.toBeNull();
        expect(result!.dose).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });

  it('presents a dose >= 0 even when currentGlucose is far below targetGlucose (strongly negative correction)', () => {
    // Force a strongly negative correction term: currentGlucose << targetGlucose
    // and little or no carb coverage to offset it.
    const negativeCorrectionInput: fc.Arbitrary<DoseInput> = fc.record({
      currentGlucose: fc.double({ min: 0, max: 39, noNaN: true, noDefaultInfinity: true }),
      carbs: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
    });

    fc.assert(
      fc.property(validProfile, negativeCorrectionInput, (profile, input) => {
        const result = calculateDose(profile, input);
        expect(result).not.toBeNull();
        // The raw dose can be negative here...
        // ...but the presented dose is always clamped to >= 0.
        expect(result!.dose).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });
});
