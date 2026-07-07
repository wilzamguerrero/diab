// Pure insulin dose calculation domain logic.
// Side-effect-free functions covering the standard clinical bolus model:
// a carbohydrate-coverage term plus a glucose-correction term, clamped to a
// non-negative value and rounded to one decimal place.
//
// See Requirements 3.1, 3.2, 3.3, 3.6 and design.md (domain/insulin.ts).

import type { PatientProfile, DoseInput, DoseResult } from '../types';

/**
 * Round a number to one decimal place using round-half-up semantics.
 *
 * Round-half-up means a value exactly on the .05 boundary rounds toward
 * positive infinity (e.g. 2.05 -> 2.1). To avoid binary floating-point
 * artifacts (where 2.05 may be represented as 2.04999...), the value is
 * pre-scaled and nudged using an epsilon derived from its magnitude before
 * applying Math.round.
 *
 * See Requirement 3.6.
 */
export function roundToOneDecimal(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const scaled = value * 10;
  // Nudge by a relative epsilon so that values intended to sit exactly on a
  // half boundary are not pushed below it by floating-point representation.
  const epsilon = Math.abs(scaled) * Number.EPSILON;
  return Math.round(scaled + epsilon) / 10;
}

/**
 * Determine whether a profile is present, complete, and clinically valid.
 *
 * A profile is usable only when icRatio > 0, isf > 0, and targetGlucose falls
 * within the inclusive range [40, 400]. All fields must be finite numbers.
 *
 * See Requirement 3.2.
 */
function isUsableProfile(profile: PatientProfile | null): profile is PatientProfile {
  if (profile === null || profile === undefined) {
    return false;
  }

  const { icRatio, isf, targetGlucose } = profile;

  if (
    typeof icRatio !== 'number' ||
    typeof isf !== 'number' ||
    typeof targetGlucose !== 'number'
  ) {
    return false;
  }

  if (!Number.isFinite(icRatio) || !Number.isFinite(isf) || !Number.isFinite(targetGlucose)) {
    return false;
  }

  if (icRatio <= 0 || isf <= 0) {
    return false;
  }

  if (targetGlucose < 40 || targetGlucose > 400) {
    return false;
  }

  return true;
}

/**
 * Compute a suggested insulin dose from a patient profile and input.
 *
 * Returns null when the profile is missing, incomplete, or invalid so the
 * caller can prompt the patient to complete their profile (Requirement 3.2).
 *
 * Otherwise:
 *   carbCoverage = carbs / icRatio
 *   correction   = (currentGlucose - targetGlucose) / isf
 *   rawDose      = carbCoverage + correction        (may be negative)
 *   dose         = roundToOneDecimal(max(0, rawDose))
 *
 * See Requirements 3.1, 3.3, 3.6.
 */
export function calculateDose(
  profile: PatientProfile | null,
  input: DoseInput
): DoseResult | null {
  if (!isUsableProfile(profile)) {
    return null;
  }

  const { icRatio, isf, targetGlucose } = profile;
  const { currentGlucose, carbs } = input;

  const carbCoverage = carbs / icRatio;
  const correction = (currentGlucose - targetGlucose) / isf;
  const rawDose = carbCoverage + correction;
  const dose = roundToOneDecimal(Math.max(0, rawDose));

  return { carbCoverage, correction, rawDose, dose };
}
