import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  cleanWebVttTranscript,
  extractUrlFromSharedText,
  hydrateStructuredImportPayload,
  parseRecipeFromCaptionOrText,
  parseRecipeFromHtmlJsonLd,
} from '../domain/importer';
import { GroceryItem, Recipe } from '../domain/types';

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

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 8500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: options?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
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
  options?: {
    sourceUrl?: string;
    imageUrl?: string;
    author?: string;
    inlineImageBase64?: string;
    inlineImageMimeType?: string;
  }
): Promise<Recipe> {
  const prompt = `Extract a clean, structured cooking recipe JSON from the provided content or image.
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

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (options?.inlineImageBase64) {
    parts.push({
      inlineData: {
        mimeType: options.inlineImageMimeType || 'image/jpeg',
        data: options.inlineImageBase64,
      },
    });
  }

  const resp = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey.trim()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
    18000
  );
  if (!resp.ok) {
    throw new Error(`Gemini API returned ${resp.status}`);
  }
  const data = await resp.json();
  const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(rawJson);
  return hydrateStructuredImportPayload({
    ...parsed,
    sourceUrl: options?.sourceUrl,
    imageUrl: options?.imageUrl || parsed.imageUrl,
    sourceAuthor: options?.author || parsed.sourceAuthor,
  });
}

export interface TikTokExtractedContext {
  title?: string;
  caption: string;
  transcript: string;
  author?: string;
  thumbnailUrl?: string;
  resolvedUrl: string;
}

/**
 * Multi-source TikTok Extractor:
 * 1. Handles TikTok Notes / Lemon8 (`notes.tiktok.com`) article pages
 * 2. Queries `tikwm.com/api` (resolves `vt.tiktok.com` / `vm.tiktok.com` shortlinks + returns full caption, cover, author)
 * 3. Fetches TikTok HTML with `User-Agent: curl/8.4.0` to extract `__UNIVERSAL_DATA_FOR_REHYDRATION__`
 *    AND downloads the video's spoken `WEBVTT` voiceover subtitles (`subtitleInfos` / `claInfo`)!
 */
export async function fetchTikTokContext(url: string): Promise<TikTokExtractedContext> {
  let caption = '';
  let transcript = '';
  let author: string | undefined;
  let thumbnailUrl: string | undefined;
  let title: string | undefined;
  let resolvedUrl = url;

  // Path 1: TikTok Notes / Lemon8 (`notes.tiktok.com`)
  if (url.toLowerCase().includes('notes.tiktok.com')) {
    try {
      const resp = await fetchWithTimeout(url, undefined, 8000);
      const html = await resp.text();
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
      if (ogTitle) title = decodeHtmlEntities(ogTitle);
      if (ogImage) thumbnailUrl = decodeHtmlEntities(ogImage);

      const plain = decodeHtmlEntities(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, '\n')
      )
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');

      caption = plain.slice(0, 6000);
      return { title, caption, transcript, author, thumbnailUrl, resolvedUrl };
    } catch {
      // Continue to other extractors
    }
  }

  // Path 2 & 3 in parallel: tikwm API + direct rehydration HTML with WebVTT subtitle extraction
  const tikwmPromise = (async () => {
    try {
      const resp = await fetchWithTimeout(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
        undefined,
        7500
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      if (json?.code === 0 && json?.data) {
        return json.data as Record<string, unknown>;
      }
    } catch {
      // Ignore tikwm failure
    }
    return null;
  })();

  const rehydrationPromise = (async () => {
    try {
      const resp = await fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'curl/8.4.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        7500
      );
      if (resp.url) resolvedUrl = resp.url;
      const html = await resp.text();
      const match = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
      );
      if (!match) return null;
      const parsed = JSON.parse(match[1]);
      const scope = parsed?.__DEFAULT_SCOPE__;
      const item =
        scope?.['webapp.video-detail']?.itemInfo?.itemStruct ??
        scope?.['webapp.reflow.video.detail']?.itemInfo?.itemStruct;
      if (!item) return null;

      // Check for spoken WebVTT subtitles in subtitleInfos or claInfo
      const subs: Array<Record<string, unknown>> = Array.isArray(item.video?.subtitleInfos)
        ? item.video.subtitleInfos
        : [];
      const claSubs: Array<Record<string, unknown>> = Array.isArray(
        item.video?.claInfo?.captionInfos
      )
        ? item.video.claInfo.captionInfos
        : [];

      const subUrl = String(subs[0]?.Url ?? subs[0]?.url ?? claSubs[0]?.url ?? claSubs[0]?.Url ?? '');
      let vttTranscript = '';
      if (subUrl.startsWith('http')) {
        try {
          const vttResp = await fetchWithTimeout(subUrl, undefined, 5000);
          if (vttResp.ok) {
            const rawVtt = await vttResp.text();
            vttTranscript = cleanWebVttTranscript(rawVtt);
          }
        } catch {
          // Ignore subtitle fetch error
        }
      }

      return { item, vttTranscript };
    } catch {
      return null;
    }
  })();

  const [tikwmData, rehydData] = await Promise.all([tikwmPromise, rehydrationPromise]);

  if (rehydData?.item) {
    const item = rehydData.item;
    caption = String(item.desc ?? item.imagePost?.title ?? '').trim();
    if (item.imagePost?.title) {
      title = String(item.imagePost.title).trim();
    }
    const authObj = item.author as Record<string, unknown> | undefined;
    if (authObj?.uniqueId) {
      author = `@${authObj.uniqueId}`;
    } else if (authObj?.nickname) {
      author = String(authObj.nickname);
    }
    if (item.video?.cover || item.video?.originCover) {
      thumbnailUrl = String(item.video.cover || item.video.originCover);
    }
    if (rehydData.vttTranscript) {
      transcript = rehydData.vttTranscript;
    }
  }

  if (tikwmData) {
    const twTitle = String(tikwmData.title ?? '').trim();
    const twContentDesc = Array.isArray(tikwmData.content_desc)
      ? tikwmData.content_desc.join('\n').trim()
      : '';
    const bestTwCaption = twContentDesc.length > twTitle.length ? twContentDesc : twTitle;
    if (bestTwCaption.length > caption.length) {
      caption = bestTwCaption;
    }
    if (!thumbnailUrl && (tikwmData.origin_cover || tikwmData.cover)) {
      thumbnailUrl = String(tikwmData.origin_cover || tikwmData.cover);
    }
    const twAuthor = tikwmData.author as Record<string, unknown> | undefined;
    if (!author && twAuthor) {
      author = twAuthor.unique_id
        ? `@${twAuthor.unique_id}`
        : twAuthor.nickname
          ? String(twAuthor.nickname)
          : undefined;
    }
  }

  return { title, caption, transcript, author, thumbnailUrl, resolvedUrl };
}

/**
 * Scans a cookbook page photo or recipe screenshot (base64 JPEG/PNG)
 * using Gemini 2.5 Flash Vision (if key configured) or OCR.space Engine 2 (free, zero-config).
 */
export async function scanRecipeFromImageBase64(
  base64Data: string,
  mimeType = 'image/jpeg',
  settings: CloudSettings,
  localImageUri?: string
): Promise<{ recipe: Recipe; rawText: string; methodUsed: string }> {
  const cleanB64 = base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  // Tier 1: Gemini 2.5 Flash Multimodal Vision
  if (settings.geminiApiKey.trim()) {
    try {
      const recipe = await extractWithDirectGemini(
        settings.geminiApiKey,
        'Extract the full recipe (title, servings, ingredients with quantities, and step-by-step instructions) from this scanned cookbook page or recipe screenshot.',
        {
          imageUrl: localImageUri,
          inlineImageBase64: cleanB64,
          inlineImageMimeType: mimeType,
        }
      );
      recipe.categories = ['Scanned'];
      return {
        recipe,
        rawText: recipe.ingredients.map((i) => i.rawText).join('\n'),
        methodUsed: 'Gemini Vision Page Scanner',
      };
    } catch {
      // Fall back to OCR.space below
    }
  }

  // Tier 2: Built-in Zero-Config Cloud OCR (OCR.space Engine 2)
  const form = new URLSearchParams();
  form.append('apikey', 'helloworld');
  form.append('base64Image', `data:${mimeType};base64,${cleanB64}`);
  form.append('language', 'eng');
  form.append('OCREngine', '2');
  form.append('scale', 'true');

  const resp = await fetchWithTimeout(
    'https://api.ocr.space/parse/image',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    15000
  );

  if (!resp.ok) {
    throw new Error(`Page OCR service returned HTTP ${resp.status}.`);
  }

  const ocrJson = await resp.json();
  const parsedText = String(ocrJson?.ParsedResults?.[0]?.ParsedText ?? '').trim();

  if (!parsedText) {
    throw new Error(
      'Could not read text from this image. Try a clearer photo or add your Gemini API Key in Cloud Sync for AI Vision scanning.'
    );
  }

  const recipe = parseRecipeFromCaptionOrText(parsedText, {
    imageUrl: localImageUri,
  });
  recipe.categories = ['Scanned'];

  return {
    recipe,
    rawText: parsedText,
    methodUsed: 'Cookbook Page OCR Scanner',
  };
}

export interface UniversalImportResult {
  recipe: Recipe;
  methodUsed: string;
  needsManualCompletion?: boolean;
}

/**
 * Multi-tier Universal Recipe Importer:
 * 1. Tries Supabase Edge Function (/functions/v1/import-recipe) if cloud is configured
 * 2. Dedicated TikTok extractor (tikwm + __UNIVERSAL_DATA_FOR_REHYDRATION__ + WebVTT spoken subtitles + Notes)
 * 3. Web schema.org/Recipe JSON-LD + OpenGraph + optional Gemini Flash
 * 4. Raw pasted social media captions or cookbook text offline
 */
export async function importRecipeUniversal(
  rawInput: string,
  settings: CloudSettings
): Promise<UniversalImportResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please paste a recipe URL or caption text first.');
  }

  const cleanUrl = extractUrlFromSharedText(trimmed);
  // Check if user pasted BOTH a URL and extra caption lines
  const textAlongsideUrl = cleanUrl ? trimmed.replace(cleanUrl, '').trim() : '';

  // Tier A: Cloud Edge Function (if configured)
  const client = makeSupabase(settings);
  if (client && cleanUrl) {
    try {
      const { data, error } = await client.functions.invoke('import-recipe', {
        body: { url: cleanUrl, ownerKey: settings.ownerKey || 'personal', saveToDb: false },
      });
      if (!error && data?.ok && data?.recipe) {
        const hydrated = hydrateStructuredImportPayload(data.recipe);
        if (hydrated.ingredients.length > 0 || hydrated.steps.length > 0) {
          return {
            recipe: hydrated,
            methodUsed: 'Supabase Cloud Importer',
          };
        }
      }
    } catch {
      // Fall through to client extraction tiers
    }
  }

  // Tier B: Dedicated TikTok Video / Shortlink / Photo / Notes Extractor
  if (cleanUrl && cleanUrl.toLowerCase().includes('tiktok.com')) {
    const tt = await fetchTikTokContext(cleanUrl);
    const fullCaption = [textAlongsideUrl, tt.caption].filter(Boolean).join('\n');
    const combinedContext = [
      tt.title ? `Title: ${tt.title}` : '',
      fullCaption ? `Caption:\n${fullCaption}` : '',
      tt.transcript ? `Spoken Video Transcript:\n${tt.transcript}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (settings.geminiApiKey.trim() && combinedContext.length > 10) {
      try {
        const aiRecipe = await extractWithDirectGemini(settings.geminiApiKey, combinedContext, {
          sourceUrl: tt.resolvedUrl || cleanUrl,
          imageUrl: tt.thumbnailUrl,
          author: tt.author,
        });
        if (aiRecipe.ingredients.length > 0 || aiRecipe.steps.length > 0) {
          return { recipe: aiRecipe, methodUsed: 'TikTok + Gemini AI' };
        }
      } catch {
        // Fall through to local caption + transcript parser
      }
    }

    if (fullCaption || tt.transcript) {
      const parsed = parseRecipeFromCaptionOrText(fullCaption, {
        title: tt.title,
        sourceUrl: tt.resolvedUrl || cleanUrl,
        sourceAuthor: tt.author,
        imageUrl: tt.thumbnailUrl,
        transcript: tt.transcript,
      });

      const hasContent = parsed.ingredients.length > 0 || parsed.steps.length > 0;
      return {
        recipe: parsed,
        methodUsed: tt.transcript
          ? 'TikTok Caption + Voiceover Transcript Parser'
          : 'TikTok Recipe Parser',
        needsManualCompletion: !hasContent,
      };
    }

    // Even if the TikTok video had zero caption and zero subtitles (e.g. music-only clip),
    // return metadata so the user can complete it in the Recipe Editor instead of hitting a dead end
    const shell = parseRecipeFromCaptionOrText(textAlongsideUrl || tt.title || 'TikTok Recipe', {
      title: tt.title || (tt.author ? `TikTok Recipe by ${tt.author}` : 'TikTok Recipe'),
      sourceUrl: tt.resolvedUrl || cleanUrl,
      sourceAuthor: tt.author,
      imageUrl: tt.thumbnailUrl,
    });
    return {
      recipe: shell,
      methodUsed: 'TikTok Metadata Extractor',
      needsManualCompletion: shell.ingredients.length === 0 && shell.steps.length === 0,
    };
  }

  // Tier C: Direct Web / Instagram / YouTube URL Inspection (schema.org JSON-LD + OpenGraph)
  if (cleanUrl) {
    try {
      const pageResp = await fetchWithTimeout(
        cleanUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          },
        },
        8500
      );
      const html = await pageResp.text();

      // Deterministic schema.org/Recipe JSON-LD (instant & free for >90% of recipe websites)
      const jsonLdRecipe = parseRecipeFromHtmlJsonLd(html, cleanUrl);
      if (jsonLdRecipe && (jsonLdRecipe.ingredients.length > 0 || jsonLdRecipe.steps.length > 0)) {
        return { recipe: jsonLdRecipe, methodUsed: 'Web schema.org/Recipe Parser' };
      }

      const ogTitle = decodeHtmlEntities(
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? ''
      );
      const ogDesc = decodeHtmlEntities(
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
          ''
      );
      const ogImage = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      )?.[1];

      const combinedMeta = [textAlongsideUrl, ogTitle, ogDesc].filter(Boolean).join('\n');
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
          {
            sourceUrl: cleanUrl,
            imageUrl: ogImage,
          }
        );
        return { recipe: aiRecipe, methodUsed: 'Gemini AI Extractor' };
      }

      if (combinedMeta.length > 10) {
        const parsed = parseRecipeFromCaptionOrText(combinedMeta, {
          title: ogTitle,
          sourceUrl: cleanUrl,
          imageUrl: ogImage,
        });
        return {
          recipe: parsed,
          methodUsed: 'Social OpenGraph Parser',
          needsManualCompletion: parsed.ingredients.length === 0 && parsed.steps.length === 0,
        };
      }
    } catch {
      if (textAlongsideUrl.length > 15) {
        const parsed = parseRecipeFromCaptionOrText(textAlongsideUrl, { sourceUrl: cleanUrl });
        return {
          recipe: parsed,
          methodUsed: 'Caption Fallback Parser',
          needsManualCompletion: parsed.ingredients.length === 0 && parsed.steps.length === 0,
        };
      }
      throw new Error(
        'Could not reach this URL directly. You can paste the recipe caption text, scan a screenshot, or tap "+ Manual Recipe".'
      );
    }
  }

  // Tier D: Raw Pasted Caption or Cookbook Text
  if (settings.geminiApiKey.trim()) {
    try {
      const aiRecipe = await extractWithDirectGemini(settings.geminiApiKey, trimmed);
      return { recipe: aiRecipe, methodUsed: 'Gemini AI Text Parser' };
    } catch {
      // Fall back to deterministic parser below
    }
  }

  const parsed = parseRecipeFromCaptionOrText(trimmed);
  return {
    recipe: parsed,
    methodUsed: 'Smart Recipe Parser',
    needsManualCompletion: parsed.ingredients.length === 0 && parsed.steps.length === 0,
  };
}
