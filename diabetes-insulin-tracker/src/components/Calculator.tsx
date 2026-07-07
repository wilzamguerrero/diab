// Calculator — suggested insulin dose calculator with medical-safety gating.
//
// Responsibilities (see design.md "Calculator interaction state machine"):
//   - Always display the Medical_Disclaimer on the calculation screen. (Req 8.1)
//   - On first use, require explicit acknowledgment of the disclaimer BEFORE
//     any Suggested_Dose is presented. (Req 8.3)
//   - Accept a Current_Glucose value and a carbohydrate amount. Carbs may come
//     from the FoodTable selections OR a manual carb entry; a manual value
//     OVERRIDES the food-selection total when present. (Req 4.4)
//   - Compute the dose via `calculateDose`. When the profile is incomplete the
//     calculation is withheld and the patient is prompted to complete their
//     profile. (Req 3.2)
//   - When a dose is presented, show the carb-coverage + correction breakdown
//     and the final dose rounded to one decimal, label it as a non-binding
//     suggestion requiring patient/doctor validation, and display the
//     disclaimer alongside it. (Req 3.1, 3.3, 3.4, 3.6, 8.2)
//   - Require explicit confirmation before the dose can be recorded; only after
//     confirming is `onRecord` invoked. (Req 3.5)
//
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4, 8.1, 8.2, 8.3

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DoseResult, PatientProfile, Reading } from '../types';
import { calculateDose } from '../domain/insulin';
import { useAppStore, acknowledgeDisclaimer } from '../state/appStore';
import FoodTable from './FoodTable';

/**
 * The Medical_Disclaimer text. Rendered whenever the calculator is shown and
 * again alongside any presented dose. Contains the phrase "not medical advice"
 * for recognizability. (Req 8.1)
 */
export const MEDICAL_DISCLAIMER =
  'Medical disclaimer: suggested doses are not medical advice. They are a ' +
  'non-binding estimate and must be validated by the patient or their doctor ' +
  'before use.';

export interface CalculatorProps {
  /**
   * Patient profile used for the calculation. When omitted (undefined), the
   * cached profile from the app store is used. Passing `null` explicitly forces
   * the "complete your profile" path. (Injectable for testing.)
   */
  profile?: PatientProfile | null;
  /**
   * Invoked ONLY after the patient explicitly confirms a presented dose. The
   * calculator never records automatically. (Req 3.5)
   */
  onRecord?: (result: DoseResult, reading?: Reading) => void;
  /**
   * Optional replacement for the food-selection UI. When provided it is
   * rendered in place of the default FoodTable (e.g. for tests). Note that a
   * custom node is responsible for driving carb input on its own; the default
   * FoodTable is wired to feed selection carbs into the calculator.
   */
  foodTable?: ReactNode;
}

/** Format a units value to one decimal place for display. (Req 3.6) */
function formatUnits(value: number): string {
  return value.toFixed(1);
}

export default function Calculator({ profile: profileProp, onRecord, foodTable }: CalculatorProps) {
  const store = useAppStore();
  // `undefined` means "not provided" → fall back to the store. `null` is an
  // explicit caller choice and is preserved.
  const profile = profileProp !== undefined ? profileProp : store.profile;
  const { disclaimerAcknowledged } = store;

  const [currentGlucose, setCurrentGlucose] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [selectionCarbs, setSelectionCarbs] = useState(0);
  // Whether the currently-presented dose has been confirmed by the patient.
  const [confirmed, setConfirmed] = useState(false);

  /**
   * Any change to the inputs invalidates a prior confirmation so a stale
   * confirmation can never record a dose the patient did not review. (Req 3.5)
   */
  function invalidateConfirmation() {
    if (confirmed) setConfirmed(false);
  }

  // Manual carbs override the food-selection total when a manual value is
  // present and numeric. (Req 4.4)
  const manualCarbsEntered = manualCarbs.trim() !== '' && Number.isFinite(Number(manualCarbs));
  const manualCarbsValue = manualCarbsEntered ? Number(manualCarbs) : null;
  const effectiveCarbs = manualCarbsValue !== null ? manualCarbsValue : selectionCarbs;

  const hasGlucoseInput = currentGlucose.trim() !== '' && Number.isFinite(Number(currentGlucose));
  const glucoseValue = hasGlucoseInput ? Number(currentGlucose) : NaN;

  // Only compute a dose once the disclaimer is acknowledged (Req 8.3) and a
  // glucose value has been entered.
  const result: DoseResult | null = useMemo(() => {
    if (!disclaimerAcknowledged || !hasGlucoseInput) return null;
    return calculateDose(profile, { currentGlucose: glucoseValue, carbs: effectiveCarbs });
  }, [disclaimerAcknowledged, hasGlucoseInput, profile, glucoseValue, effectiveCarbs]);

  // The profile is incomplete/invalid when we have the inputs to calculate but
  // `calculateDose` withheld a result. (Req 3.2)
  const profileIncomplete = disclaimerAcknowledged && hasGlucoseInput && result === null;

  function handleConfirm() {
    if (!result) return;
    setConfirmed(true);
    onRecord?.(result);
  }

  return (
    <section aria-labelledby="calculator-heading" className="calculator">
      <h2 id="calculator-heading">Insulin dose calculator</h2>

      {/* Requirement 8.1: the Medical_Disclaimer is always visible. */}
      <p role="note" data-testid="medical-disclaimer" className="calculator__disclaimer">
        {MEDICAL_DISCLAIMER}
      </p>

      {!disclaimerAcknowledged ? (
        // Requirement 8.3: first-use acknowledgment gate. No dose is presented
        // until the patient acknowledges the disclaimer.
        <div data-testid="acknowledgment-gate">
          <p>Please acknowledge the medical disclaimer before using the calculator.</p>
          <button type="button" onClick={() => acknowledgeDisclaimer()}>
            I understand
          </button>
        </div>
      ) : (
        <>
          <div className="calculator__inputs">
            <div>
              <label htmlFor="calculator-glucose">Current glucose (mg/dL)</label>
              <input
                id="calculator-glucose"
                name="currentGlucose"
                type="number"
                inputMode="numeric"
                value={currentGlucose}
                onChange={(e) => {
                  setCurrentGlucose(e.target.value);
                  invalidateConfirmation();
                }}
              />
            </div>

            <div>
              <label htmlFor="calculator-manual-carbs">Carbohydrates (manual, g)</label>
              <input
                id="calculator-manual-carbs"
                name="manualCarbs"
                type="number"
                inputMode="numeric"
                placeholder="Overrides food selections"
                value={manualCarbs}
                onChange={(e) => {
                  setManualCarbs(e.target.value);
                  invalidateConfirmation();
                }}
              />
            </div>
          </div>

          {/* Food selection source. A manual value takes precedence (Req 4.4). */}
          {foodTable ?? (
            <FoodTable
              onSelectionsChange={(_selections, totalCarbs) => {
                setSelectionCarbs(totalCarbs);
                invalidateConfirmation();
              }}
            />
          )}

          <p className="calculator__carbs" aria-live="polite" data-testid="effective-carbs">
            Carbohydrates used: <strong>{effectiveCarbs} g</strong>
            {manualCarbsValue !== null ? ' (manual entry)' : ' (from food selections)'}
          </p>

          {profileIncomplete && (
            // Requirement 3.2: withhold calculation and prompt to complete profile.
            <p role="alert" data-testid="profile-incomplete">
              Your patient profile is incomplete. Please complete your profile
              (insulin-to-carb ratio, correction factor, and target glucose) to
              calculate a suggested dose.
            </p>
          )}

          {result && (
            <div data-testid="dose-result" className="calculator__result">
              {/* Requirement 8.2 / 3.4: label as a suggestion requiring validation. */}
              <p className="calculator__suggestion-label" data-testid="suggestion-label">
                This is a <strong>suggestion</strong> only and requires patient or
                doctor validation before use.
              </p>

              {/* Requirement 3.1: two-part breakdown. */}
              <dl className="calculator__breakdown">
                <div>
                  <dt>Carb coverage</dt>
                  <dd data-testid="carb-coverage">{formatUnits(result.carbCoverage)} units</dd>
                </div>
                <div>
                  <dt>Correction</dt>
                  <dd data-testid="correction">{formatUnits(result.correction)} units</dd>
                </div>
              </dl>

              {/* Requirement 3.6/3.3: final dose, rounded to one decimal, >= 0. */}
              <p className="calculator__dose">
                Suggested dose:{' '}
                <strong data-testid="suggested-dose">{formatUnits(result.dose)} units</strong>
              </p>

              {/* Requirement 8.1/3.4: disclaimer alongside the dose. */}
              <p role="note" data-testid="dose-disclaimer" className="calculator__disclaimer">
                {MEDICAL_DISCLAIMER}
              </p>

              {/* Requirement 3.5: require confirmation before recording. */}
              <button type="button" onClick={handleConfirm} disabled={confirmed}>
                {confirmed ? 'Confirmed' : 'Confirm and record dose'}
              </button>

              {confirmed && (
                <p role="status" data-testid="dose-confirmed">
                  Suggested dose confirmed.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
