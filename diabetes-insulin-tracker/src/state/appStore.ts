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

/** Immutable snapshot of the application state. */
export interface AppState {
  /** Whether a Notion workspace is currently connected. */
  connected: boolean;
  /** The active Notion access token, or null when disconnected. */
  accessToken: string | null;
  /** The most recently loaded Patient_Profile, or null when unknown. */
  profile: PatientProfile | null;
  /** Whether the first-use Medical_Disclaimer has been acknowledged. */
  disclaimerAcknowledged: boolean;
}

type Listener = () => void;

const TOKEN_STORAGE_KEY = 'dit:accessToken';
const DISCLAIMER_STORAGE_KEY = 'dit:disclaimerAcknowledged';

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

function createInitialState(): AppState {
  const accessToken = readPersistedToken();
  return {
    connected: accessToken !== null,
    accessToken,
    profile: null,
    disclaimerAcknowledged: readPersistedDisclaimer(),
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
  setState({ ...state, connected: false, accessToken: null, profile: null });
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
 * Reset the entire store to a fresh initial state, clearing persisted values.
 * Intended for tests and full sign-out flows.
 */
export function resetStore(): void {
  persistToken(null);
  persistDisclaimer(false);
  setState({
    connected: false,
    accessToken: null,
    profile: null,
    disclaimerAcknowledged: false,
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
