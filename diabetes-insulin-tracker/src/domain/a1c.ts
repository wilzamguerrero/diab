// Estimated A1c calculation from average glucose.
// Uses the ADAG (A1c-Derived Average Glucose) formula.

/**
 * Estimate A1c from average glucose (mg/dL) using the ADAG formula.
 * Returns null if no readings available.
 */
export function estimateA1c(averageGlucose: number): number {
  return (averageGlucose + 46.7) / 28.7;
}

/**
 * Get a color/risk level for the A1c value:
 * < 5.7 = normal (green)
 * 5.7-6.4 = prediabetes (yellow)
 * 6.5-7.0 = good control (blue)
 * 7.0-8.0 = needs improvement (orange)
 * > 8.0 = poor control (red)
 */
export function a1cLevel(a1c: number): 'normal' | 'prediabetes' | 'good' | 'needs-improvement' | 'poor' {
  if (a1c < 5.7) return 'normal';
  if (a1c < 6.5) return 'prediabetes';
  if (a1c <= 7.0) return 'good';
  if (a1c <= 8.0) return 'needs-improvement';
  return 'poor';
}
