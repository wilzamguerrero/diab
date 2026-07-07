// Component tests (jsdom) for connection gating, OAuth error handling, and
// profile validation messaging.
//
// Task 9.4 — verifies:
//   - Recording/gated content is unavailable before a Notion connection, and
//     appears after a successful OAuth exchange.            (Req 1.1)
//   - A failed OAuth exchange surfaces an error and remains disconnected.
//                                                           (Req 1.4)
//   - Invalid profile values surface a validation message and are NOT
//     persisted; valid values are persisted.       (Req 2.2, 2.3, 2.4)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotionConnect from './NotionConnect';
import ProfileSettings from './ProfileSettings';
import { resetStore, getSnapshot } from '../state/appStore';

const GATED_TEXT = 'Secret recording panel';

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

describe('NotionConnect — connection gating (Req 1.1)', () => {
  it('shows the connect action and hides gated children while disconnected', () => {
    render(
      <NotionConnect oauthCode={null}>
        <div>{GATED_TEXT}</div>
      </NotionConnect>,
    );

    // The connect call-to-action is present.
    expect(
      screen.getByRole('button', { name: /conectar notion/i }),
    ).toBeInTheDocument();
    // Gated content is NOT rendered pre-connection.
    expect(screen.queryByText(GATED_TEXT)).not.toBeInTheDocument();
  });

  it('renders gated children after a successful OAuth exchange', async () => {
    const exchangeCode = vi.fn(async () => ({ access_token: 'tok' }));

    render(
      <NotionConnect oauthCode="abc" exchangeCode={exchangeCode}>
        <div>{GATED_TEXT}</div>
      </NotionConnect>,
    );

    // After the mount-time exchange resolves, gated content appears.
    await waitFor(() => {
      expect(screen.getByText(GATED_TEXT)).toBeInTheDocument();
    });

    expect(exchangeCode).toHaveBeenCalledTimes(1);
    expect(getSnapshot().connected).toBe(true);
    expect(getSnapshot().accessToken).toBe('tok');
  });
});

describe('NotionConnect — OAuth error handling (Req 1.4)', () => {
  it('shows an alert and stays disconnected when the exchange returns an error', async () => {
    const exchangeCode = vi.fn(async () => ({ error: 'bad' }));

    render(
      <NotionConnect oauthCode="abc" exchangeCode={exchangeCode}>
        <div>{GATED_TEXT}</div>
      </NotionConnect>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();

    // Gated content remains hidden and the store stays disconnected.
    expect(screen.queryByText(GATED_TEXT)).not.toBeInTheDocument();
    expect(getSnapshot().connected).toBe(false);
    expect(getSnapshot().accessToken).toBeNull();
  });

  it('shows an alert and stays disconnected when the exchange rejects', async () => {
    const exchangeCode = vi.fn(async () => {
      throw new Error('network down');
    });

    render(
      <NotionConnect oauthCode="abc" exchangeCode={exchangeCode}>
        <div>{GATED_TEXT}</div>
      </NotionConnect>,
    );

    await screen.findByRole('alert');
    expect(screen.queryByText(GATED_TEXT)).not.toBeInTheDocument();
    expect(getSnapshot().connected).toBe(false);
  });
});

describe('ProfileSettings — validation messages (Req 2.2, 2.3, 2.4)', () => {
  it('shows a validation alert and does NOT persist an invalid icRatio', async () => {
    const load = vi.fn(async () => null);
    const save = vi.fn(async () => {});

    render(<ProfileSettings load={load} save={save} />);

    // Wait for the mount load to settle.
    await waitFor(() => expect(load).toHaveBeenCalled());

    // Enter invalid icRatio (<= 0), otherwise valid values.
    fireEvent.change(screen.getByLabelText(/ratio insulina-carbohidratos/i), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText(/factor de sensibilidad/i), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText(/glucosa objetivo/i), {
      target: { value: '120' },
    });

    fireEvent.click(screen.getByRole('button', { name: /guardar perfil/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('shows a validation alert and does NOT persist an out-of-range targetGlucose', async () => {
    const load = vi.fn(async () => null);
    const save = vi.fn(async () => {});

    render(<ProfileSettings load={load} save={save} />);
    await waitFor(() => expect(load).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/ratio insulina-carbohidratos/i), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(/factor de sensibilidad/i), {
      target: { value: '50' },
    });
    // 500 is outside [40, 400].
    fireEvent.change(screen.getByLabelText(/glucosa objetivo/i), {
      target: { value: '500' },
    });

    fireEvent.click(screen.getByRole('button', { name: /guardar perfil/i }));

    await screen.findByRole('alert');
    expect(save).not.toHaveBeenCalled();
  });

  it('persists a valid profile via save', async () => {
    const load = vi.fn(async () => null);
    const save = vi.fn(async () => {});

    render(<ProfileSettings load={load} save={save} />);
    await waitFor(() => expect(load).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/ratio insulina-carbohidratos/i), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText(/factor de sensibilidad/i), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText(/glucosa objetivo/i), {
      target: { value: '120' },
    });

    fireEvent.click(screen.getByRole('button', { name: /guardar perfil/i }));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    expect(save).toHaveBeenCalledWith({
      icRatio: 10,
      isf: 50,
      targetGlucose: 120,
    });
    // A success status is shown and no validation alert is present.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
