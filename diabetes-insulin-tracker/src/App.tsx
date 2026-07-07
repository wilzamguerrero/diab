// App shell — composes the Diabetes Insulin Tracker UI.
//
// Responsibilities (task 12.1, Requirements 1.1, 1.2, 1.4):
//   - Gate all recording/profile/history/metrics UI behind <NotionConnect> so
//     data recording is unavailable until a Notion workspace is connected
//   - Tab navigation with framer-motion animations
//   - Spanish UI translations

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
import { NotionService } from './services/notionService';
import { ensureYear } from './services/notionSchema';
import { getReadings } from './services/readingsRepository';
import { rangeFor } from './domain/history';
import type { RangeKind, Reading } from './types';
import { useAppStore } from './state/appStore';

/** The selectable screens within the connected application. */
type Tab = 'calculator' | 'record' | 'history' | 'metrics' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calculator', label: 'Calculadora' },
  { id: 'record', label: 'Registrar' },
  { id: 'history', label: 'Historial' },
  { id: 'metrics', label: 'Métricas' },
  { id: 'profile', label: 'Perfil' },
];

const METRICS_RANGE_OPTIONS: { kind: RangeKind; label: string }[] = [
  { kind: 'day', label: 'Día' },
  { kind: 'week', label: 'Semana' },
  { kind: 'month', label: 'Mes' },
  { kind: 'year', label: 'Año' },
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
      <nav role="tablist" aria-label="Secciones" className="app-shell__tabs">
        {TABS.map(({ id, label }) => (
          <motion.button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            whileTap={{ scale: 0.92 }}
          >
            {label}
          </motion.button>
        ))}
      </nav>

      <div className="app-shell__content">
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
    </div>
  );
}

/**
 * Metrics screen wrapper with toggle between Resumen and Gráfica.
 */
type MetricsTab = 'resumen' | 'grafica';

function MetricsScreen() {
  const { accessToken, rootPageId } = useAppStore();
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
      <div role="group" aria-label="Seleccionar rango de métricas">
        {METRICS_RANGE_OPTIONS.map(({ kind, label }) => (
          <motion.button
            key={kind}
            type="button"
            aria-pressed={rangeKind === kind}
            disabled={rangeKind === kind}
            onClick={() => setRangeKind(kind)}
            whileTap={{ scale: 0.92 }}
          >
            {label}
          </motion.button>
        ))}
      </div>

      {loading ? (
        <p role="status" aria-live="polite">
          Cargando...
        </p>
      ) : (
        <>
          {readings.length > 0 && (
            <div role="group" aria-label="Vista de métricas" className="metrics-view-toggle">
              <motion.button
                type="button"
                aria-pressed={metricsTab === 'resumen'}
                disabled={metricsTab === 'resumen'}
                onClick={() => setMetricsTab('resumen')}
                whileTap={{ scale: 0.92 }}
              >
                Resumen
              </motion.button>
              <motion.button
                type="button"
                aria-pressed={metricsTab === 'grafica'}
                disabled={metricsTab === 'grafica'}
                onClick={() => setMetricsTab('grafica')}
                whileTap={{ scale: 0.92 }}
              >
                Gráfica
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
  return (
    <main>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        Diabetes Insulin Tracker
      </motion.h1>
      <NotionConnect>
        <RootGate />
      </NotionConnect>
    </main>
  );
}
