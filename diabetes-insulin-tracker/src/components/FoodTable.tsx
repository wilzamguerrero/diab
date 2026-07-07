// FoodTable component: searchable food list with selectable items.
// Spanish UI with motion animations.
// Requirements 4.1, 4.2, 4.3

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { FoodItem, FoodSelection } from '../types';
import { FOOD_TABLE, carbsFromSelections } from '../data/foodTable';

export interface FoodTableProps {
  onSelectionsChange?: (selections: FoodSelection[], totalCarbs: number) => void;
  items?: FoodItem[];
}

const MIN_QUANTITY = 0;

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
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return items;
    return items.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [items, query]);

  const selections = useMemo(() => toSelections(items, quantities), [items, quantities]);
  const totalCarbs = useMemo(() => carbsFromSelections(selections), [selections]);

  function commitQuantities(next: Map<string, number>) {
    setQuantities(next);
    const nextSelections = toSelections(items, next);
    onSelectionsChange?.(nextSelections, carbsFromSelections(nextSelections));
  }

  function toggleItem(item: FoodItem, checked: boolean) {
    const next = new Map(quantities);
    if (checked) {
      next.set(item.id, 1);
    } else {
      next.delete(item.id);
    }
    commitQuantities(next);
  }

  function updateQuantity(item: FoodItem, rawValue: string) {
    const parsed = Number(rawValue);
    const quantity = Number.isFinite(parsed) ? Math.max(MIN_QUANTITY, parsed) : MIN_QUANTITY;
    const next = new Map(quantities);
    next.set(item.id, quantity);
    commitQuantities(next);
  }

  return (
    <section aria-label="Tabla de alimentos" className="food-table">
      <label className="food-table__search">
        <span>Buscar alimentos</span>
        <input
          type="search"
          value={query}
          placeholder="Buscar alimentos por nombre"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {filteredItems.length === 0 ? (
        <p className="food-table__empty" role="status">
          Ningún alimento coincide con "{query}".
        </p>
      ) : (
        <ul className="food-table__list">
          {filteredItems.map((item, index) => {
            const quantity = quantities.get(item.id);
            const isSelected = quantity !== undefined;
            return (
              <motion.li
                key={item.id}
                className="food-table__item"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02, type: 'spring', stiffness: 300, damping: 25 }}
              >
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
                    <span>Porciones ({item.unitLabel})</span>
                    <input
                      type="number"
                      min={MIN_QUANTITY}
                      step="any"
                      value={quantity}
                      aria-label={`Porciones de ${item.name}`}
                      onChange={(event) => updateQuantity(item, event.target.value)}
                    />
                  </label>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      <p className="food-table__total" aria-live="polite">
        Total carbohidratos: <strong>{totalCarbs} g</strong>
      </p>
    </section>
  );
}
