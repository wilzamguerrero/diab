// App shell — composes the Diabetes Insulin Tracker UI.
//
// Responsibilities (task 12.1, Requirements 1.1, 1.2, 1.4):
//   - Gate all recording/profile/history/metrics UI behind <NotionConnect> so
//     data recording is unavailable until a Notion workspace is connected
//   - Tab navigation with framer-motion animations
//   - i18n via useI18n hook

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import NotionConnect from './components/NotionConnect';
import PageSelector from './components/PageSelector';
import ProfileSettings from './components/ProfileSettings';
import Calculator from './components/Calculator';
import QuickRecord from './components/QuickRecord';
import HistoryView from './components/HistoryView';
import MetricsView from './components/MetricsView';
import GlucoseChart from './components/GlucoseChart';
import FloatingNav from './components/FloatingNav';
import { NotionService } from './services/notionService';
import { ensureYear } from './services/notionSchema';
import { getReadings } from './services/readingsRepository';
import { rangeFor } from './domain/history';
import type { RangeKind, Reading } from './types';
import { useAppStore } from './state/appStore';
import { useI18n } from './services/i18n';

/** The selectable screens within the connected application. */
type Tab = 'calculator' | 'record' | 'history' | 'metrics' | 'profile';

const RANGE_KEYS: { kind: RangeKind; key: string }[] = [
  { kind: 'day', key: 'history.day' },
  { kind: 'week', key: 'history.week' },
  { kind: 'month', key: 'history.month' },
  { kind: 'year', key: 'history.year' },
];

const tabVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
};

/**
 * The application shell shown ONLY once a Notion workspace is connected.
 */
function ConnectedApp() {
  const { accessToken, rootPageId } = useAppStore();
  const [tab, setTab] = useState<Tab>('calculator');

  useEffect(() => {
    if (!accessToken || !rootPageId) return;
    let cancelled = false;
    (async () => {
      try {
        const service = new NotionService(accessToken);
        await ensureYear(service, rootPageId, new Date().getFullYear());
      } catch {
        // Best-effort schema bootstrap
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, rootPageId]);

  return (
    <div className="app-shell">
      <div className="app-shell__content app-shell__content--full">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
          >
            {tab === 'calculator' && <Calculator />}
            {tab === 'record' && <QuickRecord />}
            {tab === 'history' && <HistoryView />}
            {tab === 'metrics' && <MetricsScreen />}
            {tab === 'profile' && <ProfileSettings />}
          </motion.div>
        </AnimatePresence>
      </div>

      <FloatingNav currentTab={tab} onTabChange={setTab} />
    </div>
  );
}

/**
 * Metrics screen wrapper with toggle between Resumen and Gráfica.
 */
type MetricsTab = 'resumen' | 'grafica';

function MetricsScreen() {
  const { accessToken, rootPageId } = useAppStore();
  const { t } = useI18n();
  const [rangeKind, setRangeKind] = useState<RangeKind>('week');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricsTab, setMetricsTab] = useState<MetricsTab>('resumen');

  const range = useMemo(() => rangeFor(rangeKind, new Date()), [rangeKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const service = new NotionService(accessToken ?? '');
      const result = await getReadings(service, rootPageId ?? '', range);
      return result;
    } catch {
      return [] as Reading[];
    }
  }, [accessToken, rootPageId, range]);

  useEffect(() => {
    let cancelled = false;
    load().then((result) => {
      if (cancelled) return;
      setReadings(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <section aria-label="Metrics screen">
      <div role="group" aria-label={t('metrics.rangeLabel')}>
        {RANGE_KEYS.map(({ kind, key }) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={rangeKind === kind}
            disabled={rangeKind === kind}
            onClick={() => setRangeKind(kind)}
            whileTap={{ scale: 0.92 }}
          >
            {t(key)}
          </motion.button>
        ))}
      </div>

      {loading ? (
        <p role="status" aria-live="polite">
          {t('history.loading')}
        </p>
      ) : (
        <>
          {readings.length > 0 && (
            <div role="group" aria-label={t('metrics.viewLabel')} className="metrics-view-toggle">
              <motion.button
                type="button"
                aria-pressed={metricsTab === 'resumen'}
                disabled={metricsTab === 'resumen'}
                onClick={() => setMetricsTab('resumen')}
                whileTap={{ scale: 0.92 }}
              >
                {t('metrics.summary')}
              </motion.button>
              <motion.button
                type="button"
                aria-pressed={metricsTab === 'grafica'}
                disabled={metricsTab === 'grafica'}
                onClick={() => setMetricsTab('grafica')}
                whileTap={{ scale: 0.92 }}
              >
                {t('metrics.chart')}
              </motion.button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {metricsTab === 'resumen' ? (
              <motion.div
                key="resumen"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <MetricsView readings={readings} />
              </motion.div>
            ) : (
              <motion.div
                key="grafica"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <GlucoseChart readings={readings} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}

/**
 * Rendered once connected: if no data root page has been chosen yet, show the
 * page selector; otherwise show the full application.
 */
function RootGate() {
  const { rootPageId } = useAppStore();
  return rootPageId ? <ConnectedApp /> : <PageSelector />;
}

export default function App() {
  const { t } = useI18n();
  return (
    <main>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {t('app.title')}
      </motion.h1>
      <NotionConnect>
        <RootGate />
      </NotionConnect>
    </main>
  );
}
