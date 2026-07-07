// MetricsView component — aggregated metrics display.
// i18n via useI18n hook, with motion animations.
// Requirements 7.1–7.5

import { useState } from 'react';
import { motion } from 'motion/react';
import type { Reading } from '../types';
import { computeMetrics, timeInRange } from '../domain/metrics';
import { useI18n } from '../services/i18n';

export type MetricsAudience = 'patient' | 'doctor';

export interface MetricsViewProps {
  readings: Reading[];
  targetLow?: number;
  targetHigh?: number;
  initialAudience?: MetricsAudience;
}

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
  const { t } = useI18n();

  const metrics = computeMetrics(readings);
  const inRangeProportion = timeInRange(readings, targetLow, targetHigh);

  return (
    <section aria-label={t('metrics.label')}>
      <div role="group" aria-label={t('metrics.audienceLabel')}>
        {(['patient', 'doctor'] as const).map((kind) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={audience === kind}
            disabled={audience === kind}
            onClick={() => setAudience(kind)}
            whileTap={{ scale: 0.92 }}
          >
            {t(`metrics.${kind}`)}
          </motion.button>
        ))}
      </div>

      {metrics === null ? (
        <p>{t('metrics.empty')}</p>
      ) : (
        <>
          {/* Total readings & in-range progress bar */}
          <div className="metrics-summary">
            <div className="metrics-summary__total">
              <span className="metrics-summary__total-label">{t('metrics.totalReadings')}</span>
              <span className="metrics-summary__total-value">{metrics.count}</span>
            </div>
            {inRangeProportion !== null && (
              <div className="metrics-summary__range">
                <span className="metrics-summary__range-label">
                  {t('metrics.inRange')} ({targetLow}–{targetHigh} mg/dL): <strong>{formatPercent(inRangeProportion)}</strong>
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
              aria-label={t('metrics.patientLabel')}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.05 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.0 }}
              >
                <dt>{t('metrics.average')}</dt>
                <dd>{formatValue(metrics.average)} mg/dL</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <dt>{t('metrics.preCount')}</dt>
                <dd>{metrics.preCount}</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <dt>{t('metrics.postCount')}</dt>
                <dd>{metrics.postCount}</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <dt>{t('metrics.min')}</dt>
                <dd>{formatValue(metrics.min)} mg/dL</dd>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <dt>{t('metrics.max')}</dt>
                <dd>{formatValue(metrics.max)} mg/dL</dd>
              </motion.div>
            </motion.dl>
          ) : (
            <motion.dl
              aria-label={t('metrics.doctorLabel')}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <dt>{t('metrics.tir')} ({targetLow}–{targetHigh} mg/dL)</dt>
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
