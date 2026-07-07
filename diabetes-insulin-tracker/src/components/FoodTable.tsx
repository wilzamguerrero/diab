// FoodTable component: searchable food list with selectable items.
// i18n via useI18n hook — food names are looked up via t('food.<id>').
// Requirements 4.1, 4.2, 4.3

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { FoodItem, FoodSelection } from '../types';
import { FOOD_TABLE, carbsFromSelections } from '../data/foodTable';
import { useI18n } from '../services/i18n';

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
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return items;
    return items.filter((item) => {
      const displayName = t(`food.${item.id}`) || item.name;
      return displayName.toLowerCase().includes(normalized);
    });
  }, [items, query, t]);

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
        <span>{t('food.searchLabel')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('food.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {filteredItems.length === 0 ? (
        <p className="food-table__empty" role="status">
          {t('food.noMatch')} &quot;{query}&quot;.
        </p>
      ) : (
        <ul className="food-table__list">
          {filteredItems.map((item, index) => {
            const quantity = quantities.get(item.id);
            const isSelected = quantity !== undefined;
            const displayName = t(`food.${item.id}`) || item.name;
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
                  <span className="food-table__item-name">{displayName}</span>
                </label>
                <span className="food-table__item-carbs">
                  {item.carbsPerServing} {t('food.carbsPerServing')} / {item.unitLabel}
                </span>
                {isSelected && (
                  <label className="food-table__item-quantity">
                    <span>{t('food.servings')} ({item.unitLabel})</span>
                    <input
                      type="number"
                      min={MIN_QUANTITY}
                      step="any"
                      value={quantity}
                      aria-label={`${t('food.servingsOf')} ${displayName}`}
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
        {t('food.totalCarbs')}: <strong>{totalCarbs} g</strong>
      </p>
    </section>
  );
}
