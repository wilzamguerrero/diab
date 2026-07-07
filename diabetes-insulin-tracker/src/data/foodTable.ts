// Reference food table and carbohydrate aggregation.
// See Requirements 4.1, 4.2, 4.3 and design.md (data/foodTable.ts).

import type { FoodItem, FoodSelection } from '../types';

/**
 * A reference list of common foods with their carbohydrate content per serving.
 * Values are approximate grams of carbohydrate per single serving and are
 * intended as a convenience lookup, not clinical precision. (Requirement 4.1)
 */
export const FOOD_TABLE: FoodItem[] = [
  { id: 'bread-white', name: 'White bread', carbsPerServing: 13, unitLabel: 'slice' },
  { id: 'bread-whole-wheat', name: 'Whole wheat bread', carbsPerServing: 12, unitLabel: 'slice' },
  { id: 'rice-white-cooked', name: 'White rice (cooked)', carbsPerServing: 45, unitLabel: 'cup' },
  { id: 'rice-brown-cooked', name: 'Brown rice (cooked)', carbsPerServing: 45, unitLabel: 'cup' },
  { id: 'pasta-cooked', name: 'Pasta (cooked)', carbsPerServing: 43, unitLabel: 'cup' },
  { id: 'potato-medium', name: 'Potato (baked)', carbsPerServing: 37, unitLabel: 'medium' },
  { id: 'oatmeal-cooked', name: 'Oatmeal (cooked)', carbsPerServing: 27, unitLabel: 'cup' },
  { id: 'cereal-corn-flakes', name: 'Corn flakes', carbsPerServing: 24, unitLabel: 'cup' },
  { id: 'apple-medium', name: 'Apple', carbsPerServing: 25, unitLabel: 'medium' },
  { id: 'banana-medium', name: 'Banana', carbsPerServing: 27, unitLabel: 'medium' },
  { id: 'orange-medium', name: 'Orange', carbsPerServing: 15, unitLabel: 'medium' },
  { id: 'grapes', name: 'Grapes', carbsPerServing: 16, unitLabel: 'cup' },
  { id: 'strawberries', name: 'Strawberries', carbsPerServing: 11, unitLabel: 'cup' },
  { id: 'milk-whole', name: 'Milk (whole)', carbsPerServing: 12, unitLabel: 'cup' },
  { id: 'yogurt-plain', name: 'Plain yogurt', carbsPerServing: 17, unitLabel: 'cup' },
  { id: 'orange-juice', name: 'Orange juice', carbsPerServing: 26, unitLabel: 'cup' },
  { id: 'soda-cola', name: 'Cola (regular)', carbsPerServing: 39, unitLabel: 'can' },
  { id: 'beans-black-cooked', name: 'Black beans (cooked)', carbsPerServing: 41, unitLabel: 'cup' },
  { id: 'corn-cooked', name: 'Corn (cooked)', carbsPerServing: 31, unitLabel: 'cup' },
  { id: 'carrot-raw', name: 'Carrot', carbsPerServing: 6, unitLabel: 'medium' },
  { id: 'tortilla-flour', name: 'Flour tortilla', carbsPerServing: 15, unitLabel: 'tortilla' },
  { id: 'bagel-plain', name: 'Bagel (plain)', carbsPerServing: 48, unitLabel: 'bagel' },
  { id: 'pizza-cheese', name: 'Cheese pizza', carbsPerServing: 33, unitLabel: 'slice' },
  { id: 'ice-cream-vanilla', name: 'Vanilla ice cream', carbsPerServing: 16, unitLabel: 'scoop' },
  { id: 'cookie-chocolate-chip', name: 'Chocolate chip cookie', carbsPerServing: 9, unitLabel: 'cookie' },
];

/**
 * Sum the carbohydrate contributions of a list of food selections.
 * The total is the sum over selections of `carbsPerServing * quantity`.
 * Returns 0 for an empty list. (Requirements 4.2, 4.3)
 */
export function carbsFromSelections(selections: FoodSelection[]): number {
  return selections.reduce(
    (total, selection) => total + selection.item.carbsPerServing * selection.quantity,
    0,
  );
}
