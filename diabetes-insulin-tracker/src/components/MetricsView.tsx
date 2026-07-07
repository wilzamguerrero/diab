// MetricsView component — aggregated metrics display.
// i18n via useI18n hook, with motion animations.
// Requirements 7.1–7.5

import { useState } from 'react';
import { motion } from 'motion/react';
import type { Reading } from '../types';
import { computeMetrics, timeInRange } from '../domain/metrics';
import { estimateA1c, a1cLevel } from '../domain/a1c';
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
          {/* Estimated A1c card */}
          {(() => {
            const eA1c = estimateA1c(metrics.average);
            const level = a1cLevel(eA1c);
            const levelColors: Record<string, string> = {
              'normal': '#4ade80',
              'prediabetes': '#fbbf24',
              'good': '#80c8ff',
              'needs-improvement': '#fb923c',
              'poor': '#ff6b6b',
            };
            return (
              <motion.div
                className="a1c-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{
                  background: levelColors[level],
                  borderRadius: '20px',
                  padding: '24px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(26,31,54,0.6)', marginBottom: '4px' }}>
                  A1c Estimado
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1a1f36', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                  {eA1c.toFixed(1)}%
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(26,31,54,0.55)', marginTop: '6px', fontWeight: 500 }}>
                  Basado en promedio de glucosa
                </div>
              </motion.div>
            );
          })()}

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
