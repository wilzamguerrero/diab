// ProfileSettings — patient profile configuration UI.
// Spanish UI with motion animations.
// Requirements 2.1, 2.2, 2.3, 2.4, 2.5

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { PatientProfile } from '../types';
import { validateProfile } from '../domain/validation';
import { saveProfile, loadProfile } from '../services/profileRepository';
import { NotionService } from '../services/notionService';
import { getSnapshot, setProfile, useAppStore } from '../state/appStore';

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
      setMessage(result.message ?? 'Por favor, ingresa valores válidos de perfil.');
      return;
    }

    try {
      await save(candidate);
      setProfile(candidate);
      setMessage(null);
      setSaved(true);
    } catch {
      setMessage('No se pudo guardar tu perfil. Intenta de nuevo.');
    }
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      aria-label="Configuración del perfil del paciente"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <h2>Perfil del paciente</h2>

      <div>
        <label htmlFor="profile-ic-ratio">Ratio insulina-carbohidratos (g/unidad)</label>
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
        <label htmlFor="profile-isf">Factor de sensibilidad a insulina (mg/dL por unidad)</label>
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
        <label htmlFor="profile-target-glucose">Glucosa objetivo (mg/dL)</label>
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
        Guardar perfil
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
          Perfil guardado.
        </motion.p>
      )}
    </motion.form>
  );
}

function parseNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed);
}
