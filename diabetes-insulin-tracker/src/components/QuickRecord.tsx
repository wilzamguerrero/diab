// QuickRecord — rapid blood glucose reading entry.
// Spanish UI with motion animations.
// Requirements: 5.1, 5.2, 5.4, 5.5, 5.6

import { useState } from 'react';
import { motion } from 'motion/react';
import type { Reading } from '../types';
import { validateReading } from '../domain/validation';
import { addReading } from '../services/readingsRepository';
import { NotionService } from '../services/notionService';
import { useAppStore } from '../state/appStore';

type MealTagChoice = '' | 'pre' | 'post';

export interface QuickRecordProps {
  persist?: (r: Reading) => Promise<void>;
  onRecorded?: (r: Reading) => void;
}

function toIsoTimestamp(localValue: string): string {
  if (!localValue) return new Date().toISOString();
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

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
  const { accessToken, rootPageId } = useAppStore();

  const [glucose, setGlucose] = useState('');
  const [mealTag, setMealTag] = useState<MealTagChoice>('');
  const [timestamp, setTimestamp] = useState(() => toLocalInputValue(new Date()));
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function defaultPersist(r: Reading): Promise<void> {
    if (!accessToken) {
      throw new Error('No conectado a Notion.');
    }
    if (!rootPageId) {
      throw new Error('No se ha seleccionado una página de Notion.');
    }
    const service = new NotionService(accessToken);
    await addReading(service, rootPageId, r);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const glucoseValue = glucose.trim() === '' ? NaN : Number(glucose);

    const result = validateReading({ glucose: glucoseValue, mealTag });
    if (!result.valid) {
      setError(result.message ?? 'Lectura inválida.');
      return;
    }

    const reading: Reading = {
      glucose: glucoseValue,
      mealTag: mealTag as Reading['mealTag'],
      timestamp: toIsoTimestamp(timestamp),
      notes: notes.trim() || undefined,
    };

    const doPersist = persist ?? defaultPersist;

    setSubmitting(true);
    try {
      await doPersist(reading);
      setSuccess('Lectura guardada.');
      onRecorded?.(reading);
      setGlucose('');
      setMealTag('');
      setNotes('');
      setTimestamp(toLocalInputValue(new Date()));
    } catch {
      setError('La lectura no se guardó. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.section
      aria-labelledby="quick-record-heading"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <h2 id="quick-record-heading">Registrar una lectura</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="quick-record-glucose">Glucosa (mg/dL)</label>
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
          <legend>Etiqueta de comida</legend>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="pre"
              checked={mealTag === 'pre'}
              onChange={() => setMealTag('pre')}
            />
            Pre-comida
          </label>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="post"
              checked={mealTag === 'post'}
              onChange={() => setMealTag('post')}
            />
            Post-comida
          </label>
        </fieldset>

        <div>
          <label htmlFor="quick-record-timestamp">Hora</label>
          <input
            id="quick-record-timestamp"
            name="timestamp"
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="quick-record-notes">Observaciones (opcional)</label>
          <textarea
            id="quick-record-notes"
            name="notes"
            rows={2}
            placeholder="Alimentación, actividad, cómo te sientes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical', padding: '14px 16px', borderRadius: '12px', border: '2px solid rgba(26,31,54,0.1)', font: 'inherit', fontWeight: 600, background: 'rgba(255,255,255,0.7)' }}
          />
        </div>

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
        >
          {submitting ? 'Guardando…' : 'Guardar lectura'}
        </motion.button>
      </form>

      {error && (
        <motion.p
          role="alert"
          data-testid="quick-record-error"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.p>
      )}
      {success && (
        <motion.p
          role="status"
          data-testid="quick-record-success"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {success}
        </motion.p>
      )}
    </motion.section>
  );
}
