// HistoryView component.
//
// Lets the patient browse recorded readings by day, week, month, or year.
// A range selector drives a fetch of the readings that fall within the selected
// range (computed via `rangeFor(kind, now)`); while retrieving, a loading
// indicator is shown; when the range holds no readings, an empty-state message
// is shown; otherwise each reading is rendered with its glucose value, meal tag,
// and a formatted timestamp.
//
// The data source is injectable via the optional `fetchReadings` prop so the
// component can be tested with a fake (including a never-resolving promise to
// assert the loading indicator). By default it builds a `NotionService` from the
// active access token in the app store and calls `getReadings`.
//
// See design.md ("HistoryView") and Requirements 6.1–6.5.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange, RangeKind, Reading } from '../types';
import { rangeFor } from '../domain/history';
import { getReadings } from '../services/readingsRepository';
import { NotionService, ROOT_PAGE_ID } from '../services/notionService';
import { useAppStore } from '../state/appStore';

/** Function that loads the readings for a given date range. */
export type FetchReadings = (range: DateRange) => Promise<Reading[]>;

export interface HistoryViewProps {
  /**
   * Optional loader for readings in a range. Defaults to a wrapper that builds
   * a `NotionService` from the store's access token and calls `getReadings`.
   * Tests may inject a fake (e.g. a pending promise to observe the loading UI).
   */
  fetchReadings?: FetchReadings;
  /** Notion root page id. Defaults to the configured `ROOT_PAGE_ID`. */
  rootPageId?: string;
  /** Anchor date used to compute ranges. Defaults to the current time. */
  anchor?: Date;
  /** Initial range granularity. Defaults to `'day'`. */
  initialRange?: RangeKind;
}

const RANGE_OPTIONS: { kind: RangeKind; label: string }[] = [
  { kind: 'day', label: 'Day' },
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
];

type LoadStatus = 'loading' | 'loaded' | 'error';

/** Format an ISO timestamp for display, falling back to the raw value. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function HistoryView({
  fetchReadings,
  rootPageId = ROOT_PAGE_ID,
  anchor,
  initialRange = 'day',
}: HistoryViewProps) {
  const { accessToken } = useAppStore();
  const [range, setRange] = useState<RangeKind>(initialRange);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Default loader: build a NotionService from the active token and query the
  // readings repository. Memoized so it is stable across renders unless the
  // token or root page changes.
  const defaultFetch = useCallback<FetchReadings>(
    (dateRange) => {
      const service = new NotionService(accessToken ?? '');
      return getReadings(service, rootPageId, dateRange);
    },
    [accessToken, rootPageId],
  );

  const loader = fetchReadings ?? defaultFetch;

  // Recompute the concrete range whenever the granularity or anchor changes.
  const anchorTime = anchor ? anchor.getTime() : undefined;
  const activeRange = useMemo(
    () => rangeFor(range, anchor ?? new Date()),
    // `anchorTime` captures the anchor's identity for the dependency check.
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
    <section aria-label="Reading history">
      <div role="group" aria-label="Select time range">
        {RANGE_OPTIONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={range === kind}
            disabled={range === kind}
            onClick={() => setRange(kind)}
          >
            {label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <p role="status" aria-live="polite">
          Loading
        </p>
      )}

      {status === 'error' && (
        <p role="alert">Unable to load readings: {error}</p>
      )}

      {status === 'loaded' && readings.length === 0 && (
        <p>No readings found for the selected range.</p>
      )}

      {status === 'loaded' && readings.length > 0 && (
        <ul>
          {readings.map((reading, index) => (
            <li key={`${reading.timestamp}-${index}`}>
              <span>{reading.glucose} mg/dL</span>
              <span>{reading.mealTag === 'pre' ? 'Pre-meal' : 'Post-meal'}</span>
              <time dateTime={reading.timestamp}>
                {formatTimestamp(reading.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default HistoryView;
