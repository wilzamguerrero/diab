import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { carbsFromSelections } from './foodTable';
import type { FoodItem, FoodSelection } from '../types';

// Feature: diabetes-insulin-tracker, Property 9: Carbohydrate total from selections
//
// For any list of food selections, the computed Carbohydrate_Amount equals the
// sum over selections of `carbsPerServing * quantity` (and equals a single
// item's contribution when exactly one item is selected).
//
// Validates: Requirements 4.2, 4.3

// Arbitrary for a FoodItem with a finite, non-negative carbsPerServing.
// id/name/unitLabel are irrelevant to the aggregation, so they use small
// generators to keep examples readable.
const foodItemArb: fc.Arbitrary<FoodItem> = fc.record({
  id: fc.string(),
  name: fc.string(),
  carbsPerServing: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  unitLabel: fc.string(),
});

// Arbitrary for a FoodSelection with a finite, non-negative serving quantity.
const foodSelectionArb: fc.Arbitrary<FoodSelection> = fc.record({
  item: foodItemArb,
  quantity: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
});

// Compute the expected total independently of the implementation.
function expectedTotal(selections: FoodSelection[]): number {
  let total = 0;
  for (const selection of selections) {
    total += selection.item.carbsPerServing * selection.quantity;
  }
  return total;
}

describe('Property 9: Carbohydrate total from selections', () => {
  it('total equals the sum of carbsPerServing * quantity over all selections', () => {
    fc.assert(
      fc.property(fc.array(foodSelectionArb, { maxLength: 50 }), (selections) => {
        const actual = carbsFromSelections(selections);
        const expected = expectedTotal(selections);

        // Tolerance scales with magnitude to absorb floating-point summation error.
        const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 200 },
    );
  });

  it('equals a single item contribution when exactly one item is selected', () => {
    fc.assert(
      fc.property(foodSelectionArb, (selection) => {
        const actual = carbsFromSelections([selection]);
        const expected = selection.item.carbsPerServing * selection.quantity;

        const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 200 },
    );
  });
});
