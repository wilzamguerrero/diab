// MetricsView component.
//
// Displays aggregated metrics for a set of readings supplied via props (the
// caller filters readings for the selected range). An audience toggle switches
// between the patient view and the doctor view:
//
// - Patient view: average, pre/post meal counts, and min/max glucose, computed
//   via `computeMetrics` (Requirements 7.1, 7.2, 7.3).
// - Doctor view: the time-in-range proportion computed via `timeInRange` over
//   the target range `[targetLow, targetHigh]`, presented as a percentage
//   (Requirement 7.4).
//
// When there are no readings, `computeMetrics` returns null and an empty-state
// message is shown instead of any computed metrics (Requirement 7.5).
//
// See design.md ("MetricsView") and Requirements 7.1–7.5.

import { useState } from 'react';
import type { Reading } from '../types';
import { computeMetrics, timeInRange } from '../domain/metrics';

/** Which audience's metrics are currently shown. */
export type MetricsAudience = 'patient' | 'doctor';

export interface MetricsViewProps {
  /** Readings for the selected range (already filtered by the caller). */
  readings: Reading[];
  /** Inclusive lower bound of the target glucose range (mg/dL). Defaults to 70. */
  targetLow?: number;
  /** Inclusive upper bound of the target glucose range (mg/dL). Defaults to 180. */
  targetHigh?: number;
  /** Initial audience selection. Defaults to `'patient'`. */
  initialAudience?: MetricsAudience;
}

const AUDIENCE_OPTIONS: { audience: MetricsAudience; label: string }[] = [
  { audience: 'patient', label: 'Patient' },
  { audience: 'doctor', label: 'Doctor' },
];

/** Format a proportion in [0, 1] as a percentage string with one decimal. */
function formatPercent(proportion: number): string {
  return `${(proportion * 100).toFixed(1)}%`;
}

/** Format a numeric glucose/average value with at most one decimal place. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function MetricsView({
  readings,
  targetLow = 70,
  targetHigh = 180,
  initialAudience = 'patient',
}: MetricsViewProps) {
  const [audience, setAudience] = useState<MetricsAudience>(initialAudience);

  const metrics = computeMetrics(readings);

  return (
    <section aria-label="Metrics">
      <div role="group" aria-label="Select metrics audience">
        {AUDIENCE_OPTIONS.map(({ audience: kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={audience === kind}
            disabled={audience === kind}
            onClick={() => setAudience(kind)}
          >
            {label}
          </button>
        ))}
      </div>

      {metrics === null ? (
        <p>No readings found for the selected range.</p>
      ) : audience === 'patient' ? (
        <dl aria-label="Patient metrics">
          <div>
            <dt>Average glucose</dt>
            <dd>{formatValue(metrics.average)} mg/dL</dd>
          </div>
          <div>
            <dt>Pre-meal readings</dt>
            <dd>{metrics.preCount}</dd>
          </div>
          <div>
            <dt>Post-meal readings</dt>
            <dd>{metrics.postCount}</dd>
          </div>
          <div>
            <dt>Minimum glucose</dt>
            <dd>{formatValue(metrics.min)} mg/dL</dd>
          </div>
          <div>
            <dt>Maximum glucose</dt>
            <dd>{formatValue(metrics.max)} mg/dL</dd>
          </div>
        </dl>
      ) : (
        <dl aria-label="Doctor metrics">
          <div>
            <dt>Time in range ({targetLow}–{targetHigh} mg/dL)</dt>
            <dd>{formatPercent(timeInRange(readings, targetLow, targetHigh) ?? 0)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export default MetricsView;
