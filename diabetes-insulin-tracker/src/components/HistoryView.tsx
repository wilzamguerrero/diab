// HistoryView component — browse recorded readings by date range.
// i18n via useI18n hook, with motion animations.
// Requirements 6.1–6.5

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DateRange, RangeKind, Reading } from '../types';
import { rangeFor } from '../domain/history';
import { getReadings } from '../services/readingsRepository';
import { NotionService } from '../services/notionService';
import { useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';

export type FetchReadings = (range: DateRange) => Promise<Reading[]>;

export interface HistoryViewProps {
  fetchReadings?: FetchReadings;
  rootPageId?: string;
  anchor?: Date;
  initialRange?: RangeKind;
}

const RANGE_KEYS: { kind: RangeKind; key: string }[] = [
  { kind: 'day', key: 'history.day' },
  { kind: 'week', key: 'history.week' },
  { kind: 'month', key: 'history.month' },
  { kind: 'year', key: 'history.year' },
];

type LoadStatus = 'loading' | 'loaded' | 'error';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function HistoryView({
  fetchReadings,
  rootPageId,
  anchor,
  initialRange = 'day',
}: HistoryViewProps) {
  const { accessToken, rootPageId: storeRootPageId } = useAppStore();
  const { t } = useI18n();
  const effectiveRootPageId = rootPageId ?? storeRootPageId ?? '';
  const [range, setRange] = useState<RangeKind>(initialRange);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);

  const defaultFetch = useCallback<FetchReadings>(
    (dateRange) => {
      const service = new NotionService(accessToken ?? '');
      return getReadings(service, effectiveRootPageId, dateRange);
    },
    [accessToken, effectiveRootPageId],
  );

  const loader = fetchReadings ?? defaultFetch;

  const anchorTime = anchor ? anchor.getTime() : undefined;
  const activeRange = useMemo(
    () => rangeFor(range, anchor ?? new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, anchorTime],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    loader(activeRange)
      .then((result) => {
        if (cancelled) return;
        setReadings(result);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReadings([]);
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [loader, activeRange]);

  return (
    <motion.section
      aria-label={t('history.heading')}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <h2>{t('history.heading')}</h2>
      <div role="group" aria-label={t('history.rangeLabel')}>
        {RANGE_KEYS.map(({ kind, key }) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={range === kind}
            disabled={range === kind}
            onClick={() => setRange(kind)}
            whileTap={{ scale: 0.92 }}
          >
            {t(key)}
          </motion.button>
        ))}
      </div>

      {status === 'loading' && (
        <p role="status" aria-live="polite">
          {t('history.loading')}
        </p>
      )}

      {status === 'error' && (
        <p role="alert">{t('history.error')}: {error}</p>
      )}

      {status === 'loaded' && readings.length === 0 && (
        <p>{t('history.empty')}</p>
      )}

      {status === 'loaded' && readings.length > 0 && (
        <ul>
          {readings.map((reading, index) => (
            <ReadingItem key={`${reading.timestamp}-${index}`} reading={reading} index={index} />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

/** Clickable reading item that expands to show details and notes. */
function ReadingItem({ reading, index }: { reading: Reading; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <span>{reading.glucose} mg/dL</span>
      <span>{reading.mealTag === 'pre' ? t('record.pre') : t('record.post')}</span>
      <time dateTime={reading.timestamp}>
        {formatTimestamp(reading.timestamp)}
      </time>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="reading-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ overflow: 'hidden', width: '100%' }}
          >
            <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(26,31,54,0.1)', marginTop: '8px', fontSize: '0.85rem' }}>
              <p style={{ margin: '4px 0' }}><strong>{t('history.glucose')}:</strong> {reading.glucose} mg/dL</p>
              <p style={{ margin: '4px 0' }}><strong>{t('history.mealTag')}:</strong> {reading.mealTag === 'pre' ? t('record.pre') : t('record.post')}</p>
              <p style={{ margin: '4px 0' }}><strong>{t('history.date')}:</strong> {formatTimestamp(reading.timestamp)}</p>
              {reading.notes && (
                <p style={{ margin: '4px 0', fontStyle: 'italic', color: 'rgba(26,31,54,0.7)' }}>
                  <strong>{t('history.notes')}:</strong> {reading.notes}
                </p>
              )}
              {!reading.notes && (
                <p style={{ margin: '4px 0', color: 'rgba(26,31,54,0.4)' }}>{t('history.noNotes')}</p>
              )}
              {reading.photoUrl && (
                <img
                  src={reading.photoUrl}
                  alt="Foto de comida"
                  style={{ width: '100%', maxWidth: '200px', borderRadius: '12px', marginTop: '8px' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default HistoryView;
