// QuickRecord — rapid blood glucose reading entry.
//
// Captures a Current_Glucose value, a required Meal_Tag (pre/post), and a
// timestamp (defaulting to "now" but overridable). On submit the reading is
// validated with `validateReading`; invalid input surfaces the validation
// message and nothing is persisted. On valid submit the reading is persisted
// via the readings repository (through an injectable `persist` function). If
// persistence throws, the patient is told the reading was NOT saved and the
// entered input is preserved so they can retry.
//
// Requirements: 5.1, 5.2, 5.4, 5.5, 5.6
// See design.md (components/QuickRecord.tsx) responsibilities 5.1–5.6.

import { useState } from 'react';
import type { Reading } from '../types';
import { validateReading } from '../domain/validation';
import { addReading } from '../services/readingsRepository';
import { NotionService, ROOT_PAGE_ID } from '../services/notionService';
import { useAppStore } from '../state/appStore';

/** Meal tag selection state — `''` represents "no selection yet". */
type MealTagChoice = '' | 'pre' | 'post';

export interface QuickRecordProps {
  /**
   * Persist a validated reading. Injectable so tests can supply success/failure
   * without touching Notion. Defaults to a wrapper that builds a NotionService
   * from the store's access token and calls `addReading`.
   */
  persist?: (r: Reading) => Promise<void>;
  /** Optional callback invoked with the reading after a successful persist. */
  onRecorded?: (r: Reading) => void;
}

/**
 * Convert a `datetime-local` input value (local wall-clock, no timezone) into
 * an ISO 8601 timestamp. Falls back to "now" when the value is empty/invalid.
 */
function toIsoTimestamp(localValue: string): string {
  if (!localValue) return new Date().toISOString();
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

/**
 * Produce a `datetime-local`-compatible string (`YYYY-MM-DDTHH:mm`) for the
 * given date in local time, used to seed the timestamp field with "now".
 */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function QuickRecord({ persist, onRecorded }: QuickRecordProps) {
  const { accessToken } = useAppStore();

  const [glucose, setGlucose] = useState('');
  const [mealTag, setMealTag] = useState<MealTagChoice>('');
  const [timestamp, setTimestamp] = useState(() => toLocalInputValue(new Date()));

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Default persister: build a NotionService from the token and add the reading. */
  async function defaultPersist(r: Reading): Promise<void> {
    if (!accessToken) {
      throw new Error('Not connected to Notion.');
    }
    const service = new NotionService(accessToken);
    await addReading(service, ROOT_PAGE_ID, r);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    // Parse glucose as a number; an empty/blank field becomes NaN which the
    // validator rejects with the out-of-range message.
    const glucoseValue = glucose.trim() === '' ? NaN : Number(glucose);

    const result = validateReading({ glucose: glucoseValue, mealTag });
    if (!result.valid) {
      setError(result.message ?? 'Invalid reading.');
      return;
    }

    // mealTag is guaranteed 'pre' | 'post' here since validation passed.
    const reading: Reading = {
      glucose: glucoseValue,
      mealTag: mealTag as Reading['mealTag'],
      timestamp: toIsoTimestamp(timestamp),
    };

    const doPersist = persist ?? defaultPersist;

    setSubmitting(true);
    try {
      await doPersist(reading);
      setSuccess('Reading saved.');
      onRecorded?.(reading);
      // Reset entry fields for the next reading on success.
      setGlucose('');
      setMealTag('');
      setTimestamp(toLocalInputValue(new Date()));
    } catch {
      // Requirement 5.6: notify the patient the reading was NOT saved and keep
      // the entered input so they can retry.
      setError('The reading was not saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="quick-record-heading">
      <h2 id="quick-record-heading">Record a reading</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="quick-record-glucose">Glucose (mg/dL)</label>
          <input
            id="quick-record-glucose"
            name="glucose"
            type="number"
            inputMode="numeric"
            value={glucose}
            onChange={(e) => setGlucose(e.target.value)}
          />
        </div>

        <fieldset>
          <legend>Meal tag</legend>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="pre"
              checked={mealTag === 'pre'}
              onChange={() => setMealTag('pre')}
            />
            Pre-meal
          </label>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="post"
              checked={mealTag === 'post'}
              onChange={() => setMealTag('post')}
            />
            Post-meal
          </label>
        </fieldset>

        <div>
          <label htmlFor="quick-record-timestamp">Time</label>
          <input
            id="quick-record-timestamp"
            name="timestamp"
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
          />
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save reading'}
        </button>
      </form>

      {error && (
        <p role="alert" data-testid="quick-record-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" data-testid="quick-record-success">
          {success}
        </p>
      )}
    </section>
  );
}
