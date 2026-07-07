import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MetricsView from './MetricsView';
import type { Reading } from '../types';

// Component tests for MetricsView covering the empty-state behaviour and the
// doctor time-in-range proportion display.
// See Requirements 7.4 (doctor time-in-range) and 7.5 (empty-state).

function reading(glucose: number, mealTag: 'pre' | 'post' = 'pre'): Reading {
  return { glucose, mealTag, timestamp: '2024-01-01T00:00:00.000Z' };
}

describe('MetricsView empty-state (Requirement 7.5)', () => {
  it('shows the empty-state message and no computed patient metrics when there are no readings', () => {
    render(<MetricsView readings={[]} />);

    expect(
      screen.getByText('No se encontraron lecturas para el rango seleccionado.'),
    ).toBeInTheDocument();
    // No computed metrics should be rendered in place of the empty-state.
    expect(screen.queryByLabelText('Patient metrics')).toBeNull();
  });

  it('keeps showing the empty-state after switching to the Doctor view', () => {
    render(<MetricsView readings={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Doctor' }));

    expect(
      screen.getByText('No se encontraron lecturas para el rango seleccionado.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Doctor metrics')).toBeNull();
    expect(screen.queryByLabelText('Patient metrics')).toBeNull();
  });
});

describe('MetricsView doctor proportion display (Requirement 7.4)', () => {
  // Two of the four values (80, 100) fall within the default target range
  // [70, 180]; 200 and 50 fall outside → 2/4 = 50.0%.
  const readings: Reading[] = [
    reading(80),
    reading(100),
    reading(200),
    reading(50),
  ];

  it('renders the time-in-range percentage when the Doctor view is selected', () => {
    render(<MetricsView readings={readings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Doctor' }));

    const doctorMetrics = screen.getByLabelText('Doctor metrics');
    expect(doctorMetrics).toBeInTheDocument();
    expect(screen.getByText(/Tiempo en rango/)).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('shows patient average/min/max by default for a non-empty set', () => {
    render(<MetricsView readings={readings} />);

    // Patient view is the default; the patient metrics list should be present.
    const patientMetrics = screen.getByLabelText('Patient metrics');
    expect(patientMetrics).toBeInTheDocument();

    // average = (80 + 100 + 200 + 50) / 4 = 107.5
    expect(screen.getByText('107.5 mg/dL')).toBeInTheDocument();
    // min = 50, max = 200
    expect(screen.getByText('50 mg/dL')).toBeInTheDocument();
    expect(screen.getByText('200 mg/dL')).toBeInTheDocument();
  });
});
