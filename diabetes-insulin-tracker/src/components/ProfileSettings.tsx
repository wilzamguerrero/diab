// ProfileSettings — patient profile configuration UI + language selector.
// i18n via useI18n hook, with motion animations.
// Requirements 2.1, 2.2, 2.3, 2.4, 2.5

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bell, BellOff, Clock, LogOut, RefreshCw } from 'lucide-react';
import type { PatientProfile } from '../types';
import { validateProfile } from '../domain/validation';
import { saveProfile, loadProfile } from '../services/profileRepository';
import { NotionService } from '../services/notionService';
import { getSnapshot, setProfile, setReminders, setRootPage, disconnect, useAppStore } from '../state/appStore';
import { useI18n } from '../services/i18n';
import { requestNotificationPermission } from '../services/reminderService';
import type { Lang } from '../services/i18n';

export type SaveProfileFn = (profile: PatientProfile) => Promise<void>;
export type LoadProfileFn = () => Promise<PatientProfile | null>;

export interface ProfileSettingsProps {
  save?: SaveProfileFn;
  load?: LoadProfileFn;
  initialProfile?: PatientProfile | null;
}

function serviceFromStore(): NotionService {
  return new NotionService(getSnapshot().accessToken ?? '');
}

function rootFromStore(): string {
  return getSnapshot().rootPageId ?? '';
}

const defaultSave: SaveProfileFn = (profile) =>
  saveProfile(serviceFromStore(), rootFromStore(), profile);

const defaultLoad: LoadProfileFn = () =>
  loadProfile(serviceFromStore(), rootFromStore());

function toFields(profile: PatientProfile | null | undefined): {
  icRatio: string;
  isf: string;
  targetGlucose: string;
} {
  return {
    icRatio: profile ? String(profile.icRatio) : '',
    isf: profile ? String(profile.isf) : '',
    targetGlucose: profile ? String(profile.targetGlucose) : '',
  };
}

export default function ProfileSettings({
  save = defaultSave,
  load = defaultLoad,
  initialProfile,
}: ProfileSettingsProps) {
  const { profile: cachedProfile } = useAppStore();
  const { t, lang, setLang } = useI18n();

  const seed = initialProfile ?? cachedProfile ?? null;
  const [fields, setFields] = useState(() => toFields(seed));
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await load();
        if (cancelled || !loaded) return;
        setProfile(loaded);
        setFields(toFields(loaded));
      } catch {
        // Load failures are non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(name: keyof typeof fields, value: string): void {
    setFields((prev) => ({ ...prev, [name]: value }));
    setMessage(null);
    setSaved(false);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaved(false);

    const candidate: PatientProfile = {
      icRatio: parseNumber(fields.icRatio),
      isf: parseNumber(fields.isf),
      targetGlucose: parseNumber(fields.targetGlucose),
    };

    const result = validateProfile(candidate);
    if (!result.valid) {
      // Map validation results to i18n keys
      if (result.message?.includes('insulina-carbohidratos') || result.message?.includes('insulin-to-carb')) {
        setMessage(t('validation.icRatio'));
      } else if (result.message?.includes('sensibilidad') || result.message?.includes('sensitivity')) {
        setMessage(t('validation.isf'));
      } else if (result.message?.includes('glucosa objetivo') || result.message?.includes('Target glucose')) {
        setMessage(t('validation.targetGlucose'));
      } else {
        setMessage(t('profile.invalidDefault'));
      }
      return;
    }

    try {
      await save(candidate);
      setProfile(candidate);
      setMessage(null);
      setSaved(true);
    } catch {
      setMessage(t('profile.saveError'));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <form
        onSubmit={handleSubmit}
        aria-label={t('profile.heading')}
      >
        <h2>{t('profile.heading')}</h2>

        <div>
          <label htmlFor="profile-ic-ratio">{t('profile.icRatio')}</label>
          <input
            id="profile-ic-ratio"
            name="icRatio"
            type="number"
            step="any"
            inputMode="decimal"
            value={fields.icRatio}
            onChange={(e) => updateField('icRatio', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="profile-isf">{t('profile.isf')}</label>
          <input
            id="profile-isf"
            name="isf"
            type="number"
            step="any"
            inputMode="decimal"
            value={fields.isf}
            onChange={(e) => updateField('isf', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="profile-target-glucose">{t('profile.targetGlucose')}</label>
          <input
            id="profile-target-glucose"
            name="targetGlucose"
            type="number"
            step="any"
            inputMode="decimal"
            value={fields.targetGlucose}
            onChange={(e) => updateField('targetGlucose', e.target.value)}
          />
        </div>

        <motion.button
          type="submit"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
        >
          {t('profile.save')}
        </motion.button>

        {message && (
          <motion.p
            role="alert"
            className="profile-settings__error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {message}
          </motion.p>
        )}
        {saved && !message && (
          <motion.p
            role="status"
            className="profile-settings__status"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {t('profile.saved')}
          </motion.p>
        )}
      </form>

      {/* Language selector */}
      <section aria-label={t('lang.label')} style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid rgba(26,31,54,0.08)' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>{t('lang.label')}</h3>
        <div role="group" aria-label={t('lang.label')} style={{ display: 'flex', gap: '0.5rem' }}>
          {(['es', 'en'] as const).map((code) => (
            <motion.button
              key={code}
              type="button"
              aria-pressed={lang === code}
              disabled={lang === code}
              onClick={() => setLang(code as Lang)}
              whileTap={{ scale: 0.92 }}
            >
              {t(`lang.${code}`)}
            </motion.button>
          ))}
        </div>
      </section>

      {/* Reminders */}
      <ReminderSettings />

      {/* Session / page management */}
      <SessionActions />
    </motion.div>
  );
}

function ReminderSettings() {
  const { reminders } = useAppStore();
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function handleToggle() {
    if (!reminders.enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      setReminders({ ...reminders, enabled: true });
    } else {
      setReminders({ ...reminders, enabled: false });
    }
  }

  function handleIntervalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(e.target.value);
    if (value > 0) {
      setReminders({ ...reminders, intervalHours: value });
    }
  }

  return (
    <section aria-label="Recordatorios" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid rgba(26,31,54,0.08)' }}>
      <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {reminders.enabled ? <Bell size={18} /> : <BellOff size={18} />}
        Recordatorios
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <motion.button
          type="button"
          onClick={handleToggle}
          whileTap={{ scale: 0.92 }}
          style={{
            background: reminders.enabled ? '#4ade80' : 'rgba(26,31,54,0.08)',
            color: reminders.enabled ? '#1a1f36' : 'rgba(26,31,54,0.6)',
            padding: '10px 18px',
            borderRadius: '999px',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          {reminders.enabled ? 'Activado' : 'Desactivado'}
        </motion.button>
      </div>

      {permissionDenied && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: '0.82rem', color: '#ff6b6b', margin: '8px 0' }}
        >
          Permiso de notificaciones denegado. Habilítalo en la configuración del navegador.
        </motion.p>
      )}

      {reminders.enabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={{ marginTop: '12px' }}
        >
          <label htmlFor="reminder-interval" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} />
            Intervalo (horas)
          </label>
          <input
            id="reminder-interval"
            type="number"
            min="1"
            max="24"
            step="1"
            value={reminders.intervalHours}
            onChange={handleIntervalChange}
            style={{ width: '100px' }}
          />
          <p style={{ fontSize: '0.78rem', color: 'rgba(26,31,54,0.5)', marginTop: '8px' }}>
            Recibirás un recordatorio cada {reminders.intervalHours} {reminders.intervalHours === 1 ? 'hora' : 'horas'} para medir tu glucosa.
          </p>
        </motion.div>
      )}
    </section>
  );
}

function parseNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed);
}

function SessionActions() {

  function handleChangePage() {
    // Clear rootPageId to go back to page selector without logging out
    setRootPage(null);
  }

  function handleLogout() {
    // Full disconnect: clear token, root page, profile
    disconnect();
  }

  return (
    <section aria-label="Sesión" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid rgba(26,31,54,0.08)' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Sesión</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <motion.button
          type="button"
          onClick={handleChangePage}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(26,31,54,0.06)',
            color: '#1a1f36',
            border: '1px solid rgba(26,31,54,0.12)',
            padding: '12px 18px',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.9rem',
            justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} /> Cambiar página de Notion
        </motion.button>
        <motion.button
          type="button"
          onClick={handleLogout}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(220,38,38,0.08)',
            color: '#dc2626',
            border: '1px solid rgba(220,38,38,0.2)',
            padding: '12px 18px',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.9rem',
            justifyContent: 'center',
          }}
        >
          <LogOut size={16} /> Cerrar sesión
        </motion.button>
      </div>
    </section>
  );
}
