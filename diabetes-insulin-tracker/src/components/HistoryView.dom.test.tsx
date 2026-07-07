// Component tests for HistoryView (jsdom environment).
//
// Feature: diabetes-insulin-tracker, Property 16: History row rendering completeness
//
// Validates: Requirements 6.2, 6.3, 6.4
//   6.2 loading indicator shown while retrieving
//   6.3 empty-state message when no readings fall in range
//   6.4 each rendered reading includes its glucose value, meal tag, and timestamp

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import fc from 'fast-check';
import HistoryView from './HistoryView';
import type { DateRange, Reading } from '../types';

afterEach(() => {
  cleanup();
});

/** A loader that never resolves, so the loading indicator stays visible. */
const pendingLoader = (_range: DateRange): Promise<Reading[]> =>
  new Promise<Reading[]>(() => {
    /* never resolves */
  });

describe('HistoryView (jsdom environment)', () => {
  it('shows the loading indicator while readings are being retrieved (Req 6.2)', () => {
    render(<HistoryView fetchReadings={pendingLoader} />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/cargando/i);
  });

  it('shows the empty-state message when no readings fall in range (Req 6.3)', async () => {
    render(<HistoryView fetchReadings={async () => []} />);
    await waitFor(() =>
      expect(
        screen.getByText(/no se encontraron lecturas para el rango seleccionado/i),
      ).toBeInTheDocument(),
    );
  });

  it('renders each reading with its glucose value, meal tag, and timestamp (Req 6.4)', async () => {
    const readings: Reading[] = [
      { glucose: 95, mealTag: 'pre', timestamp: '2024-01-15T08:30:00.000Z' },
      { glucose: 142, mealTag: 'post', timestamp: '2024-01-15T13:05:00.000Z' },
      { glucose: 210, mealTag: 'post', timestamp: '2024-06-02T19:45:00.000Z' },
      { glucose: 60, mealTag: 'pre', timestamp: '2024-12-31T23:59:00.000Z' },
    ];

    render(<HistoryView fetchReadings={async () => readings} />);

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(readings.length);

    readings.forEach((reading, index) => {
      const row = items[index];
      // glucose value
      expect(row).toHaveTextContent(`${reading.glucose} mg/dL`);
      // meal tag label
      expect(row).toHaveTextContent(
        reading.mealTag === 'pre' ? 'Pre-comida' : 'Post-comida',
      );
      // timestamp: assert on the <time> element's machine-readable dateTime,
      // which is robust to locale-specific formatting of the visible text.
      const timeEl = row.querySelector('time');
      expect(timeEl).not.toBeNull();
      expect(timeEl).toHaveAttribute('dateTime', reading.timestamp);
    });
  });

  it('Property 16: for any non-empty set of readings, every reading\'s glucose value, meal tag, and timestamp are rendered (Req 6.4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            glucose: fc.integer({ min: 20, max: 600 }),
            mealTag: fc.constantFrom<'pre' | 'post'>('pre', 'post'),
            // distinct ISO timestamps within a plausible range
            timestamp: fc
              .date({
                min: new Date('2000-01-01T00:00:00.000Z'),
                max: new Date('2100-01-01T00:00:00.000Z'),
              })
              .map((d) => d.toISOString()),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (readings) => {
          cleanup();
          render(<HistoryView fetchReadings={async () => readings} />);

          await waitFor(() =>
            expect(screen.getByRole('list')).toBeInTheDocument(),
          );

          const items = screen.getAllByRole('listitem');
          expect(items).toHaveLength(readings.length);

          readings.forEach((reading, index) => {
            const row = items[index];
            const scoped = within(row);
            // glucose value present
            expect(
              scoped.getByText(new RegExp(`${reading.glucose}\\s*mg/dL`)),
            ).toBeInTheDocument();
            // meal tag label present
            expect(
              scoped.getByText(
                reading.mealTag === 'pre' ? 'Pre-comida' : 'Post-comida',
              ),
            ).toBeInTheDocument();
            // timestamp present via <time dateTime>
            const timeEl = row.querySelector('time');
            expect(timeEl).not.toBeNull();
            expect(timeEl).toHaveAttribute('dateTime', reading.timestamp);
          });
        },
      ),
      { numRuns: 25 },
    );
  });
});
