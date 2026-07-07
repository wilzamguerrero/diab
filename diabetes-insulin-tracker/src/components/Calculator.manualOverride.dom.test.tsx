// Property test for manual carbohydrate override in the Calculator.
//
// Feature: diabetes-insulin-tracker, Property 10: Manual carbohydrate override
// Validates: Requirements 4.4
//
// Property: when a manual carbohydrate value is entered, the suggested dose is
// computed from that manual value REGARDLESS of any food-table selections. We
// prove this by driving the default FoodTable to a non-zero selection carb
// total (selecting White bread => 13 g) and then entering a manual carb value
// that differs from 13. The displayed suggested dose must always equal
// calculateDose(profile, { currentGlucose, carbs: manualValue }).dose — i.e. it
// used the manual value, not the selection total.
//
// Note on iteration count: each case renders the full Calculator + FoodTable and
// drives it through userEvent, which is expensive. We use a modest run count of
// 20 (below the ideal >=100) to keep this DOM-based property test practical
// while still exercising a broad spread of glucose/carb inputs. Typing is run
// with no inter-key delay and the test timeout is raised to accommodate the
// per-case render cost.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import Calculator from './Calculator';
import { calculateDose } from '../domain/insulin';
import { resetStore } from '../state/appStore';
import type { PatientProfile } from '../types';

// A fixed, valid profile so the calculation is never withheld (Req 3.2).
const PROFILE: PatientProfile = { icRatio: 10, isf: 50, targetGlucose: 120 };

// White bread contributes 13 g per serving; selecting it (default 1 serving)
// gives a non-zero selection carb total that a manual value must override.
const SELECTION_CARBS = 13;

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

async function setUpDose(glucose: number, manualCarbs: number) {
  // The app store is a module-level singleton and each property iteration must
  // start from the un-acknowledged gate. Reset store + DOM before every render.
  cleanup();
  resetStore();
  localStorage.clear();

  // delay: null removes the inter-keystroke delay so many iterations stay fast.
  const user = userEvent.setup({ delay: null });
  render(<Calculator profile={PROFILE} />);

  // Requirement 8.3: acknowledge the disclaimer before any dose is presented.
  await user.click(screen.getByRole('button', { name: /i understand/i }));

  // Drive the food selection to a non-zero carb total so the override is
  // meaningful (selection carbs = SELECTION_CARBS).
  await user.click(screen.getByRole('checkbox', { name: /white bread/i }));

  await user.type(screen.getByLabelText(/current glucose/i), String(glucose));
  await user.type(screen.getByLabelText(/carbohydrates \(manual, g\)/i), String(manualCarbs));
}

describe('Calculator manual carbohydrate override (Property 10, Req 4.4)', () => {
  it(
    'uses the manual carb value for the dose regardless of food selections',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Current glucose in a realistic mg/dL range.
          fc.integer({ min: 40, max: 400 }),
          // Manual carbs that differ from the food-selection total so the test
          // genuinely distinguishes "used manual" from "used selection".
          fc.integer({ min: 0, max: 300 }).filter((c) => c !== SELECTION_CARBS),
          async (glucose, manualCarbs) => {
            await setUpDose(glucose, manualCarbs);

            const expected = calculateDose(PROFILE, {
              currentGlucose: glucose,
              carbs: manualCarbs,
            });
            // Sanity: the profile is valid so a dose is always produced.
            expect(expected).not.toBeNull();

            const displayed = screen.getByTestId('suggested-dose').textContent;
            expect(displayed).toBe(`${expected!.dose.toFixed(1)} units`);
          },
        ),
        { numRuns: 20 },
      );
    },
    30000,
  );

  it('example: manual entry overrides a different selection total', async () => {
    // Selection = 13 g bread; manual = 60 g. Expected dose uses 60 g, not 13 g.
    await setUpDose(200, 60);

    const manualDose = calculateDose(PROFILE, { currentGlucose: 200, carbs: 60 });
    const selectionDose = calculateDose(PROFILE, {
      currentGlucose: 200,
      carbs: SELECTION_CARBS,
    });

    // The two computations differ, so the displayed value must match manual.
    expect(manualDose!.dose).not.toBe(selectionDose!.dose);

    const displayed = screen.getByTestId('suggested-dose').textContent;
    expect(displayed).toBe(`${manualDose!.dose.toFixed(1)} units`);
    expect(displayed).not.toBe(`${selectionDose!.dose.toFixed(1)} units`);
  });
});
