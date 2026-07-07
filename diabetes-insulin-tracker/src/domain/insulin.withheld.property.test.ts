import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateDose } from './insulin';
import type { DoseInput, PatientProfile } from '../types';

// Feature: diabetes-insulin-tracker, Property 4: Calculation withheld for incomplete profile
//
// For any DoseInput and any incomplete/invalid profile (null, or with
// icRatio <= 0, or isf <= 0, or targetGlucose outside [40, 400], or with
// non-finite/missing fields), calculateDose returns null.
//
// Validates: Requirements 3.2

/** Arbitrary DoseInput with finite currentGlucose and carbs. */
const doseInputArb: fc.Arbitrary<DoseInput> = fc.record({
  currentGlucose: fc.double({ min: -1000, max: 1000, noNaN: true }),
  carbs: fc.double({ min: -1000, max: 1000, noNaN: true }),
});

// Finite number that is a *valid* value for each field, used so that a
// generated profile violates exactly the constraint(s) we intend.
const validIcRatio = fc.double({ min: 0.0001, max: 1000, noNaN: true });
const validIsf = fc.double({ min: 0.0001, max: 1000, noNaN: true });
const validTarget = fc.double({ min: 40, max: 400, noNaN: true });

// Value generators that violate a single constraint.
const nonPositive = fc.double({ min: -1000, max: 0, noNaN: true }); // <= 0
const targetTooLow = fc.double({ min: -1000, max: 39.9999, noNaN: true });
const targetTooHigh = fc.double({ min: 400.0001, max: 10000, noNaN: true });
const nonFinite = fc.constantFrom(NaN, Infinity, -Infinity);

// A profile that violates icRatio > 0.
const badIcRatioArb = fc.record({
  icRatio: fc.oneof(nonPositive, nonFinite),
  isf: validIsf,
  targetGlucose: validTarget,
});

// A profile that violates isf > 0.
const badIsfArb = fc.record({
  icRatio: validIcRatio,
  isf: fc.oneof(nonPositive, nonFinite),
  targetGlucose: validTarget,
});

// A profile whose targetGlucose is outside [40, 400].
const badTargetArb = fc.record({
  icRatio: validIcRatio,
  isf: validIsf,
  targetGlucose: fc.oneof(targetTooLow, targetTooHigh, nonFinite),
});

// A profile with one or more non-finite fields.
const nonFiniteFieldArb = fc.record({
  icRatio: fc.oneof(validIcRatio, nonFinite),
  isf: fc.oneof(validIsf, nonFinite),
  targetGlucose: fc.oneof(validTarget, nonFinite),
}).filter(
  (p) =>
    !Number.isFinite(p.icRatio) ||
    !Number.isFinite(p.isf) ||
    !Number.isFinite(p.targetGlucose),
);

// A profile with missing fields (undefined), simulating incomplete input.
const missingFieldArb = fc
  .record({
    icRatio: fc.oneof(validIcRatio, fc.constant(undefined)),
    isf: fc.oneof(validIsf, fc.constant(undefined)),
    targetGlucose: fc.oneof(validTarget, fc.constant(undefined)),
  })
  .filter(
    (p) =>
      p.icRatio === undefined ||
      p.isf === undefined ||
      p.targetGlucose === undefined,
  );

// Union of every kind of invalid/incomplete profile, including null.
const invalidProfileArb: fc.Arbitrary<PatientProfile | null> = fc.oneof(
  fc.constant<null>(null),
  badIcRatioArb,
  badIsfArb,
  badTargetArb,
  nonFiniteFieldArb,
  missingFieldArb,
) as fc.Arbitrary<PatientProfile | null>;

describe('Property 4: Calculation withheld for incomplete profile', () => {
  it('returns null for any incomplete/invalid profile and any input', () => {
    fc.assert(
      fc.property(invalidProfileArb, doseInputArb, (profile, input) => {
        expect(calculateDose(profile, input)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('returns null when profile is null', () => {
    fc.assert(
      fc.property(doseInputArb, (input) => {
        expect(calculateDose(null, input)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
