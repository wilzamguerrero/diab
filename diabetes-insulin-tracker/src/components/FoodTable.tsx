// FoodTable component: a searchable food list with selectable items and
// adjustable serving quantities. It computes the running carbohydrate total
// via carbsFromSelections and notifies the parent (the Calculator) of the
// current selections and computed carbs so the dose can be derived from food.
//
// See design.md ("FoodTable | Search foods, select items + quantities, feed
// carbs to Calculator") and Requirements 4.1, 4.2, 4.3.

import { useMemo, useState } from 'react';
import type { FoodItem, FoodSelection } from '../types';
import { FOOD_TABLE, carbsFromSelections } from '../data/foodTable';

export interface FoodTableProps {
  /**
   * Notified whenever the selections change, with the current list of
   * selections and the corresponding total carbohydrate amount (grams).
   */
  onSelectionsChange?: (selections: FoodSelection[], totalCarbs: number) => void;
  /**
   * The catalog of foods to display. Defaults to the reference FOOD_TABLE.
   * Overridable for testing. (Requirement 4.1)
   */
  items?: FoodItem[];
}

/** Minimum serving quantity for a selected item. */
const MIN_QUANTITY = 0;

/**
 * Build the FoodSelection list from an item->quantity map, preserving the
 * catalog order and excluding any items with a non-positive quantity.
 */
function toSelections(items: FoodItem[], quantities: Map<string, number>): FoodSelection[] {
  const selections: FoodSelection[] = [];
  for (const item of items) {
    const quantity = quantities.get(item.id);
    if (quantity !== undefined && quantity > 0) {
      selections.push({ item, quantity });
    }
  }
  return selections;
}

export default function FoodTable({ onSelectionsChange, items = FOOD_TABLE }: FoodTableProps) {
  const [query, setQuery] = useState('');
  // Map of item id -> selected serving quantity. Presence of a key means the
  // item is currently included in the selection.
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

  // Case-insensitive filter of the catalog by name. (Requirement 4.1)
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return items;
    return items.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [items, query]);

  const selections = useMemo(() => toSelections(items, quantities), [items, quantities]);
  const totalCarbs = useMemo(() => carbsFromSelections(selections), [selections]);

  /** Apply a new quantities map, recompute selections/total, and notify parent. */
  function commitQuantities(next: Map<string, number>) {
    setQuantities(next);
    const nextSelections = toSelections(items, next);
    onSelectionsChange?.(nextSelections, carbsFromSelections(nextSelections));
  }

  /** Toggle whether an item is included in the selection. */
  function toggleItem(item: FoodItem, checked: boolean) {
    const next = new Map(quantities);
    if (checked) {
      // Default to one serving when first selected.
      next.set(item.id, 1);
    } else {
      next.delete(item.id);
    }
    commitQuantities(next);
  }

  /** Update the serving quantity for a (selected) item. */
  function updateQuantity(item: FoodItem, rawValue: string) {
    const parsed = Number(rawValue);
    const quantity = Number.isFinite(parsed) ? Math.max(MIN_QUANTITY, parsed) : MIN_QUANTITY;
    const next = new Map(quantities);
    next.set(item.id, quantity);
    commitQuantities(next);
  }

  return (
    <section aria-label="Food table" className="food-table">
      <label className="food-table__search">
        <span>Search foods</span>
        <input
          type="search"
          value={query}
          placeholder="Search foods by name"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {filteredItems.length === 0 ? (
        <p className="food-table__empty" role="status">
          No foods match "{query}".
        </p>
      ) : (
        <ul className="food-table__list">
          {filteredItems.map((item) => {
            const quantity = quantities.get(item.id);
            const isSelected = quantity !== undefined;
            return (
              <li key={item.id} className="food-table__item">
                <label className="food-table__item-select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => toggleItem(item, event.target.checked)}
                  />
                  <span className="food-table__item-name">{item.name}</span>
                </label>
                <span className="food-table__item-carbs">
                  {item.carbsPerServing} g carbs / {item.unitLabel}
                </span>
                {isSelected && (
                  <label className="food-table__item-quantity">
                    <span>Servings ({item.unitLabel})</span>
                    <input
                      type="number"
                      min={MIN_QUANTITY}
                      step="any"
                      value={quantity}
                      aria-label={`Servings of ${item.name}`}
                      onChange={(event) => updateQuantity(item, event.target.value)}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="food-table__total" aria-live="polite">
        Total carbohydrates: <strong>{totalCarbs} g</strong>
      </p>
    </section>
  );
}
