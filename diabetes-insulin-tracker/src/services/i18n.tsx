// i18n service for the Diabetes Insulin Tracker.
// React context + provider pattern with localStorage persistence.
// Supports 'es' (Spanish, default) and 'en' (English).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { dictionaries } from './translations';
import type { Locale } from './translations';

export type { Locale };
// Keep backward-compat type alias used by ProfileSettings and other consumers.
export type Lang = Locale;

const STORAGE_KEY = 'dit:locale';

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch { /* ignore */ }
  return null;
}

function readPersistedLocale(): Locale {
  const storage = getStorage();
  if (!storage) return 'es';
  try {
    const v = storage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'es') return v;
  } catch { /* ignore */ }
  return 'es';
}

function persistLocale(locale: Locale): void {
  const storage = getStorage();
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
}

// ── Context ──────────────────────────────────────────────────────────

export interface I18nContextValue {
  t: (key: string) => string;
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Alias for locale — backward compat */
  lang: Locale;
  /** Alias for setLocale — backward compat */
  setLang: (l: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function I18nProvider({ children, defaultLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => defaultLocale ?? readPersistedLocale());

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    persistLocale(l);
  }, []);

  // Sync if external storage changes (e.g. another tab)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && (e.newValue === 'es' || e.newValue === 'en')) {
        setLocaleState(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const t = useCallback(
    (key: string): string => dictionaries[locale][key] ?? key,
    [locale],
  );

  const value: I18nContextValue = {
    t,
    locale,
    setLocale,
    lang: locale,
    setLang: setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * React hook providing translation function and locale switching.
 * Must be used within an <I18nProvider>.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an <I18nProvider>');
  }
  return ctx;
}

// ── Standalone t function (for use outside React) ────────────────────

/** Translate a key using the currently persisted locale. For use outside React trees. */
export function t(key: string): string {
  const locale = readPersistedLocale();
  return dictionaries[locale][key] ?? key;
}
