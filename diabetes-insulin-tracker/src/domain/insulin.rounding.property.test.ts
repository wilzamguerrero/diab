// Property-based tests for one-decimal dose rounding.
//
// Feature: diabetes-insulin-tracker, Property 6: Dose rounded to one decimal
//
// For any valid profile and any DoseInput, the presented `result.dose` equals
// `roundToOneDecimal(max(0, rawDose))` and has at most one fractional digit.
//
// Validates: Requirements 3.6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateDose, roundToOneDecimal } from './insulin';
import type { PatientProfile, DoseInput } from '../types';

// Generator for a valid Patient_Profile:
//   icRatio > 0, isf > 0, targetGlucose in [40, 400].
// Bounds are constrained to clinically plausible, finite values so the
// generator stays within the calculation's valid input space.
const validProfileArb: fc.Arbitrary<PatientProfile> = fc.record({
  icRatio: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
  isf: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
  targetGlucose: fc.double({ min: 40, max: 400, noNaN: true, noDefaultInfinity: true }),
});

// Generator for a DoseInput spanning a wide but finite range of glucose and
// carbohydrate values (including values that drive rawDose negative).
const doseInputArb: fc.Arbitrary<DoseInput> = fc.record({
  currentGlucose: fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
  carbs: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Returns true when `value` has at most one fractional digit, i.e. multiplying
 * by 10 yields an integer. A small tolerance absorbs binary floating-point
 * representation error (e.g. 0.1 * 10 !== 1 exactly in IEEE-754).
 */
function hasAtMostOneFractionalDigit(value: number): boolean {
  const scaled = value * 10;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

describe('Property 6: Dose rounded to one decimal', () => {
  it('presented dose equals roundToOneDecimal(max(0, rawDose)) and has at most one fractional digit', () => {
    fc.assert(
      fc.property(validProfileArb, doseInputArb, (profile, input) => {
        const result = calculateDose(profile, input);

        // With a valid profile the calculation is always produced.
        expect(result).not.toBeNull();
        if (result === null) return;

        const expectedDose = roundToOneDecimal(Math.max(0, result.rawDose));

        // The presented dose matches the clamped, rounded raw dose exactly.
        expect(result.dose).toBe(expectedDose);

        // The presented dose has at most one fractional digit.
        expect(hasAtMostOneFractionalDigit(result.dose)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
