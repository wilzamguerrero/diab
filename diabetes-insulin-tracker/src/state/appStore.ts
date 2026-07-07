// Lightweight, dependency-free application state store.
//
// Tracks the cross-cutting UI state that several components need to share:
//   - Notion connection state (connected + access token)
//   - the cached Patient_Profile
//   - the first-use Medical_Disclaimer acknowledgment
//
// The store is a tiny observable built on the subscribe/getSnapshot contract so
// it can drive React via `useSyncExternalStore` without pulling in an external
// state library. `disclaimerAcknowledged` and the access token are persisted to
// localStorage (when available) so the first-use acknowledgment and an active
// session survive a page reload. All localStorage access is guarded so the
// module works in non-browser/test environments.
//
// See Requirements 1.1 (present a connection action before recording) and
// 8.3 (require first-use disclaimer acknowledgment), and design.md
// (state/appStore.ts: "Connection state, access token, cached profile,
// first-use acknowledgment").

import { useSyncExternalStore } from 'react';
import type { PatientProfile } from '../types';

/** Configuration for glucose measurement reminders. */
export interface ReminderConfig {
  enabled: boolean;
  intervalHours: number;
  lastNotified?: string;
}

/** Immutable snapshot of the application state. */
export interface AppState {
  /** Whether a Notion workspace is currently connected. */
  connected: boolean;
  /** The active Notion access token, or null when disconnected. */
  accessToken: string | null;
  /**
   * The Notion page selected as the data root, or null when none has been
   * chosen yet. The patient profile and per-year databases live under this
   * page. Chosen via the page selector after connecting (mirrors oldproject).
   */
  rootPageId: string | null;
  /** The most recently loaded Patient_Profile, or null when unknown. */
  profile: PatientProfile | null;
  /** Whether the first-use Medical_Disclaimer has been acknowledged. */
  disclaimerAcknowledged: boolean;
  /** Glucose measurement reminder configuration. */
  reminders: ReminderConfig;
}

type Listener = () => void;

const TOKEN_STORAGE_KEY = 'dit:accessToken';
const DISCLAIMER_STORAGE_KEY = 'dit:disclaimerAcknowledged';
const ROOT_PAGE_STORAGE_KEY = 'dit:rootPageId';
const REMINDERS_STORAGE_KEY = 'dit:reminders';

/**
 * Safely obtain the localStorage instance, or null when it is unavailable
 * (server-side rendering, tests without jsdom, privacy-restricted browsers).
 */
function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies); treat as absent.
  }
  return null;
}

function readPersistedToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readPersistedDisclaimer(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(DISCLAIMER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistToken(token: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (token === null) {
      storage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      storage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // Best-effort persistence; ignore write failures (e.g. quota exceeded).
  }
}

function persistDisclaimer(acknowledged: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DISCLAIMER_STORAGE_KEY, acknowledged ? 'true' : 'false');
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function readPersistedRootPage(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(ROOT_PAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistRootPage(rootPageId: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (rootPageId === null) {
      storage.removeItem(ROOT_PAGE_STORAGE_KEY);
    } else {
      storage.setItem(ROOT_PAGE_STORAGE_KEY, rootPageId);
    }
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function readPersistedReminders(): ReminderConfig {
  const storage = getStorage();
  if (!storage) return { enabled: false, intervalHours: 4 };
  try {
    const raw = storage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return { enabled: false, intervalHours: 4 };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      intervalHours: typeof parsed.intervalHours === 'number' ? parsed.intervalHours : 4,
      lastNotified: parsed.lastNotified ?? undefined,
    };
  } catch {
    return { enabled: false, intervalHours: 4 };
  }
}

function persistReminders(config: ReminderConfig): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function createInitialState(): AppState {
  const accessToken = readPersistedToken();
  return {
    connected: accessToken !== null,
    accessToken,
    rootPageId: readPersistedRootPage(),
    profile: null,
    disclaimerAcknowledged: readPersistedDisclaimer(),
    reminders: readPersistedReminders(),
  };
}

let state: AppState = createInitialState();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Replace the current state and notify subscribers (no-op if unchanged). */
function setState(next: AppState): void {
  if (next === state) return;
  state = next;
  emit();
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Return the current immutable state snapshot. */
export function getSnapshot(): AppState {
  return state;
}

// ── Actions ─────────────────────────────────────────────────────────

/**
 * Mark the app as connected with the given Notion access token.
 * Persists the token so the session survives a reload.
 * See Requirement 1.1.
 */
export function setConnection(token: string): void {
  persistToken(token);
  setState({ ...state, connected: true, accessToken: token });
}

/**
 * Clear the connection and access token (e.g. on OAuth failure or sign-out).
 * The cached profile is cleared as it belongs to the disconnected workspace.
 * See Requirement 1.4.
 */
export function disconnect(): void {
  persistToken(null);
  persistRootPage(null);
  setState({ ...state, connected: false, accessToken: null, rootPageId: null, profile: null });
}

/**
 * Select (or clear) the Notion page used as the data root. Persisted so the
 * choice survives a reload.
 */
export function setRootPage(rootPageId: string | null): void {
  persistRootPage(rootPageId);
  setState({ ...state, rootPageId });
}

/** Cache (or clear) the loaded Patient_Profile. See Requirement 2.5. */
export function setProfile(profile: PatientProfile | null): void {
  setState({ ...state, profile });
}

/**
 * Record acknowledgment of the first-use Medical_Disclaimer. Persisted so the
 * gate is not shown again on subsequent visits. See Requirement 8.3.
 */
export function acknowledgeDisclaimer(): void {
  if (state.disclaimerAcknowledged) return;
  persistDisclaimer(true);
  setState({ ...state, disclaimerAcknowledged: true });
}

/**
 * Update the reminder configuration. Persisted to localStorage.
 */
export function setReminders(config: ReminderConfig): void {
  persistReminders(config);
  setState({ ...state, reminders: config });
}

/**
 * Reset the entire store to a fresh initial state, clearing persisted values.
 * Intended for tests and full sign-out flows.
 */
export function resetStore(): void {
  persistToken(null);
  persistDisclaimer(false);
  persistRootPage(null);
  persistReminders({ enabled: false, intervalHours: 4 });
  setState({
    connected: false,
    accessToken: null,
    rootPageId: null,
    profile: null,
    disclaimerAcknowledged: false,
    reminders: { enabled: false, intervalHours: 4 },
  });
}

// ── React binding ───────────────────────────────────────────────────

/**
 * React hook returning the current application state. Re-renders the calling
 * component whenever any part of the state changes.
 */
export function useAppStore(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
