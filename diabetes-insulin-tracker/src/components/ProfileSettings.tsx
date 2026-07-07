// ProfileSettings — patient profile configuration UI.
//
// Renders a form for the three clinical parameters (Insulin-to-Carb ratio,
// Insulin Sensitivity Factor, Target Glucose), validates the entered values
// with the pure `validateProfile` domain function, persists a valid profile via
// the profile repository, and loads any stored profile on mount so the form is
// pre-populated.
//
// Persistence and loading are injected as optional props (`save`/`load`) so the
// component can be exercised in tests without a live Notion workspace. Their
// defaults wrap the real `saveProfile`/`loadProfile` repository functions using
// a `NotionService` built from the store's access token and `ROOT_PAGE_ID`.
//
// See Requirements 2.1, 2.2, 2.3, 2.4, 2.5 and design.md (ProfileSettings:
// "Enter/validate/persist profile; load on mount").

import { useEffect, useState } from 'react';
import type { PatientProfile } from '../types';
import { validateProfile } from '../domain/validation';
import { saveProfile, loadProfile } from '../services/profileRepository';
import { NotionService, ROOT_PAGE_ID } from '../services/notionService';
import { getSnapshot, setProfile, useAppStore } from '../state/appStore';

/** Injectable dependency signatures (overridable in tests). */
export type SaveProfileFn = (profile: PatientProfile) => Promise<void>;
export type LoadProfileFn = () => Promise<PatientProfile | null>;

export interface ProfileSettingsProps {
  /**
   * Persist a validated profile. Defaults to the profile repository backed by a
   * NotionService constructed from the store's access token and ROOT_PAGE_ID.
   */
  save?: SaveProfileFn;
  /**
   * Load the stored profile on mount. Defaults to the profile repository backed
   * by a NotionService constructed from the store's access token and
   * ROOT_PAGE_ID. Returns null when no profile has been stored.
   */
  load?: LoadProfileFn;
  /**
   * Optional seed profile used to pre-populate the form before/instead of the
   * asynchronous load (e.g. a value already cached in the store).
   */
  initialProfile?: PatientProfile | null;
}

/** Build a NotionService from the current store token (empty when disconnected). */
function serviceFromStore(): NotionService {
  return new NotionService(getSnapshot().accessToken ?? '');
}

/** Default persistence: repository save via a store-derived NotionService. */
const defaultSave: SaveProfileFn = (profile) =>
  saveProfile(serviceFromStore(), ROOT_PAGE_ID, profile);

/** Default load: repository read via a store-derived NotionService. */
const defaultLoad: LoadProfileFn = () =>
  loadProfile(serviceFromStore(), ROOT_PAGE_ID);

/** Convert a profile to string form-field values; blank when absent. */
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

  // Seed from an explicit initialProfile, else the cached store profile.
  const seed = initialProfile ?? cachedProfile ?? null;
  const [fields, setFields] = useState(() => toFields(seed));
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load the stored profile on mount and populate the form. A cached/seeded
  // profile is reflected immediately above; the async load refreshes it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await load();
        if (cancelled || !loaded) return;
        setProfile(loaded);
        setFields(toFields(loaded));
      } catch {
        // Load failures are non-fatal: leave the form in its seeded state.
      }
    })();
    return () => {
      cancelled = true;
    };
    // `load` is stable (prop/default); run once on mount.
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
      // Invalid: surface the message and do NOT persist. (Req 2.2, 2.3, 2.4)
      setMessage(result.message ?? 'Please enter valid profile values.');
      return;
    }

    try {
      await save(candidate); // Persist to Notion. (Req 2.1)
      setProfile(candidate); // Cache in the store. (Req 2.5)
      setMessage(null);
      setSaved(true);
    } catch {
      setMessage('Could not save your profile. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Patient profile settings">
      <h2>Patient profile</h2>

      <div>
        <label htmlFor="profile-ic-ratio">Insulin-to-carb ratio (g/unit)</label>
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
        <label htmlFor="profile-isf">Insulin sensitivity factor (mg/dL per unit)</label>
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
        <label htmlFor="profile-target-glucose">Target glucose (mg/dL)</label>
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

      <button type="submit">Save profile</button>

      {message && (
        <p role="alert" className="profile-settings__error">
          {message}
        </p>
      )}
      {saved && !message && (
        <p role="status" className="profile-settings__status">
          Profile saved.
        </p>
      )}
    </form>
  );
}

/**
 * Parse a form string to a number. Blank/whitespace yields NaN so that
 * `validateProfile` rejects empty fields with an appropriate message.
 */
function parseNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed);
}
