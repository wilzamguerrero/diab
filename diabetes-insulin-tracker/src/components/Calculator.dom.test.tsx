// Component tests (jsdom) for the Calculator's medical-safety gating.
//
// Task 10.4 — verifies:
//   - The Medical_Disclaimer is always visible.                     (Req 8.1)
//   - The presented dose is labelled as a suggestion requiring
//     validation.                                            (Req 3.4, 8.2)
//   - Property 7: Confirmation required before recording — onRecord is not
//     invoked until the confirm button is clicked.                  (Req 3.5)
//   - Property 8: First-use acknowledgment gate — no dose is presented until
//     the disclaimer is acknowledged on first use.            (Req 8.3, 8.1)
//
// Validates: Requirements 3.5, 8.3, 3.4, 8.1, 8.2

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Calculator, { MEDICAL_DISCLAIMER } from './Calculator';
import { resetStore } from '../state/appStore';
import type { PatientProfile } from '../types';

// A valid profile so that calculateDose returns a dose once glucose is entered.
const VALID_PROFILE: PatientProfile = {
  icRatio: 10,
  isf: 50,
  targetGlucose: 120,
};

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

describe('Calculator — disclaimer visibility (Req 8.1)', () => {
  it('always renders the Medical_Disclaimer with the disclaimer text', () => {
    render(<Calculator profile={VALID_PROFILE} />);

    const disclaimer = screen.getByTestId('medical-disclaimer');
    expect(disclaimer).toBeInTheDocument();
    expect(disclaimer).toHaveAttribute('role', 'note');
    expect(disclaimer).toHaveTextContent(MEDICAL_DISCLAIMER);
    expect(disclaimer.textContent).toMatch(/not medical advice/i);
  });
});

describe('Feature: diabetes-insulin-tracker, Property 8: First-use acknowledgment gate', () => {
  it('does not present a dose until the disclaimer is acknowledged (Req 8.3)', async () => {
    const user = userEvent.setup();
    render(<Calculator profile={VALID_PROFILE} onRecord={vi.fn()} />);

    // Before acknowledging: the acknowledgment gate is shown and there are no
    // glucose inputs to reveal a dose.
    expect(screen.getByTestId('acknowledgment-gate')).toBeInTheDocument();
    expect(screen.queryByLabelText(/current glucose/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('suggested-dose')).not.toBeInTheDocument();

    // Acknowledge the disclaimer.
    await user.click(screen.getByRole('button', { name: /i understand/i }));

    // The gate is gone and inputs are now available.
    expect(screen.queryByTestId('acknowledgment-gate')).not.toBeInTheDocument();

    // Entering a glucose value now reveals the suggested dose and its label.
    await user.type(screen.getByLabelText(/current glucose/i), '200');

    expect(screen.getByTestId('suggested-dose')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-label')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-label')).toHaveTextContent(/suggestion/i);
  });
});

describe('Feature: diabetes-insulin-tracker, Property 7: Confirmation required before recording', () => {
  it('does not record the dose until the confirm button is clicked (Req 3.5)', async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn();
    render(<Calculator profile={VALID_PROFILE} onRecord={onRecord} />);

    // Acknowledge the disclaimer and enter a glucose value to present a dose.
    await user.click(screen.getByRole('button', { name: /i understand/i }));
    await user.type(screen.getByLabelText(/current glucose/i), '200');

    // A dose is presented (with the suggestion label) but nothing is recorded
    // yet — onRecord must not be called on mere presentation.
    expect(screen.getByTestId('suggested-dose')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-label')).toBeInTheDocument();
    expect(screen.queryByTestId('dose-confirmed')).not.toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();

    // Clicking confirm records the dose exactly once.
    await user.click(screen.getByRole('button', { name: /confirm and record dose/i }));

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('dose-confirmed')).toBeInTheDocument();
  });
});
