import { formatKitchenNumber, isVolumeUnit, isWeightUnit, pluralizeUnit, scaleIngredient } from './scaling';
import { getCanonicalById } from './taxonomy';
import { AISLE_ORDER, GroceryItem, GrocerySourceContribution, Recipe } from './types';

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
};

const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

function toGramsIfPossible(qty: number, unit: string, canonicalId: string): number | null {
  if (isWeightUnit(unit)) return qty * WEIGHT_TO_G[unit];
  const canonical = getCanonicalById(canonicalId);
  if (isVolumeUnit(unit) && canonical?.densityGPerMl) {
    return qty * VOLUME_TO_ML[unit] * canonical.densityGPerMl;
  }
  if ((!unit || unit === 'clove') && canonical?.avgUnitWeightG) {
    return qty * canonical.avgUnitWeightG;
  }
  return null;
}

function formatMergedAmount(
  totalQty: number | null,
  unit: string,
  extraAmounts: string[]
): string {
  const parts: string[] = [];
  if (totalQty !== null && totalQty > 0) {
    const numStr = formatKitchenNumber(totalQty, unit);
    const unitStr = pluralizeUnit(totalQty, unit);
    parts.push(unitStr ? `${numStr} ${unitStr}` : numStr);
  }
  for (const extra of extraAmounts) {
    if (extra && !parts.includes(extra)) {
      parts.push(extra);
    }
  }
  return parts.join(' + ') || 'As needed';
}

function mergeQuantityIntoItem(
  existing: GroceryItem,
  incomingQty: number | null,
  incomingUnit: string,
  incomingFormatted: string
): GroceryItem {
  if (incomingQty === null) {
    return existing;
  }

  if (existing.totalQty === null) {
    const updated = {
      ...existing,
      totalQty: incomingQty,
      unit: incomingUnit,
    };
    updated.formattedAmount = formatMergedAmount(updated.totalQty, updated.unit, updated.extraAmounts);
    return updated;
  }

  // Case 1: Identical unit (e.g. 'clove' + 'clove', '' + '')
  if (existing.unit === incomingUnit) {
    const sum = existing.totalQty + incomingQty;
    return {
      ...existing,
      totalQty: sum,
      formattedAmount: formatMergedAmount(sum, existing.unit, existing.extraAmounts),
    };
  }

  // Case 2: Both volume units (e.g. 'tbsp' + 'cup')
  if (isVolumeUnit(existing.unit) && isVolumeUnit(incomingUnit)) {
    const totalMl = existing.totalQty * VOLUME_TO_ML[existing.unit] + incomingQty * VOLUME_TO_ML[incomingUnit];
    let bestUnit = existing.unit;
    let bestQty = totalMl / VOLUME_TO_ML[bestUnit];
    if (existing.unit === 'tsp' || existing.unit === 'tbsp' || existing.unit === 'cup') {
      if (totalMl >= VOLUME_TO_ML.cup * 0.25) {
        bestUnit = 'cup';
        bestQty = totalMl / VOLUME_TO_ML.cup;
      } else if (totalMl >= VOLUME_TO_ML.tbsp) {
        bestUnit = 'tbsp';
        bestQty = totalMl / VOLUME_TO_ML.tbsp;
      }
    } else if (totalMl >= 1000) {
      bestUnit = 'l';
      bestQty = totalMl / 1000;
    }
    return {
      ...existing,
      totalQty: bestQty,
      unit: bestUnit,
      formattedAmount: formatMergedAmount(bestQty, bestUnit, existing.extraAmounts),
    };
  }

  // Case 3: Both weight units (e.g. 'g' + 'kg', 'oz' + 'lb')
  if (isWeightUnit(existing.unit) && isWeightUnit(incomingUnit)) {
    const totalG = existing.totalQty * WEIGHT_TO_G[existing.unit] + incomingQty * WEIGHT_TO_G[incomingUnit];
    const useMetric = existing.unit === 'g' || existing.unit === 'kg';
    const bestUnit = useMetric ? (totalG >= 1000 ? 'kg' : 'g') : totalG >= 453.592 ? 'lb' : 'oz';
    const divisor = useMetric ? (bestUnit === 'kg' ? 1000 : 1) : WEIGHT_TO_G[bestUnit];
    const bestQty = totalG / divisor;
    return {
      ...existing,
      totalQty: bestQty,
      unit: bestUnit,
      formattedAmount: formatMergedAmount(bestQty, bestUnit, existing.extraAmounts),
    };
  }

  // Case 4: Cross-dimension bridge via canonical density / average unit weight
  const existingG = toGramsIfPossible(existing.totalQty, existing.unit, existing.canonicalIngredientId);
  const incomingG = toGramsIfPossible(incomingQty, incomingUnit, existing.canonicalIngredientId);
  if (existingG !== null && incomingG !== null) {
    const sumG = existingG + incomingG;
    const canonical = getCanonicalById(existing.canonicalIngredientId);
    if ((!existing.unit || !incomingUnit) && canonical?.avgUnitWeightG) {
      const count = sumG / canonical.avgUnitWeightG;
      return {
        ...existing,
        totalQty: count,
        unit: existing.unit === 'clove' || incomingUnit === 'clove' ? 'clove' : '',
        formattedAmount: formatMergedAmount(
          count,
          existing.unit === 'clove' || incomingUnit === 'clove' ? 'clove' : '',
          existing.extraAmounts
        ),
      };
    }
    return {
      ...existing,
      totalQty: sumG >= 1000 ? sumG / 1000 : sumG,
      unit: sumG >= 1000 ? 'kg' : 'g',
      formattedAmount: formatMergedAmount(
        sumG >= 1000 ? sumG / 1000 : sumG,
        sumG >= 1000 ? 'kg' : 'g',
        existing.extraAmounts
      ),
    };
  }

  // Case 5: Incompatible units (e.g. '1 bunch' + '2 tbsp') -> keep both cleanly visible
  const nextExtras = incomingFormatted ? [...existing.extraAmounts, incomingFormatted] : existing.extraAmounts;
  return {
    ...existing,
    extraAmounts: nextExtras,
    formattedAmount: formatMergedAmount(existing.totalQty, existing.unit, nextExtras),
  };
}

export function sortGroceryItemsByAisle(items: GroceryItem[]): GroceryItem[] {
  return [...items].sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    const idxA = AISLE_ORDER.indexOf(a.aisle);
    const idxB = AISLE_ORDER.indexOf(b.aisle);
    if (idxA !== idxB) return idxA - idxB;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Adds a recipe (or subset of missing ingredients) scaled to `targetServings`
 * into the Smart Grocery List with automatic canonical merging and aisle categorization.
 */
export function mergeRecipeIntoGroceryList(
  currentList: GroceryItem[],
  recipe: Recipe,
  targetServings: number,
  options?: {
    excludeCanonicalIds?: string[];
    onlyIngredientIds?: string[];
  }
): GroceryItem[] {
  const excluded = new Set(options?.excludeCanonicalIds ?? []);
  const onlyIds = options?.onlyIngredientIds ? new Set(options.onlyIngredientIds) : null;
  const byCanonical = new Map<string, GroceryItem>();

  for (const item of currentList) {
    if (!item.isChecked) {
      byCanonical.set(item.canonicalIngredientId, { ...item, sources: [...item.sources], extraAmounts: [...item.extraAmounts] });
    }
  }

  const checkedItems = currentList.filter((i) => i.isChecked);
  const now = new Date().toISOString();

  for (const ing of recipe.ingredients) {
    if (onlyIds && !onlyIds.has(ing.id)) continue;
    if (excluded.has(ing.canonicalIngredientId)) continue;
    if (ing.canonicalIngredientId === 'water') continue;

    const scaled = scaleIngredient(ing, recipe.baseServings, targetServings, 'original');
    const canonical = getCanonicalById(ing.canonicalIngredientId);
    const contribution: GrocerySourceContribution = {
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      servings: targetServings,
      qty: scaled.qtyMin,
      unit: scaled.unit,
      rawLabel: scaled.formattedAmount || 'to taste',
    };

    const existing = byCanonical.get(ing.canonicalIngredientId);
    if (!existing) {
      const fresh: GroceryItem = {
        id: `groc-${ing.canonicalIngredientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        canonicalIngredientId: ing.canonicalIngredientId,
        displayName: canonical?.name ?? ing.displayName,
        aisle: canonical?.aisle ?? 'Other',
        totalQty: scaled.qtyMin,
        unit: scaled.unit,
        extraAmounts: [],
        formattedAmount: formatMergedAmount(scaled.qtyMin, scaled.unit, []),
        isChecked: false,
        sources: [contribution],
        updatedAt: now,
      };
      byCanonical.set(ing.canonicalIngredientId, fresh);
    } else {
      const merged = mergeQuantityIntoItem(existing, scaled.qtyMin, scaled.unit, scaled.formattedAmount);
      merged.sources = [...existing.sources, contribution];
      merged.updatedAt = now;
      byCanonical.set(ing.canonicalIngredientId, merged);
    }
  }

  return sortGroceryItemsByAisle([...byCanonical.values(), ...checkedItems]);
}
