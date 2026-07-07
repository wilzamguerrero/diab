// App shell — composes the Diabetes Insulin Tracker UI.
//
// Responsibilities (task 12.1, Requirements 1.1, 1.2, 1.4):
//   - Gate all recording/profile/history/metrics UI behind <NotionConnect> so
//     data recording is unavailable until a Notion workspace is connected
//     (Req 1.1). NotionConnect drives the OAuth code exchange (reading `?code`
//     from the redirect URL on mount) and only renders its children once the
//     store reports `connected` (Req 1.2); on failure it stays disconnected and
//     shows an error (Req 1.4).
//   - Once connected, ensure the current year's Notion schema exists
//     (best-effort) and provide lightweight tab navigation between the
//     Calculator, QuickRecord, History, Metrics, and Profile screens.
//
// Connection and cached profile state are shared via the app store, so the
// gated screens read what they need without prop drilling.

import { useCallback, useEffect, useMemo, useState } from 'react';
import NotionConnect from './components/NotionConnect';
import ProfileSettings from './components/ProfileSettings';
import Calculator from './components/Calculator';
import QuickRecord from './components/QuickRecord';
import HistoryView from './components/HistoryView';
import MetricsView from './components/MetricsView';
import { NotionService, ROOT_PAGE_ID } from './services/notionService';
import { ensureYear } from './services/notionSchema';
import { getReadings } from './services/readingsRepository';
import { rangeFor } from './domain/history';
import type { RangeKind, Reading } from './types';
import { useAppStore } from './state/appStore';

/** The selectable screens within the connected application. */
type Tab = 'calculator' | 'record' | 'history' | 'metrics' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calculator', label: 'Calculator' },
  { id: 'record', label: 'Record' },
  { id: 'history', label: 'History' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'profile', label: 'Profile' },
];

const METRICS_RANGE_OPTIONS: { kind: RangeKind; label: string }[] = [
  { kind: 'day', label: 'Day' },
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
];

/**
 * The application shell shown ONLY once a Notion workspace is connected. It is
 * rendered as a child of <NotionConnect>, so it mounts after connection and can
 * safely rely on an access token being present in the store.
 */
function ConnectedApp() {
  const { accessToken } = useAppStore();
  const [tab, setTab] = useState<Tab>('calculator');

  // On first mount after connecting, ensure the current year's Year_Toggle and
  // Readings_Database exist so subsequent recording/queries have a target.
  // Best-effort: any failure is swallowed (the individual repository calls also
  // ensure the schema on demand).
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const service = new NotionService(accessToken);
        await ensureYear(service, ROOT_PAGE_ID, new Date().getFullYear());
      } catch {
        // Best-effort schema bootstrap; ignore errors.
      }
      // `cancelled` guards against setting state after unmount; nothing to set
      // here today, but keeps the effect future-proof and lint-clean.
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div className="app-shell">
      <nav role="tablist" aria-label="Sections" className="app-shell__tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="app-shell__content">
        {tab === 'calculator' && <Calculator />}
        {tab === 'record' && <QuickRecord />}
        {tab === 'history' && <HistoryView />}
        {tab === 'metrics' && <MetricsScreen />}
        {tab === 'profile' && <ProfileSettings />}
      </div>
    </div>
  );
}

/**
 * Metrics screen wrapper: MetricsView is a pure presentation component that
 * expects the readings for the selected range as a prop, so this wrapper owns
 * the range selection and loads the matching readings from Notion.
 */
function MetricsScreen() {
  const { accessToken } = useAppStore();
  const [rangeKind, setRangeKind] = useState<RangeKind>('week');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(rangeKind, new Date()), [rangeKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const service = new NotionService(accessToken ?? '');
      const result = await getReadings(service, ROOT_PAGE_ID, range);
      return result;
    } catch {
      return [] as Reading[];
    }
  }, [accessToken, range]);

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
      <div role="group" aria-label="Select metrics range">
        {METRICS_RANGE_OPTIONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={rangeKind === kind}
            disabled={rangeKind === kind}
            onClick={() => setRangeKind(kind)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p role="status" aria-live="polite">
          Loading
        </p>
      ) : (
        <MetricsView readings={readings} />
      )}
    </section>
  );
}

export default function App() {
  return (
    <main>
      <h1>Diabetes Insulin Tracker</h1>
      {/* Gate all recording/profile/history/metrics UI behind the Notion
          connection action (Req 1.1). Children render only once connected. */}
      <NotionConnect>
        <ConnectedApp />
      </NotionConnect>
    </main>
  );
}
