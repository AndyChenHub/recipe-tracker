import { autoTokenizeStepTimers } from './scaling';
import {
  CANONICAL_INGREDIENTS,
  parseIngredientLine,
  resolveCanonicalIngredient,
} from './taxonomy';
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

/**
 * Cleans WebVTT subtitle files (from TikTok's subtitleInfos / claInfo) into plain spoken text.
 */
export function cleanWebVttTranscript(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const spoken: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'WEBVTT' || line.startsWith('NOTE') || line.startsWith('STYLE')) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(line)) continue;
    if (/^\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[.,]\d{3}/.test(line)) continue;
    const stripped = line.replace(/<[^>]+>/g, '').trim();
    if (stripped && spoken[spoken.length - 1] !== stripped) {
      spoken.push(stripped);
    }
  }
  return spoken.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Links ingredient mentions inside step prose to {{ing:INDEX}} tokens so
 * dynamic serving scaling updates quantities inside directions too.
 */
export function linkIngredientsInStepText(
  stepText: string,
  ingredients: RecipeIngredient[]
): string {
  let result = autoTokenizeStepTimers(stepText);
  if ( result.includes('{{ing:')) {
    return result;
  }

  // Match longest ingredient display names first so "chicken breast" matches before "chicken"
  const indexed = ingredients
    .map((ing, idx) => ({ ing, idx }))
    .filter(({ ing }) => ing.displayName.length >= 3 && ing.qtyMin !== null)
    .sort((a, b) => b.ing.displayName.length - a.ing.displayName.length);

  const usedIndices = new Set<number>();

  for (const { ing, idx } of indexed) {
    if (usedIndices.has(idx)) continue;
    const escapedName = ing.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match optional quantity + unit + ingredient name, e.g. "2 tbsp butter" or "300 g rigatoni"
    const qtyUnitNameRegex = new RegExp(
      `\\b(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[⅛¼⅓⅜½⅝⅔¾⅞])\\s*(?:tbsp|tablespoons?|tsp|teaspoons?|cups?|g|grams?|kg|ml|l|oz|ounces?|lbs?|pounds?|cloves?|slices?|cans?)?\\s+(?:of\\s+)?${escapedName}s?\\b`,
      'i'
    );
    if (qtyUnitNameRegex.test(result)) {
      result = result.replace(qtyUnitNameRegex, `{{ing:${idx}}}`);
      usedIndices.add(idx);
    }
  }

  return result;
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
          tokenizedText: linkIngredientsInStepText(stepText, ingredients),
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

const IMPERATIVE_STEP_START =
  /^(?:step\s*\d+|first|second|third|next|then|finally|meanwhile|in a\b|to a\b|heat\b|preheat\b|sear\b|boil\b|cook\b|bake\b|roast\b|fry\b|saute\b|sauté\b|simmer\b|whisk\b|mix\b|stir\b|combine\b|fold\b|add\b|pour\b|transfer\b|remove\b|drain\b|season\b|toss\b|serve\b|garnish\b|let\b|cover\b|place\b|slice\b|cut\b|chop\b)/i;

const SPOKEN_NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  twelve: '12',
  'a half': '1/2',
  'half a': '1/2',
  'a quarter': '1/4',
  'quarter of a': '1/4',
  'a third': '1/3',
  'a couple': '2',
  'a few': '3',
};

function stripHashtags(str: string): string {
  return str
    .replace(/(?:^|\s)#[a-zA-Z0-9_🧭✨🔥🍜🍝🍗🥩🥗🍲]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpokenNumbers(text: string): string {
  let out = text;
  for (const [word, digit] of Object.entries(SPOKEN_NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    out = out.replace(re, digit);
  }
  return out;
}

/**
 * Extracts ingredients and steps from unstructured spoken transcripts or prose paragraphs
 * when a creator speaks or writes a recipe in paragraph form without bullet lists.
 */
function extractFromProseOrTranscript(prose: string): {
  ingredientLines: string[];
  stepLines: string[];
} {
  const normalized = normalizeSpokenNumbers(prose);
  const foundIngredients: string[] = [];
  const seenCanonicalIds = new Set<string>();

  // Sort canonical terms longest-first so "heavy cream" matches before "cream" and "chicken thigh" before "chicken"
  const candidateTerms: Array<{ term: string; id: string; name: string }> = [];
  for (const item of CANONICAL_INGREDIENTS) {
    candidateTerms.push({ term: item.name.toLowerCase(), id: item.id, name: item.name });
    for (const alias of item.aliases) {
      if (alias.length >= 3) {
        candidateTerms.push({ term: alias.toLowerCase(), id: item.id, name: item.name });
      }
    }
  }
  candidateTerms.sort((a, b) => b.term.length - a.term.length);

  const lowerNorm = normalized.toLowerCase();

  for (const { term, id, name } of candidateTerms) {
    if (seenCanonicalIds.has(id)) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?:(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[⅛¼⅓⅜½⅝⅔¾⅞])\\s*(tbsp|tablespoons?|tsp|teaspoons?|cups?|g|grams?|kg|ml|l|oz|ounces?|lbs?|pounds?|cloves?|slices?|cans?|packets?|boxes?|bunches?)?\\s+(?:of\\s+)?(?:fresh\\s+|finely\\s+|minced\\s+|diced\\s+|sliced\\s+|grated\\s+|boneless\\s+|skinless\\s+)*)?\\b${escaped}s?\\b`,
      'i'
    );
    const match = lowerNorm.match(regex);
    if (match) {
      seenCanonicalIds.add(id);
      const qty = match[1]?.trim();
      const unit = match[2]?.trim();
      if (qty && unit) {
        foundIngredients.push(`${qty} ${unit} ${name}`);
      } else if (qty) {
        foundIngredients.push(`${qty} ${name}`);
      } else if (id !== 'water') {
        foundIngredients.push(name);
      }
    }
  }

  // Split prose into cooking step sentences
  const rawSentences = normalized
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => stripHashtags(s).trim())
    .filter((s) => s.length >= 15);

  const stepLines = rawSentences.filter(
    (s) =>
      !/^(?:hey guys|welcome back|follow for more|don't forget to|like and subscribe|link in bio)/i.test(
        s
      )
  );

  return { ingredientLines: foundIngredients, stepLines };
}

/**
 * Parses unstructured social media caption text, spoken transcripts, OCR text,
 * or copied notes into a structured Recipe.
 */
export function parseRecipeFromCaptionOrText(
  text: string,
  options?: {
    title?: string;
    sourceUrl?: string;
    sourceAuthor?: string;
    imageUrl?: string;
    transcript?: string;
  }
): Recipe {
  const combinedSource = [text, options?.transcript].filter(Boolean).join('\n\n');

  // Expand inline bullets (•, ·, ▪, ▸) and Unicode line separators (\u2028, \u2029) into distinct lines
  const normalizedText = combinedSource
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\s*[•·▪▸➢]\s*/g, '\n• ')
    .replace(/\b(ingredients|instructions|directions|method|steps)\s*:/gi, '\n$1:\n');

  const rawLines = normalizedText
    .split(/\r?\n/)
    .map((l) => stripHashtags(l).trim())
    .filter(Boolean);

  let inferredTitle = stripHashtags(options?.title?.trim() || '');
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  let section: 'header' | 'ingredients' | 'steps' = 'header';

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cleanHeader = line
      .toLowerCase()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
      .trim();

    if (
      cleanHeader === 'ingredients' ||
      cleanHeader === 'ingredient list' ||
      cleanHeader === 'what you need' ||
      cleanHeader === 'what youll need' ||
      cleanHeader.startsWith('for the ')
    ) {
      section = 'ingredients';
      continue;
    }

    if (
      cleanHeader === 'instructions' ||
      cleanHeader === 'directions' ||
      cleanHeader === 'method' ||
      cleanHeader === 'steps' ||
      cleanHeader === 'preparation' ||
      cleanHeader === 'how to make' ||
      cleanHeader === 'how to make it'
    ) {
      section = 'steps';
      continue;
    }

    // Strip leading bullets/emojis for testing
    const withoutBullet = line
      .replace(/^[\s•\-*▪▸➢✅👉🔸🔹🍴🥄🧄🧅🍗🥩🧀🍅🍋]+/, '')
      .trim();
    if (!withoutBullet) continue;

    // Infer title from first non-ingredient, non-numbered short line if not provided
    if (
      !inferredTitle &&
      i === 0 &&
      withoutBullet.length <= 85 &&
      !/^(?:\d+\/\d+|\d+\s*(?:tbsp|tsp|cup|g|kg|ml|oz|lb|clove))/i.test(withoutBullet)
    ) {
      inferredTitle = withoutBullet.replace(/^#+\s*/, '');
      continue;
    }

    const isNumberedStep = /^(?:step\s*)?\d+[.):]\s+[A-Za-z]/i.test(withoutBullet);
    const startsWithQuantity =
      /^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[⅛¼⅓⅜½⅝⅔¾⅞])\s*(?:tbsp|tablespoons?|tsp|teaspoons?|cups?|g|grams?|kg|ml|l|oz|ounces?|lbs?|pounds?|cloves?|cans?|slices?|packets?|boxes?|bunches?|pinch|fillets?|breasts?|thighs?|eggs?|onions?|lemons?|limes?|potatoes?|tomatoes?)\b/i.test(
        withoutBullet
      );

    // Check if a short line resolves to a known canonical ingredient (e.g. "2 salmon fillets" or "Salt and pepper to taste")
    const parsedCandidate = parseIngredientLine(withoutBullet, 0);
    const isKnownCanonicalIngredient =
      !parsedCandidate.canonicalIngredientId.startsWith('custom-') &&
      withoutBullet.length < 75 &&
      !IMPERATIVE_STEP_START.test(withoutBullet);

    if (section === 'ingredients') {
      // Transition automatically to steps if the creator starts listing numbered steps or long cooking sentences
      if (
        isNumberedStep ||
        (withoutBullet.length > 75 && IMPERATIVE_STEP_START.test(withoutBullet))
      ) {
        section = 'steps';
        stepLines.push(withoutBullet.replace(/^(?:step\s*)?\d+[.):]\s*/i, ''));
      } else {
        ingredientLines.push(withoutBullet);
      }
    } else if (section === 'steps') {
      stepLines.push(withoutBullet.replace(/^(?:step\s*)?\d+[.):]\s*/i, ''));
    } else {
      // Header/unsectioned mode (common in TikTok captions without "Ingredients:" headings)
      if (startsWithQuantity || (isKnownCanonicalIngredient && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || parsedCandidate.qtyMin !== null))) {
        ingredientLines.push(withoutBullet);
      } else if (
        isNumberedStep ||
        IMPERATIVE_STEP_START.test(withoutBullet) ||
        withoutBullet.length > 35
      ) {
        stepLines.push(withoutBullet.replace(/^(?:step\s*)?\d+[.):]\s*/i, ''));
      } else if (isKnownCanonicalIngredient) {
        ingredientLines.push(withoutBullet);
      }
    }
  }

  // Fallback: if caption was prose or a spoken transcript with 0 structured ingredient lines,
  // run prose/transcript ingredient & sentence extraction!
  if (ingredientLines.length === 0 && combinedSource.trim().length > 0) {
    const bodyWithoutTitle = rawLines
      .filter((l) => l.replace(/^#+\s*/, '').trim() !== inferredTitle)
      .join('\n');
    const proseExtracted = extractFromProseOrTranscript(bodyWithoutTitle || combinedSource);
    if (proseExtracted.ingredientLines.length > 0) {
      ingredientLines.push(...proseExtracted.ingredientLines);
    }
    if (proseExtracted.stepLines.length > 0) {
      stepLines.length = 0;
      stepLines.push(...proseExtracted.stepLines);
    }
  }

  // If title is still overly long (e.g. entire TikTok caption passed as title), trim to first sentence/clause
  if (inferredTitle.length > 80) {
    inferredTitle = inferredTitle.split(/[.\n!|•]/)[0].trim().slice(0, 75);
  }

  const ingredients: RecipeIngredient[] = ingredientLines.map((line, idx) =>
    parseIngredientLine(line, idx)
  );
  const steps: RecipeStep[] = stepLines.map((s, idx) => ({
    id: `step-${idx + 1}-${Date.now().toString(36)}`,
    stepNumber: idx + 1,
    rawText: s,
    tokenizedText: linkIngredientsInStepText(s, ingredients),
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
    categories:
      platform === 'tiktok' || platform === 'instagram' || platform === 'youtube'
        ? ['Social Saves']
        : ['Imported'],
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
    tokenizedText: s.tokenizedText
      ? autoTokenizeStepTimers(s.tokenizedText)
      : linkIngredientsInStepText(s.rawText, ingredients),
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
