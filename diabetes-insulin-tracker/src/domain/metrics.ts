// Pure metric aggregation functions for the Diabetes Insulin Tracker.
// See design "Domain: Metrics (domain/metrics.ts)" and Requirements 7.1–7.5.

import type { Reading, Metrics } from '../types';

/**
 * Compute aggregate metrics over a set of readings.
 *
 * Returns `null` for empty input so the caller can show an empty-state
 * message (Requirement 7.5). Otherwise computes:
 * - `count`: total number of readings
 * - `average`: arithmetic mean of glucose values (Requirement 7.1)
 * - `preCount` / `postCount`: counts partitioned by meal tag (Requirement 7.2)
 * - `min` / `max`: minimum and maximum glucose values (Requirement 7.3)
 */
export function computeMetrics(readings: Reading[]): Metrics | null {
  if (readings.length === 0) {
    return null;
  }

  let sum = 0;
  let preCount = 0;
  let postCount = 0;
  let min = readings[0].glucose;
  let max = readings[0].glucose;

  for (const reading of readings) {
    const { glucose, mealTag } = reading;
    sum += glucose;
    if (mealTag === 'pre') {
      preCount += 1;
    } else if (mealTag === 'post') {
      postCount += 1;
    }
    if (glucose < min) {
      min = glucose;
    }
    if (glucose > max) {
      max = glucose;
    }
  }

  const count = readings.length;

  return {
    count,
    average: sum / count,
    preCount,
    postCount,
    min,
    max,
  };
}

/**
 * Compute the proportion of readings whose glucose falls within the inclusive
 * target range `[targetLow, targetHigh]`.
 *
 * Returns `null` for empty input so the caller can show an empty-state
 * message. Otherwise returns a value in `[0, 1]` equal to
 * `count(within target) / total` (Requirement 7.4).
 */
export function timeInRange(
  readings: Reading[],
  targetLow: number,
  targetHigh: number,
): number | null {
  if (readings.length === 0) {
    return null;
  }

  let withinCount = 0;
  for (const { glucose } of readings) {
    if (glucose >= targetLow && glucose <= targetHigh) {
      withinCount += 1;
    }
  }

  return withinCount / readings.length;
}
