// Component tests for QuickRecord — validation rejection and persist-failure notice.
//
// Verifies (Requirements 5.4, 5.5, 5.6):
//   - Out-of-range glucose is rejected with a role="alert" message and no persist.
//   - A missing meal tag is rejected with a validation message and no persist.
//   - A persist failure surfaces a "not saved" role="alert" and preserves input.
//   - A successful persist calls the persister with the entered reading and
//     shows a role="status" success message.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickRecord from './QuickRecord';
import type { Reading } from '../types';
import { resetStore } from '../state/appStore';

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

describe('QuickRecord validation and persist-failure notice', () => {
  it('rejects an out-of-range glucose value without persisting (Req 5.4)', async () => {
    const user = userEvent.setup();
    const persist = vi.fn<(r: Reading) => Promise<void>>().mockResolvedValue(undefined);

    render(<QuickRecord persist={persist} />);

    await user.type(screen.getByLabelText(/glucose \(mg\/dL\)/i), '999');
    await user.click(screen.getByRole('radio', { name: /pre-meal/i }));
    await user.click(screen.getByRole('button', { name: /save reading/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/glucose must be between 20 and 600/i);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects a submission with no meal tag selected without persisting (Req 5.5)', async () => {
    const user = userEvent.setup();
    const persist = vi.fn<(r: Reading) => Promise<void>>().mockResolvedValue(undefined);

    render(<QuickRecord persist={persist} />);

    await user.type(screen.getByLabelText(/glucose \(mg\/dL\)/i), '120');
    // Deliberately leave the meal tag radios unselected.
    await user.click(screen.getByRole('button', { name: /save reading/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/meal tag must be either "pre" or "post"/i);
    expect(persist).not.toHaveBeenCalled();
  });

  it('shows a not-saved notice and preserves input when persistence fails (Req 5.6)', async () => {
    const user = userEvent.setup();
    const persist = vi
      .fn<(r: Reading) => Promise<void>>()
      .mockRejectedValue(new Error('network down'));

    render(<QuickRecord persist={persist} />);

    const glucoseInput = screen.getByLabelText(/glucose \(mg\/dL\)/i) as HTMLInputElement;
    await user.type(glucoseInput, '120');
    await user.click(screen.getByRole('radio', { name: /post-meal/i }));
    await user.click(screen.getByRole('button', { name: /save reading/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/the reading was not saved/i);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    // Input is preserved so the patient can retry.
    expect(glucoseInput.value).toBe('120');
  });

  it('persists a valid reading and shows a success status (Req 5.6 success path)', async () => {
    const user = userEvent.setup();
    const persist = vi.fn<(r: Reading) => Promise<void>>().mockResolvedValue(undefined);

    render(<QuickRecord persist={persist} />);

    await user.type(screen.getByLabelText(/glucose \(mg\/dL\)/i), '120');
    await user.click(screen.getByRole('radio', { name: /pre-meal/i }));
    await user.click(screen.getByRole('button', { name: /save reading/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/reading saved/i);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    const reading = persist.mock.calls[0][0];
    expect(reading.glucose).toBe(120);
    expect(reading.mealTag).toBe('pre');
    expect(typeof reading.timestamp).toBe('string');
  });
});
