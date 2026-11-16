import { autoTokenizeStepTimers } from './scaling';
import { parseIngredientLine, resolveCanonicalIngredient } from './taxonomy';
import { Recipe, RecipeIngredient, RecipeStep, SourcePlatform } from './types';

/**
 * Extracts the first clean HTTP/HTTPS URL from messy mobile Share Sheet payloads,
 * e.g. "OMG make this tonight!! https://vt.tiktok.com/ZSMxyz123/ #foodtiktok #pasta"
 */
export function extractUrlFromSharedText(payload: string): string | null {
  const match = payload.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;!?)]+$/, '');
}

export function detectSourcePlatform(url: string): SourcePlatform {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return 'web';
}

function parseIsoDurationToMinutes(iso?: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return undefined;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const total = hours * 60 + mins;
  return total > 0 ? total : undefined;
}

function parseServingsNumber(yieldVal: unknown): number {
  if (typeof yieldVal === 'number' && yieldVal > 0) return Math.round(yieldVal);
  if (Array.isArray(yieldVal) && yieldVal.length > 0) {
    return parseServingsNumber(yieldVal[0]);
  }
  if (typeof yieldVal === 'string') {
    const m = yieldVal.match(/(\d+)/);
    if (m) return Math.max(1, Number(m[1]));
  }
  return 4;
}

function extractImageFromSchema(img: unknown): string | undefined {
  if (typeof img === 'string') return img;
  if (Array.isArray(img) && img.length > 0) return extractImageFromSchema(img[0]);
  if (img && typeof img === 'object' && 'url' in img && typeof (img as { url: unknown }).url === 'string') {
    return (img as { url: string }).url;
  }
  return undefined;
}

function extractInstructionsFromSchema(rawInstructions: unknown): string[] {
  if (!rawInstructions) return [];
  if (typeof rawInstructions === 'string') {
    return rawInstructions
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(rawInstructions)) {
    const steps: string[] = [];
    for (const entry of rawInstructions) {
      if (typeof entry === 'string') {
        steps.push(entry.trim());
      } else if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.text === 'string') {
          steps.push(obj.text.trim());
        } else if (Array.isArray(obj.itemListElement)) {
          steps.push(...extractInstructionsFromSchema(obj.itemListElement));
        }
      }
    }
    return steps.filter(Boolean);
  }
  return [];
}

function findRecipeNodeInJsonLd(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNodeInJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const typeVal = obj['@type'];
    const isRecipe =
      typeVal === 'Recipe' ||
      (Array.isArray(typeVal) && typeVal.includes('Recipe'));
    if (isRecipe) return obj;
    if (obj['@graph']) {
      return findRecipeNodeInJsonLd(obj['@graph']);
    }
  }
  return null;
}

/**
 * Extracts a structured Recipe from HTML containing schema.org/Recipe JSON-LD
 * (supported by >90% of recipe blogs and websites).
 */
export function parseRecipeFromHtmlJsonLd(html: string, sourceUrl: string): Recipe | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonText = match[1].trim();
      const parsed = JSON.parse(jsonText);
      const recipeNode = findRecipeNodeInJsonLd(parsed);
      if (recipeNode) {
        const rawIngredients = Array.isArray(recipeNode.recipeIngredient)
          ? recipeNode.recipeIngredient.filter((x): x is string => typeof x === 'string')
          : [];
        const rawSteps = extractInstructionsFromSchema(recipeNode.recipeInstructions);

        if (rawIngredients.length === 0 && rawSteps.length === 0) {
          continue;
        }

        const ingredients = rawIngredients.map((line, idx) => parseIngredientLine(line, idx));
        const steps: RecipeStep[] = rawSteps.map((stepText, idx) => ({
          id: `step-${idx + 1}-${Date.now().toString(36)}`,
          stepNumber: idx + 1,
          rawText: stepText,
          tokenizedText: autoTokenizeStepTimers(stepText),
        }));

        const now = new Date().toISOString();
        const categories: string[] = [];
        if (typeof recipeNode.recipeCategory === 'string') {
          categories.push(recipeNode.recipeCategory);
        } else if (Array.isArray(recipeNode.recipeCategory)) {
          categories.push(...recipeNode.recipeCategory.filter((c): c is string => typeof c === 'string'));
        }

        const authorNode = recipeNode.author as Record<string, unknown> | string | undefined;
        const sourceAuthor =
          typeof authorNode === 'string'
            ? authorNode
            : authorNode && typeof authorNode === 'object' && typeof authorNode.name === 'string'
              ? authorNode.name
              : undefined;

        return {
          id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          title: typeof recipeNode.name === 'string' ? recipeNode.name.trim() : 'Imported Web Recipe',
          description: typeof recipeNode.description === 'string' ? recipeNode.description.trim() : undefined,
          baseServings: parseServingsNumber(recipeNode.recipeYield),
          prepMinutes: parseIsoDurationToMinutes(recipeNode.prepTime),
          cookMinutes: parseIsoDurationToMinutes(recipeNode.cookTime),
          imageUrl: extractImageFromSchema(recipeNode.image),
          sourceUrl,
          sourcePlatform: detectSourcePlatform(sourceUrl),
          sourceAuthor,
          categories: categories.length > 0 ? categories : ['Imported'],
          isFavorite: false,
          ingredients,
          steps,
          createdAt: now,
          updatedAt: now,
        };
      }
    } catch {
      // Continue scanning next JSON-LD block
    }
  }

  return null;
}

/**
 * Parses unstructured social media caption text or copied notes into a structured Recipe.
 * Handles headings like "Ingredients:" / "Instructions:" / "Method:" or bullet heuristics.
 */
export function parseRecipeFromCaptionOrText(
  text: string,
  options?: {
    title?: string;
    sourceUrl?: string;
    sourceAuthor?: string;
    imageUrl?: string;
  }
): Recipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let inferredTitle = options?.title?.trim() || '';
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  let section: 'header' | 'ingredients' | 'steps' = 'header';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanHeader = line.toLowerCase().replace(/[:\-—*#]/g, '').trim();

    if (!inferredTitle && i === 0 && line.length < 85 && !/^\d/.test(line)) {
      inferredTitle = line.replace(/^#+\s*/, '');
      continue;
    }

    if (cleanHeader === 'ingredients' || cleanHeader === 'what you need') {
      section = 'ingredients';
      continue;
    }
    if (
      cleanHeader === 'instructions' ||
      cleanHeader === 'directions' ||
      cleanHeader === 'method' ||
      cleanHeader === 'steps' ||
      cleanHeader === 'preparation'
    ) {
      section = 'steps';
      continue;
    }

    if (section === 'ingredients') {
      ingredientLines.push(line);
    } else if (section === 'steps') {
      stepLines.push(line.replace(/^(?:step\s*)?\d+[.)]\s*/i, ''));
    } else {
      // Heuristic classification when a TikTok/IG caption has no explicit headers
      const looksLikeIngredient =
        /^(?:[-•*]|\d+\/\d+|\d+(?:\.\d+)?\s*(?:tbsp|tsp|cup|cups|g|kg|ml|oz|lb|lbs|cloves?|cans?|slices?)\b|[⅛¼⅓½⅔¾])/i.test(
          line
        ) && line.length < 95;
      if (looksLikeIngredient) {
        ingredientLines.push(line);
      } else if (line.length > 25 && !line.startsWith('#')) {
        stepLines.push(line.replace(/^(?:step\s*)?\d+[.)]\s*/i, ''));
      }
    }
  }

  const ingredients: RecipeIngredient[] = ingredientLines.map((line, idx) =>
    parseIngredientLine(line, idx)
  );
  const steps: RecipeStep[] = stepLines.map((s, idx) => ({
    id: `step-${idx + 1}-${Date.now().toString(36)}`,
    stepNumber: idx + 1,
    rawText: s,
    tokenizedText: autoTokenizeStepTimers(s),
  }));

  const now = new Date().toISOString();
  const platform = options?.sourceUrl ? detectSourcePlatform(options.sourceUrl) : 'manual';

  return {
    id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: inferredTitle || 'Imported Social Recipe',
    baseServings: 4,
    imageUrl: options?.imageUrl,
    sourceUrl: options?.sourceUrl,
    sourcePlatform: platform,
    sourceAuthor: options?.sourceAuthor,
    categories: platform === 'tiktok' || platform === 'instagram' ? ['Social Saves'] : ['Imported'],
    isFavorite: false,
    ingredients,
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Hydrates structured JSON payload returned by our Supabase Edge Function / Gemini Flash
 * into our canonical client Recipe object.
 */
export function hydrateStructuredImportPayload(payload: {
  title: string;
  description?: string;
  baseServings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  imageUrl?: string;
  sourceUrl?: string;
  sourceAuthor?: string;
  categories?: string[];
  ingredients: Array<{
    rawText: string;
    name: string;
    qtyMin: number | null;
    qtyMax?: number | null;
    unit?: string;
    preparation?: string;
    isOptional?: boolean;
    isScalable?: boolean;
    isEstimated?: boolean;
    groupName?: string;
  }>;
  steps: Array<{
    rawText: string;
    tokenizedText?: string;
    groupName?: string;
  }>;
}): Recipe {
  const now = new Date().toISOString();
  const ingredients: RecipeIngredient[] = payload.ingredients.map((item, idx) => {
    const resolved = resolveCanonicalIngredient(item.name || item.rawText);
    return {
      id: `ing-${idx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      sortOrder: idx,
      canonicalIngredientId: resolved.canonicalId,
      displayName: resolved.known ? resolved.displayName : item.name || resolved.displayName,
      rawText: item.rawText,
      qtyMin: item.qtyMin ?? null,
      qtyMax: item.qtyMax ?? null,
      unit: (item.unit ?? '').toLowerCase(),
      preparation: item.preparation,
      isOptional: Boolean(item.isOptional),
      isScalable: item.isScalable !== false && item.qtyMin !== null,
      isEstimated: Boolean(item.isEstimated),
      groupName: item.groupName,
    };
  });

  const steps: RecipeStep[] = payload.steps.map((s, idx) => ({
    id: `step-${idx + 1}-${Date.now().toString(36)}`,
    stepNumber: idx + 1,
    rawText: s.rawText,
    tokenizedText: s.tokenizedText ? autoTokenizeStepTimers(s.tokenizedText) : autoTokenizeStepTimers(s.rawText),
    groupName: s.groupName,
  }));

  const platform = payload.sourceUrl ? detectSourcePlatform(payload.sourceUrl) : 'manual';

  return {
    id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: payload.title || 'Imported Recipe',
    description: payload.description,
    baseServings: payload.baseServings && payload.baseServings > 0 ? payload.baseServings : 4,
    prepMinutes: payload.prepMinutes,
    cookMinutes: payload.cookMinutes,
    imageUrl: payload.imageUrl,
    sourceUrl: payload.sourceUrl,
    sourcePlatform: platform,
    sourceAuthor: payload.sourceAuthor,
    categories: payload.categories?.length ? payload.categories : ['Imported'],
    isFavorite: false,
    ingredients,
    steps,
    createdAt: now,
    updatedAt: now,
  };
}
