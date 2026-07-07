// QuickRecord — rapid blood glucose reading entry.
// i18n via useI18n hook, with motion animations.
// Requirements: 5.1, 5.2, 5.4, 5.5, 5.6

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, X } from 'lucide-react';
import type { Reading } from '../types';
import { validateReading } from '../domain/validation';
import { addReading } from '../services/readingsRepository';
import { uploadPhoto } from '../services/photoUpload';
import { NotionService } from '../services/notionService';
import { useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';

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
  const { t } = useI18n();

  const [glucose, setGlucose] = useState('');
  const [mealTag, setMealTag] = useState<MealTagChoice>('');
  const [timestamp, setTimestamp] = useState(() => toLocalInputValue(new Date()));
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  }

  function clearPhoto() {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function defaultPersist(r: Reading): Promise<void> {
    if (!accessToken) {
      throw new Error(t('record.notConnected'));
    }
    if (!rootPageId) {
      throw new Error(t('record.noPage'));
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
      // Map validation messages to i18n keys
      if (result.message?.includes('glucosa') || result.message?.includes('Glucose')) {
        setError(t('validation.glucoseRange'));
      } else if (result.message?.includes('etiqueta') || result.message?.includes('Meal tag')) {
        setError(t('validation.mealTag'));
      } else {
        setError(t('validation.invalidReading'));
      }
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
      // Upload photo first if selected.
      if (photoFile && accessToken) {
        setUploading(true);
        try {
          const uploadId = await uploadPhoto(photoFile, accessToken);
          reading.photoUploadId = uploadId;
        } finally {
          setUploading(false);
        }
      }

      await doPersist(reading);
      setSuccess(t('record.success'));
      onRecorded?.(reading);
      setGlucose('');
      setMealTag('');
      setNotes('');
      setTimestamp(toLocalInputValue(new Date()));
      clearPhoto();
    } catch {
      setError(t('record.error'));
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
      <h2 id="quick-record-heading">{t('record.heading')}</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="quick-record-glucose">{t('record.glucoseLabel')}</label>
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
          <legend>{t('record.mealTagLegend')}</legend>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="pre"
              checked={mealTag === 'pre'}
              onChange={() => setMealTag('pre')}
            />
            {t('record.pre')}
          </label>
          <label>
            <input
              type="radio"
              name="mealTag"
              value="post"
              checked={mealTag === 'post'}
              onChange={() => setMealTag('post')}
            />
            {t('record.post')}
          </label>
        </fieldset>

        <div>
          <label htmlFor="quick-record-timestamp">{t('record.timestampLabel')}</label>
          <input
            id="quick-record-timestamp"
            name="timestamp"
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="quick-record-notes">{t('record.notesLabel')}</label>
          <textarea
            id="quick-record-notes"
            name="notes"
            rows={2}
            placeholder={t('record.notesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical', padding: '14px 16px', borderRadius: '12px', border: '2px solid rgba(26,31,54,0.1)', font: 'inherit', fontWeight: 600, background: 'rgba(255,255,255,0.7)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <input
            ref={fileInputRef}
            id="quick-record-photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />
          <motion.button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            aria-label={t('record.photoLabel') || 'Agregar foto'}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: '2px solid rgba(26,31,54,0.15)',
              background: 'rgba(255,255,255,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Camera size={20} strokeWidth={2.2} />
          </motion.button>
          {photoPreview && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={photoPreview}
                alt="Preview"
                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '10px', border: '2px solid rgba(26,31,54,0.1)' }}
              />
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Quitar foto"
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(220,38,38,0.85)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}
          {uploading && (
            <span style={{ fontSize: '0.8rem', color: 'rgba(26,31,54,0.5)' }}>
              {t('record.uploading') || 'Subiendo...'}
            </span>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
        >
          {submitting ? t('record.submitting') : t('record.submit')}
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
