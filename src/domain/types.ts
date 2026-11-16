export type AisleCategory =
  | 'Produce'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Bakery & Bread'
  | 'Pantry & Grains'
  | 'Canned & Jarred'
  | 'Oils, Vinegars & Sauces'
  | 'Spices & Baking'
  | 'Frozen'
  | 'Other';

export const AISLE_ORDER: AisleCategory[] = [
  'Produce',
  'Bakery & Bread',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry & Grains',
  'Canned & Jarred',
  'Oils, Vinegars & Sauces',
  'Spices & Baking',
  'Frozen',
  'Other',
];

export type UnitSystem = 'original' | 'metric' | 'us';

export type SourcePlatform = 'tiktok' | 'instagram' | 'youtube' | 'web' | 'manual';

export interface CanonicalIngredient {
  id: string;
  name: string;
  aisle: AisleCategory;
  parentId?: string;
  isDefaultStaple?: boolean;
  /** Density in g/ml for bridging volume <-> weight */
  densityGPerMl?: number;
  /** Average weight in grams of 1 whole item/clove/unit */
  avgUnitWeightG?: number;
  aliases: string[];
}

export interface RecipeIngredient {
  id: string;
  sortOrder: number;
  canonicalIngredientId: string;
  displayName: string;
  rawText: string;
  qtyMin: number | null;
  qtyMax: number | null;
  unit: string;
  preparation?: string;
  isOptional: boolean;
  isScalable: boolean;
  isEstimated?: boolean;
  groupName?: string;
}

export interface RecipeStep {
  id: string;
  stepNumber: number;
  rawText: string;
  /**
   * Inline-tokenized step prose:
   * - {{ing:0}} dynamically renders scaled ingredient at index 0
   * - {{timer:300|5 mins}} renders a tappable 5-minute timer chip
   */
  tokenizedText: string;
  groupName?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  baseServings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  imageUrl?: string;
  sourceUrl?: string;
  sourcePlatform: SourcePlatform;
  sourceAuthor?: string;
  categories: string[];
  rating?: number;
  notes?: string;
  isFavorite: boolean;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
}

export interface GrocerySourceContribution {
  recipeId: string;
  recipeTitle: string;
  servings: number;
  qty: number | null;
  unit: string;
  rawLabel: string;
}

export interface GroceryItem {
  id: string;
  canonicalIngredientId: string;
  displayName: string;
  aisle: AisleCategory;
  totalQty: number | null;
  unit: string;
  extraAmounts: string[];
  formattedAmount: string;
  isChecked: boolean;
  sources: GrocerySourceContribution[];
  updatedAt: string;
}

export interface ActiveCookingSession {
  recipeId: string;
  targetServings: number;
  unitSystem: UnitSystem;
  checkedIngredientIds: string[];
  completedStepNumbers: number[];
  activeStepNumber: number | null;
  isPinned: boolean;
}

export interface RunningTimer {
  id: string;
  recipeId: string;
  recipeTitle: string;
  label: string;
  durationSeconds: number;
  endsAtMs: number | null;
  remainingSecondsWhenPaused: number;
  isRunning: boolean;
}

export type MatchTier = 'ready_now' | 'almost_there' | 'uses_your_items';

export interface RecipeMatchResult {
  recipe: Recipe;
  tier: MatchTier;
  matchedInputIds: string[];
  matchedInputNames: string[];
  totalEnteredCount: number;
  missingRequiredIngredients: RecipeIngredient[];
  optionalIngredients: RecipeIngredient[];
  requiredNonStapleCount: number;
  matchedRequiredCount: number;
  matchRatio: number;
  score: number;
}
