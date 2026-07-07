// Pure validation domain logic for patient profiles and glucose readings.
// Side-effect-free functions that decide whether user-supplied values fall
// within their clinically acceptable domains, returning a helpful message on
// rejection.
//
// See Requirements 2.2, 2.3, 2.4, 5.4, 5.5 and design.md (domain/validation.ts).

import type { ValidationResult } from '../types';

/** Inclusive lower/upper bounds for a valid Target_Glucose (mg/dL). */
const TARGET_GLUCOSE_MIN = 40;
const TARGET_GLUCOSE_MAX = 400;

/** Inclusive lower/upper bounds for a valid Current_Glucose reading (mg/dL). */
const READING_GLUCOSE_MIN = 20;
const READING_GLUCOSE_MAX = 600;

/** Accepted Meal_Tag values. */
const VALID_MEAL_TAGS = ['pre', 'post'];

/**
 * Validate a candidate patient profile.
 *
 * Accepts the profile if and only if every field is a finite number and:
 *   - icRatio > 0
 *   - isf > 0
 *   - 40 <= targetGlucose <= 400
 *
 * Otherwise returns `{ valid: false, message }` with a helpful message that
 * describes the first failing constraint.
 *
 * See Requirements 2.2, 2.3, 2.4.
 */
export function validateProfile(p: {
  icRatio: number;
  isf: number;
  targetGlucose: number;
}): ValidationResult {
  const { icRatio, isf, targetGlucose } = p;

  if (typeof icRatio !== 'number' || !Number.isFinite(icRatio) || icRatio <= 0) {
    return {
      valid: false,
      message: 'El ratio insulina-carbohidratos debe ser un número mayor que 0.',
    };
  }

  if (typeof isf !== 'number' || !Number.isFinite(isf) || isf <= 0) {
    return {
      valid: false,
      message: 'El factor de sensibilidad a insulina debe ser un número mayor que 0.',
    };
  }

  if (
    typeof targetGlucose !== 'number' ||
    !Number.isFinite(targetGlucose) ||
    targetGlucose < TARGET_GLUCOSE_MIN ||
    targetGlucose > TARGET_GLUCOSE_MAX
  ) {
    return {
      valid: false,
      message: `La glucosa objetivo debe estar entre ${TARGET_GLUCOSE_MIN} y ${TARGET_GLUCOSE_MAX} mg/dL.`,
    };
  }

  return { valid: true };
}

/**
 * Validate a candidate glucose reading.
 *
 * Accepts the reading if and only if:
 *   - glucose is a finite number in the inclusive range [20, 600]
 *   - mealTag is one of "pre" or "post"
 *
 * Otherwise returns `{ valid: false, message }` with a helpful message that
 * describes the first failing constraint.
 *
 * See Requirements 5.4, 5.5.
 */
export function validateReading(r: {
  glucose: number;
  mealTag: string;
}): ValidationResult {
  const { glucose, mealTag } = r;

  if (
    typeof glucose !== 'number' ||
    !Number.isFinite(glucose) ||
    glucose < READING_GLUCOSE_MIN ||
    glucose > READING_GLUCOSE_MAX
  ) {
    return {
      valid: false,
      message: `La glucosa debe estar entre ${READING_GLUCOSE_MIN} y ${READING_GLUCOSE_MAX} mg/dL.`,
    };
  }

  if (!VALID_MEAL_TAGS.includes(mealTag)) {
    return {
      valid: false,
      message: 'La etiqueta de comida debe ser "pre" o "post".',
    };
  }

  return { valid: true };
}
