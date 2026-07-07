import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSnapshot,
  subscribe,
  setConnection,
  disconnect,
  setProfile,
  acknowledgeDisclaimer,
  resetStore,
} from './appStore';
import type { PatientProfile } from '../types';

describe('appStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('starts disconnected with no profile and no acknowledgment', () => {
    const s = getSnapshot();
    expect(s.connected).toBe(false);
    expect(s.accessToken).toBeNull();
    expect(s.profile).toBeNull();
    expect(s.disclaimerAcknowledged).toBe(false);
  });

  it('setConnection marks connected, stores the token, and persists it', () => {
    setConnection('tok-123');
    const s = getSnapshot();
    expect(s.connected).toBe(true);
    expect(s.accessToken).toBe('tok-123');
    expect(localStorage.getItem('dit:accessToken')).toBe('tok-123');
  });

  it('disconnect clears connection, token, and cached profile', () => {
    const profile: PatientProfile = { icRatio: 10, isf: 50, targetGlucose: 120 };
    setConnection('tok-123');
    setProfile(profile);

    disconnect();

    const s = getSnapshot();
    expect(s.connected).toBe(false);
    expect(s.accessToken).toBeNull();
    expect(s.profile).toBeNull();
    expect(localStorage.getItem('dit:accessToken')).toBeNull();
  });

  it('setProfile caches the profile without touching connection state', () => {
    const profile: PatientProfile = { icRatio: 12, isf: 45, targetGlucose: 110 };
    setProfile(profile);
    expect(getSnapshot().profile).toEqual(profile);
    expect(getSnapshot().connected).toBe(false);
  });

  it('acknowledgeDisclaimer records and persists the acknowledgment', () => {
    acknowledgeDisclaimer();
    expect(getSnapshot().disclaimerAcknowledged).toBe(true);
    expect(localStorage.getItem('dit:disclaimerAcknowledged')).toBe('true');
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });

    setConnection('tok-123');
    expect(calls).toBe(1);

    unsub();
    setProfile({ icRatio: 8, isf: 40, targetGlucose: 100 });
    expect(calls).toBe(1);
  });
});
