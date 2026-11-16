import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  extractUrlFromSharedText,
  hydrateStructuredImportPayload,
  parseRecipeFromCaptionOrText,
  parseRecipeFromHtmlJsonLd,
} from '@/src/domain/importer';
import { GroceryItem, Recipe } from '@/src/domain/types';

export interface CloudSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  ownerKey: string;
  geminiApiKey: string;
}

export function getDefaultCloudSettings(): CloudSettings {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    ownerKey: process.env.EXPO_PUBLIC_OWNER_KEY ?? 'personal',
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  };
}

export function isCloudConfigured(settings: CloudSettings): boolean {
  return Boolean(settings.supabaseUrl.trim() && settings.supabaseAnonKey.trim());
}

function makeSupabase(settings: CloudSettings): SupabaseClient | null {
  if (!isCloudConfigured(settings)) return null;
  return createClient(settings.supabaseUrl.trim(), settings.supabaseAnonKey.trim(), {
    auth: { persistSession: false },
  });
}

function mapDbRowToRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled Recipe'),
    description: row.description ? String(row.description) : undefined,
    baseServings: Number(row.base_servings ?? 4),
    prepMinutes: row.prep_minutes ? Number(row.prep_minutes) : undefined,
    cookMinutes: row.cook_minutes ? Number(row.cook_minutes) : undefined,
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    sourcePlatform: (row.source_platform as Recipe['sourcePlatform']) ?? 'manual',
    sourceAuthor: row.source_author ? String(row.source_author) : undefined,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    rating: row.rating ? Number(row.rating) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    isFavorite: Boolean(row.is_favorite),
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as Recipe['ingredients']) : [],
    steps: Array.isArray(row.steps) ? (row.steps as Recipe['steps']) : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    syncedAt: new Date().toISOString(),
  };
}

export async function pullCloudData(settings: CloudSettings): Promise<{
  recipes: Recipe[];
  groceryItems: GroceryItem[];
} | null> {
  const client = makeSupabase(settings);
  if (!client) return null;

  const owner = settings.ownerKey.trim() || 'personal';
  const [recRes, grocRes] = await Promise.all([
    client.from('recipes').select('*').eq('owner_key', owner).order('updated_at', { ascending: false }),
    client.from('grocery_items').select('*').eq('owner_key', owner),
  ]);

  if (recRes.error) {
    throw new Error(`Supabase recipes fetch failed: ${recRes.error.message}`);
  }
  if (grocRes.error) {
    throw new Error(`Supabase grocery fetch failed: ${grocRes.error.message}`);
  }

  const recipes = (recRes.data ?? []).map((r) => mapDbRowToRecipe(r as Record<string, unknown>));
  const groceryItems: GroceryItem[] = (grocRes.data ?? []).map((g: Record<string, unknown>) => ({
    id: String(g.id),
    canonicalIngredientId: String(g.canonical_ingredient_id),
    displayName: String(g.display_name),
    aisle: (g.aisle as GroceryItem['aisle']) ?? 'Other',
    totalQty: g.total_qty !== null && g.total_qty !== undefined ? Number(g.total_qty) : null,
    unit: String(g.unit ?? ''),
    extraAmounts: Array.isArray(g.extra_amounts) ? (g.extra_amounts as string[]) : [],
    formattedAmount: String(g.formatted_amount ?? ''),
    isChecked: Boolean(g.is_checked),
    sources: Array.isArray(g.sources) ? (g.sources as GroceryItem['sources']) : [],
    updatedAt: String(g.updated_at ?? new Date().toISOString()),
  }));

  return { recipes, groceryItems };
}

export async function upsertCloudRecipe(settings: CloudSettings, recipe: Recipe): Promise<void> {
  const client = makeSupabase(settings);
  if (!client) return;
  const owner = settings.ownerKey.trim() || 'personal';
  const { error } = await client.from('recipes').upsert({
    id: recipe.id,
    owner_key: owner,
    title: recipe.title,
    description: recipe.description ?? null,
    base_servings: recipe.baseServings,
    prep_minutes: recipe.prepMinutes ?? null,
    cook_minutes: recipe.cookMinutes ?? null,
    image_url: recipe.imageUrl ?? null,
    source_url: recipe.sourceUrl ?? null,
    source_platform: recipe.sourcePlatform,
    source_author: recipe.sourceAuthor ?? null,
    categories: recipe.categories,
    rating: recipe.rating ?? null,
    notes: recipe.notes ?? null,
    is_favorite: recipe.isFavorite,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeCloudRecipe(settings: CloudSettings, recipeId: string): Promise<void> {
  const client = makeSupabase(settings);
  if (!client) return;
  await client.from('recipes').delete().eq('id', recipeId);
}

export async function syncCloudGroceryItems(
  settings: CloudSettings,
  items: GroceryItem[]
): Promise<void> {
  const client = makeSupabase(settings);
  if (!client) return;
  const owner = settings.ownerKey.trim() || 'personal';
  await client.from('grocery_items').delete().eq('owner_key', owner);
  if (items.length === 0) return;

  await client.from('grocery_items').insert(
    items.map((item) => ({
      id: item.id,
      owner_key: owner,
      canonical_ingredient_id: item.canonicalIngredientId,
      display_name: item.displayName,
      aisle: item.aisle,
      total_qty: item.totalQty,
      unit: item.unit,
      extra_amounts: item.extraAmounts,
      formatted_amount: item.formattedAmount,
      is_checked: item.isChecked,
      sources: item.sources,
      updated_at: item.updatedAt,
    }))
  );
}

async function extractWithDirectGemini(
  geminiKey: string,
  contextText: string,
  sourceUrl?: string,
  imageUrl?: string,
  author?: string
): Promise<Recipe> {
  const prompt = `Extract a clean, structured cooking recipe JSON from the content below.
Schema keys required:
- title (string)
- description (string)
- baseServings (number)
- prepMinutes (number, optional)
- cookMinutes (number, optional)
- categories (string[])
- ingredients: Array<{ rawText: string, name: string, qtyMin: number | null, qtyMax?: number | null, unit?: string, preparation?: string, isOptional?: boolean, isScalable?: boolean, isEstimated?: boolean }>
- steps: Array<{ rawText: string, tokenizedText: string }>
In tokenizedText, replace direct ingredient mentions with {{ing:INDEX}} (0-based index) and durations with {{timer:SECONDS|LABEL}}.

Content:
${contextText}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey.trim()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  if (!resp.ok) {
    throw new Error(`Gemini API returned ${resp.status}`);
  }
  const data = await resp.json();
  const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(rawJson);
  return hydrateStructuredImportPayload({
    ...parsed,
    sourceUrl,
    imageUrl: imageUrl || parsed.imageUrl,
    sourceAuthor: author || parsed.sourceAuthor,
  });
}

/**
 * Multi-tier Recipe Importer:
 * 1. Tries Supabase Edge Function (/functions/v1/import-recipe) if cloud is configured
 * 2. Falls back to direct fetch + schema.org JSON-LD / TikTok oEmbed + optional Gemini Flash
 * 3. Parses raw pasted social media captions or cookbook text offline
 */
export async function importRecipeUniversal(
  rawInput: string,
  settings: CloudSettings
): Promise<{ recipe: Recipe; methodUsed: string }> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please paste a recipe URL or caption text first.');
  }

  const cleanUrl = extractUrlFromSharedText(trimmed);

  // Tier A: Cloud Edge Function (handles TikTok/IG transcripts, Gemini extraction, and thumbnail storage)
  const client = makeSupabase(settings);
  if (client && cleanUrl) {
    try {
      const { data, error } = await client.functions.invoke('import-recipe', {
        body: { url: cleanUrl, ownerKey: settings.ownerKey || 'personal', saveToDb: false },
      });
      if (!error && data?.ok && data?.recipe) {
        return {
          recipe: hydrateStructuredImportPayload(data.recipe),
          methodUsed: 'Supabase Cloud Importer',
        };
      }
    } catch {
      // Fall through to client extraction tiers
    }
  }

  // Tier B: Direct URL Inspection (TikTok oEmbed / Web JSON-LD / OpenGraph)
  if (cleanUrl) {
    if (cleanUrl.includes('tiktok.com')) {
      try {
        const oembedResp = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`
        );
        if (oembedResp.ok) {
          const meta = await oembedResp.json();
          const captionText = String(meta.title ?? '');
          if (settings.geminiApiKey.trim()) {
            const aiRecipe = await extractWithDirectGemini(
              settings.geminiApiKey,
              `TikTok by ${meta.author_name ?? ''}:\n${captionText}`,
              cleanUrl,
              meta.thumbnail_url,
              meta.author_name
            );
            return { recipe: aiRecipe, methodUsed: 'TikTok oEmbed + Gemini AI' };
          }
          return {
            recipe: parseRecipeFromCaptionOrText(captionText, {
              sourceUrl: cleanUrl,
              sourceAuthor: meta.author_name,
              imageUrl: meta.thumbnail_url,
            }),
            methodUsed: 'TikTok Caption Parser',
          };
        }
      } catch {
        // Continue to generic fetch
      }
    }

    try {
      const pageResp = await fetch(cleanUrl);
      const html = await pageResp.text();

      // Deterministic schema.org/Recipe JSON-LD (instant & free for 90% of recipe websites)
      const jsonLdRecipe = parseRecipeFromHtmlJsonLd(html, cleanUrl);
      if (jsonLdRecipe && jsonLdRecipe.ingredients.length > 0) {
        return { recipe: jsonLdRecipe, methodUsed: 'Web schema.org/Recipe Parser' };
      }

      const ogTitle =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? '';
      const ogDesc =
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        '';
      const ogImage = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      )?.[1];

      const combinedMeta = `${ogTitle}\n${ogDesc}`.trim();
      if (settings.geminiApiKey.trim()) {
        const bodySnippet = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 10000);
        const aiRecipe = await extractWithDirectGemini(
          settings.geminiApiKey,
          `${combinedMeta}\n\n${bodySnippet}`,
          cleanUrl,
          ogImage
        );
        return { recipe: aiRecipe, methodUsed: 'Gemini AI Extractor' };
      }

      if (combinedMeta.length > 20) {
        return {
          recipe: parseRecipeFromCaptionOrText(combinedMeta, {
            title: ogTitle,
            sourceUrl: cleanUrl,
            imageUrl: ogImage,
          }),
          methodUsed: 'Social OpenGraph Caption Parser',
        };
      }
    } catch {
      // If mobile network / CORS blocks direct page scrape without Edge Function, guide user cleanly
      throw new Error(
        'Direct scraping was blocked by this platform. Connect your Supabase Edge Function (or paste the post caption below) to import from locked social reels.'
      );
    }
  }

  // Tier C: Raw Caption / Pasted Text (with Gemini if configured, or deterministic local parser)
  if (settings.geminiApiKey.trim()) {
    const aiRecipe = await extractWithDirectGemini(settings.geminiApiKey, trimmed);
    return { recipe: aiRecipe, methodUsed: 'Gemini AI Text Parser' };
  }

  return {
    recipe: parseRecipeFromCaptionOrText(trimmed),
    methodUsed: 'Local Smart Recipe Parser',
  };
}
