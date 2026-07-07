// MetricsView component — aggregated metrics display.
// Spanish UI with motion animations.
// Requirements 7.1–7.5

import { useState } from 'react';
import { motion } from 'motion/react';
import type { Reading } from '../types';
import { computeMetrics, timeInRange } from '../domain/metrics';

export type MetricsAudience = 'patient' | 'doctor';

export interface MetricsViewProps {
  readings: Reading[];
  targetLow?: number;
  targetHigh?: number;
  initialAudience?: MetricsAudience;
}

const AUDIENCE_OPTIONS: { audience: MetricsAudience; label: string }[] = [
  { audience: 'patient', label: 'Paciente' },
  { audience: 'doctor', label: 'Doctor' },
];

function formatPercent(proportion: number): string {
  return `${(proportion * 100).toFixed(1)}%`;
}

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
  const inRangeProportion = timeInRange(readings, targetLow, targetHigh);

  return (
    <section aria-label="Métricas">
      <div role="group" aria-label="Seleccionar audiencia de métricas">
        {AUDIENCE_OPTIONS.map(({ audience: kind, label }) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={audience === kind}
            disabled={audience === kind}
            onClick={() => setAudience(kind)}
            whileTap={{ scale: 0.92 }}
          >
            {label}
          </motion.button>
        ))}
      </div>

      {metrics === null ? (
        <p>No se encontraron lecturas para el rango seleccionado.</p>
      ) : (
        <>
          {/* Total readings & in-range progress bar */}
          <div className="metrics-summary">
            <div className="metrics-summary__total">
              <span className="metrics-summary__total-label">Lecturas totales</span>
              <span className="metrics-summary__total-value">{metrics.count}</span>
            </div>
            {inRangeProportion !== null && (
              <div className="metrics-summary__range">
                <span className="metrics-summary__range-label">
                  En rango ({targetLow}–{targetHigh} mg/dL): <strong>{formatPercent(inRangeProportion)}</strong>
                </span>
                <div className="metrics-summary__progress-track">
                  <motion.div
                    className="metrics-summary__progress-bar"
                    initial={{ width: 0 }}
                    animate={{ width: `${(inRangeProportion * 100).toFixed(1)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    style={{
                      background: inRangeProportion >= 0.7 ? 'var(--success)' : inRangeProportion >= 0.5 ? 'var(--warning)' : 'var(--danger)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {audience === 'patient' ? (
            <motion.dl
              aria-label="Métricas del paciente"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.05 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.0 }}
              >
                <dt>Glucosa promedio</dt>
                <dd>{formatValue(metrics.average)} mg/dL</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <dt>Lecturas pre-comida</dt>
                <dd>{metrics.preCount}</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <dt>Lecturas post-comida</dt>
                <dd>{metrics.postCount}</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <dt>Glucosa mínima</dt>
                <dd>{formatValue(metrics.min)} mg/dL</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <dt>Glucosa máxima</dt>
                <dd>{formatValue(metrics.max)} mg/dL</dd>
              </motion.div>
            </motion.dl>
          ) : (
            <motion.dl
              aria-label="Métricas del doctor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <dt>Tiempo en rango ({targetLow}–{targetHigh} mg/dL)</dt>
                <dd>{formatPercent(inRangeProportion ?? 0)}</dd>
              </motion.div>
            </motion.dl>
          )}
        </>
      )}
    </section>
  );
}

export default MetricsView;
