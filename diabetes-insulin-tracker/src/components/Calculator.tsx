// Calculator — suggested insulin dose calculator with medical-safety gating.
// Spanish UI with motion animations.
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4, 8.1, 8.2, 8.3

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { DoseResult, PatientProfile, Reading } from '../types';
import { calculateDose } from '../domain/insulin';
import { useAppStore, acknowledgeDisclaimer } from '../state/appStore';
import FoodTable from './FoodTable';

/**
 * The Medical_Disclaimer text. (Req 8.1)
 */
export const MEDICAL_DISCLAIMER =
  'Aviso médico: las dosis sugeridas no constituyen consejo médico. Son una ' +
  'estimación no vinculante y deben ser validadas por el paciente o su médico ' +
  'antes de su uso.';

export interface CalculatorProps {
  profile?: PatientProfile | null;
  onRecord?: (result: DoseResult, reading?: Reading) => void;
  foodTable?: ReactNode;
}

function formatUnits(value: number): string {
  return value.toFixed(1);
}

export default function Calculator({ profile: profileProp, onRecord, foodTable }: CalculatorProps) {
  const store = useAppStore();
  const profile = profileProp !== undefined ? profileProp : store.profile;
  const { disclaimerAcknowledged } = store;

  const [currentGlucose, setCurrentGlucose] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [selectionCarbs, setSelectionCarbs] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  function invalidateConfirmation() {
    if (confirmed) setConfirmed(false);
  }

  const manualCarbsEntered = manualCarbs.trim() !== '' && Number.isFinite(Number(manualCarbs));
  const manualCarbsValue = manualCarbsEntered ? Number(manualCarbs) : null;
  const effectiveCarbs = manualCarbsValue !== null ? manualCarbsValue : selectionCarbs;

  const hasGlucoseInput = currentGlucose.trim() !== '' && Number.isFinite(Number(currentGlucose));
  const glucoseValue = hasGlucoseInput ? Number(currentGlucose) : NaN;

  const result: DoseResult | null = useMemo(() => {
    if (!disclaimerAcknowledged || !hasGlucoseInput) return null;
    return calculateDose(profile, { currentGlucose: glucoseValue, carbs: effectiveCarbs });
  }, [disclaimerAcknowledged, hasGlucoseInput, profile, glucoseValue, effectiveCarbs]);

  const profileIncomplete = disclaimerAcknowledged && hasGlucoseInput && result === null;

  function handleConfirm() {
    if (!result) return;
    setConfirmed(true);
    onRecord?.(result);
  }

  return (
    <motion.section
      aria-labelledby="calculator-heading"
      className="calculator"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <h2 id="calculator-heading">Calculadora de dosis de insulina</h2>

      <p role="note" data-testid="medical-disclaimer" className="calculator__disclaimer">
        {MEDICAL_DISCLAIMER}
      </p>

      {!disclaimerAcknowledged ? (
        <motion.div
          data-testid="acknowledgment-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p>Por favor, reconoce el aviso médico antes de usar la calculadora.</p>
          <motion.button
            type="button"
            onClick={() => acknowledgeDisclaimer()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Entendido
          </motion.button>
        </motion.div>
      ) : (
        <>
          <div className="calculator__inputs">
            <div>
              <label htmlFor="calculator-glucose">Glucosa actual (mg/dL)</label>
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
              <label htmlFor="calculator-manual-carbs">Carbohidratos (manual, g)</label>
              <input
                id="calculator-manual-carbs"
                name="manualCarbs"
                type="number"
                inputMode="numeric"
                placeholder="Reemplaza selección de alimentos"
                value={manualCarbs}
                onChange={(e) => {
                  setManualCarbs(e.target.value);
                  invalidateConfirmation();
                }}
              />
            </div>
          </div>

          {foodTable ?? (
            <FoodTable
              onSelectionsChange={(_selections, totalCarbs) => {
                setSelectionCarbs(totalCarbs);
                invalidateConfirmation();
              }}
            />
          )}

          <p className="calculator__carbs" aria-live="polite" data-testid="effective-carbs">
            Carbohidratos usados: <strong>{effectiveCarbs} g</strong>
            {manualCarbsValue !== null ? ' (entrada manual)' : ' (de selección de alimentos)'}
          </p>

          {profileIncomplete && (
            <motion.p
              role="alert"
              data-testid="profile-incomplete"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Tu perfil de paciente está incompleto. Completa tu perfil
              (ratio insulina-carbohidratos, factor de corrección y glucosa objetivo)
              para calcular una dosis sugerida.
            </motion.p>
          )}

          {result && (
            <motion.div
              data-testid="dose-result"
              className="calculator__result"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20 }}
            >
              <p className="calculator__suggestion-label" data-testid="suggestion-label">
                Esta es solo una <strong>sugerencia</strong> y requiere validación del
                paciente o médico antes de su uso.
              </p>

              <dl className="calculator__breakdown">
                <div>
                  <dt>Cobertura de carbohidratos</dt>
                  <dd data-testid="carb-coverage">{formatUnits(result.carbCoverage)} unidades</dd>
                </div>
                <div>
                  <dt>Corrección</dt>
                  <dd data-testid="correction">{formatUnits(result.correction)} unidades</dd>
                </div>
              </dl>

              <p className="calculator__dose">
                Dosis sugerida:{' '}
                <strong data-testid="suggested-dose">{formatUnits(result.dose)} unidades</strong>
              </p>

              <p role="note" data-testid="dose-disclaimer" className="calculator__disclaimer">
                {MEDICAL_DISCLAIMER}
              </p>

              <motion.button
                type="button"
                onClick={handleConfirm}
                disabled={confirmed}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {confirmed ? 'Confirmado' : 'Confirmar y registrar dosis'}
              </motion.button>

              {confirmed && (
                <motion.p
                  role="status"
                  data-testid="dose-confirmed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Dosis sugerida confirmada.
                </motion.p>
              )}
            </motion.div>
          )}
        </>
      )}
    </motion.section>
  );
}
