import { getCanonicalById } from './taxonomy';
import { RecipeIngredient, UnitSystem } from './types';

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

const FRACTION_TABLE: Array<[number, string]> = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [0.3333, '⅓'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [0.6667, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞'],
];

export function isVolumeUnit(unit: string): boolean {
  return unit in VOLUME_TO_ML;
}

export function isWeightUnit(unit: string): boolean {
  return unit in WEIGHT_TO_G;
}

export function isMetricUnit(unit: string): boolean {
  return unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l';
}

export function isUSUnit(unit: string): boolean {
  return unit === 'tsp' || unit === 'tbsp' || unit === 'cup' || unit === 'oz' || unit === 'lb';
}

/**
 * Formats numbers into clean culinary strings:
 * - Metric units (g, ml) round cleanly to integers or 1 decimal for kg/L
 * - US/Count units snap to readable kitchen fractions (¼, ⅓, ½, ⅔, ¾)
 */
export function formatKitchenNumber(val: number, unit: string): string {
  if (val <= 0) return '0';

  if (unit === 'g' || unit === 'ml') {
    if (val < 10) return (Math.round(val * 2) / 2).toString();
    if (val < 100) return Math.round(val).toString();
    return (Math.round(val / 5) * 5).toString();
  }

  if (unit === 'kg' || unit === 'l') {
    return Number(val.toFixed(2)).toString();
  }

  const whole = Math.floor(val + 0.04);
  const frac = val - Math.floor(val);

  if (frac < 0.06) {
    return Math.max(1, Math.round(val)).toString() === '1' && val < 0.5
      ? Number(val.toFixed(2)).toString()
      : Math.round(val).toString();
  }
  if (frac > 0.94) {
    return (Math.floor(val) + 1).toString();
  }

  let bestGlyph = '';
  let bestDiff = Infinity;
  for (const [target, glyph] of FRACTION_TABLE) {
    const diff = Math.abs(frac - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestGlyph = glyph;
    }
  }

  if (bestDiff <= 0.055) {
    const baseWhole = Math.floor(val);
    return baseWhole > 0 ? `${baseWhole}${bestGlyph}` : bestGlyph;
  }

  return Number(val.toFixed(1)).toString();
}

export function pluralizeUnit(qty: number, unit: string): string {
  if (!unit) return '';
  const invariant = new Set(['tsp', 'tbsp', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'pinch']);
  if (invariant.has(unit)) return unit === 'l' ? 'L' : unit;
  if (qty <= 1.05) return unit;
  if (unit === 'bunch') return 'bunches';
  return unit.endsWith('s') ? unit : `${unit}s`;
}

function smartPromoteUSVolume(ml: number): { qty: number; unit: string } {
  const cups = ml / VOLUME_TO_ML.cup;
  if (cups >= 0.24) {
    return { qty: cups, unit: 'cup' };
  }
  const tbsp = ml / VOLUME_TO_ML.tbsp;
  if (tbsp >= 0.95) {
    return { qty: tbsp, unit: 'tbsp' };
  }
  return { qty: ml / VOLUME_TO_ML.tsp, unit: 'tsp' };
}

function smartPromoteMetricVolume(ml: number): { qty: number; unit: string } {
  if (ml >= 1000) return { qty: ml / 1000, unit: 'l' };
  return { qty: ml, unit: 'ml' };
}

function smartPromoteMetricWeight(g: number): { qty: number; unit: string } {
  if (g >= 1000) return { qty: g / 1000, unit: 'kg' };
  return { qty: g, unit: 'g' };
}

function smartPromoteUSWeight(g: number): { qty: number; unit: string } {
  const lbs = g / WEIGHT_TO_G.lb;
  if (lbs >= 0.95) return { qty: lbs, unit: 'lb' };
  return { qty: g / WEIGHT_TO_G.oz, unit: 'oz' };
}

export interface ScaledIngredientView {
  qtyMin: number | null;
  qtyMax: number | null;
  unit: string;
  formattedAmount: string;
  formattedLine: string;
  discreteTip?: string;
}

export function scaleIngredient(
  ing: RecipeIngredient,
  baseServings: number,
  targetServings: number,
  unitSystem: UnitSystem = 'original'
): ScaledIngredientView {
  const safeBase = baseServings > 0 ? baseServings : 1;
  const safeTarget = targetServings > 0 ? targetServings : safeBase;
  const multiplier = ing.isScalable ? safeTarget / safeBase : 1;

  if (ing.qtyMin === null) {
    const prepSuffix = ing.preparation ? `, ${ing.preparation}` : '';
    const optSuffix = ing.isOptional ? ' (optional)' : '';
    return {
      qtyMin: null,
      qtyMax: null,
      unit: ing.unit,
      formattedAmount: '',
      formattedLine: `${ing.rawText || `${ing.displayName}${prepSuffix}`}${optSuffix && !ing.rawText.includes('optional') ? optSuffix : ''}`,
    };
  }

  let scaledMin = ing.qtyMin * multiplier;
  let scaledMax = ing.qtyMax !== null ? ing.qtyMax * multiplier : null;
  let targetUnit = ing.unit;
  const canonical = getCanonicalById(ing.canonicalIngredientId);

  // Convert unit systems or smart-promote scaled volumes/weights
  if (isVolumeUnit(ing.unit)) {
    const mlMin = scaledMin * VOLUME_TO_ML[ing.unit];
    const mlMax = scaledMax !== null ? scaledMax * VOLUME_TO_ML[ing.unit] : null;

    if (unitSystem === 'metric') {
      if (canonical?.densityGPerMl && ing.canonicalIngredientId !== 'water' && ing.canonicalIngredientId !== 'milk' && ing.canonicalIngredientId !== 'chicken-broth') {
        const gMin = mlMin * canonical.densityGPerMl;
        const promoted = smartPromoteMetricWeight(gMin);
        scaledMin = promoted.qty;
        targetUnit = promoted.unit;
        scaledMax = mlMax !== null ? (mlMax * canonical.densityGPerMl) / (targetUnit === 'kg' ? 1000 : 1) : null;
      } else {
        const promoted = smartPromoteMetricVolume(mlMin);
        scaledMin = promoted.qty;
        targetUnit = promoted.unit;
        scaledMax = mlMax !== null ? mlMax / (targetUnit === 'l' ? 1000 : 1) : null;
      }
    } else if (unitSystem === 'us' || (unitSystem === 'original' && isUSUnit(ing.unit) && multiplier !== 1)) {
      const promoted = smartPromoteUSVolume(mlMin);
      scaledMin = promoted.qty;
      targetUnit = promoted.unit;
      scaledMax = mlMax !== null ? mlMax / VOLUME_TO_ML[targetUnit] : null;
    } else if (unitSystem === 'original' && isMetricUnit(ing.unit) && multiplier !== 1) {
      const promoted = smartPromoteMetricVolume(mlMin);
      scaledMin = promoted.qty;
      targetUnit = promoted.unit;
      scaledMax = mlMax !== null ? mlMax / (targetUnit === 'l' ? 1000 : 1) : null;
    }
  } else if (isWeightUnit(ing.unit)) {
    const gMin = scaledMin * WEIGHT_TO_G[ing.unit];
    const gMax = scaledMax !== null ? scaledMax * WEIGHT_TO_G[ing.unit] : null;

    if (unitSystem === 'metric' || (unitSystem === 'original' && isMetricUnit(ing.unit))) {
      const promoted = smartPromoteMetricWeight(gMin);
      scaledMin = promoted.qty;
      targetUnit = promoted.unit;
      scaledMax = gMax !== null ? gMax / (targetUnit === 'kg' ? 1000 : 1) : null;
    } else if (unitSystem === 'us' || (unitSystem === 'original' && isUSUnit(ing.unit))) {
      const promoted = smartPromoteUSWeight(gMin);
      scaledMin = promoted.qty;
      targetUnit = promoted.unit;
      scaledMax = gMax !== null ? gMax / WEIGHT_TO_G[targetUnit] : null;
    }
  }

  const minStr = formatKitchenNumber(scaledMin, targetUnit);
  const maxStr = scaledMax !== null ? formatKitchenNumber(scaledMax, targetUnit) : null;
  const qtyDisplay = maxStr && maxStr !== minStr ? `${minStr}–${maxStr}` : minStr;
  const unitDisplay = pluralizeUnit(scaledMax ?? scaledMin, targetUnit);
  const formattedAmount = unitDisplay ? `${qtyDisplay} ${unitDisplay}` : qtyDisplay;

  const prepSuffix = ing.preparation ? `, ${ing.preparation}` : '';
  const optSuffix = ing.isOptional ? ' (optional)' : '';
  const estSuffix = ing.isEstimated ? ' (est.)' : '';

  let discreteTip: string | undefined;
  if (!targetUnit && ing.canonicalIngredientId === 'egg' && scaledMin > 0 && scaledMin < 1) {
    discreteTip = `Tip: Beat 1 egg and measure ~${Math.round(scaledMin * 50)}g`;
  }

  return {
    qtyMin: scaledMin,
    qtyMax: scaledMax,
    unit: targetUnit,
    formattedAmount,
    formattedLine: `${formattedAmount} ${ing.displayName}${prepSuffix}${optSuffix}${estSuffix}`.trim(),
    discreteTip,
  };
}

export type StepSegment =
  | { type: 'text'; text: string }
  | { type: 'ingredient'; ingredientIndex: number; text: string }
  | { type: 'timer'; seconds: number; label: string };

/**
 * Renders tokenized step strings ("Cook {{ing:0}} for {{timer:300|5 mins}}")
 * into live-scaled UI segments for Cook Mode.
 */
export function renderStepTokens(
  tokenizedText: string,
  ingredients: RecipeIngredient[],
  baseServings: number,
  targetServings: number,
  unitSystem: UnitSystem = 'original'
): StepSegment[] {
  const segments: StepSegment[] = [];
  const tokenRegex = /\{\{(ing|timer):([^}]+)\}\}/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(tokenizedText)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: 'text', text: tokenizedText.slice(lastIdx, match.index) });
    }
    const kind = match[1];
    const payload = match[2];

    if (kind === 'ing') {
      const idx = Number(payload);
      const ing = ingredients[idx];
      if (ing) {
        const scaled = scaleIngredient(ing, baseServings, targetServings, unitSystem);
        const label = scaled.formattedAmount
          ? `${scaled.formattedAmount} ${ing.displayName.toLowerCase()}`
          : ing.displayName.toLowerCase();
        segments.push({ type: 'ingredient', ingredientIndex: idx, text: label });
      }
    } else if (kind === 'timer') {
      const [secStr, customLabel] = payload.split('|');
      const seconds = Math.max(5, Math.round(Number(secStr) || 60));
      const label = customLabel || formatDurationShort(seconds);
      segments.push({ type: 'timer', seconds, label });
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < tokenizedText.length) {
    segments.push({ type: 'text', text: tokenizedText.slice(lastIdx) });
  }

  return segments;
}

export function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins} min`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hr`;
}

/**
 * Automatically injects {{timer:SECONDS|LABEL}} tokens into plain-text cooking directions
 * so Paprika-style smart timers work even on manually pasted or JSON-LD blog recipes!
 */
export function autoTokenizeStepTimers(rawStep: string): string {
  if (rawStep.includes('{{timer:')) return rawStep;

  return rawStep.replace(
    /\b(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec)\b/gi,
    (fullMatch, n1Str, _n2Str, unitStr) => {
      const n1 = Number(n1Str);
      if (Number.isNaN(n1) || n1 <= 0) return fullMatch;
      const u = unitStr.toLowerCase();
      let multiplier = 60;
      if (u.startsWith('h')) multiplier = 3600;
      else if (u.startsWith('s')) multiplier = 1;
      const seconds = Math.round(n1 * multiplier);
      return `{{timer:${seconds}|${fullMatch}}}`;
    }
  );
}
