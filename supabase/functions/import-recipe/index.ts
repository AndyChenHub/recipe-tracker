// Supabase Edge Function: /functions/v1/import-recipe
// Multi-tier Waterfall Social Media (TikTok, Instagram, YouTube Shorts) & Web Recipe Extractor
// Deploy with: npx supabase functions deploy import-recipe

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedPayload {
  title: string;
  description?: string;
  baseServings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  imageUrl?: string;
  sourceUrl?: string;
  sourceAuthor?: string;
  categories: string[];
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
    tokenizedText: string;
    groupName?: string;
  }>;
}

function cleanIncomingUrl(raw: string): string | null {
  const match = raw.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[.,;!?)]+$/, '') : null;
}

function isSocialUrl(url: string): boolean {
  return /tiktok\.com|instagram\.com|instagr\.am|youtube\.com\/shorts|youtu\.be/i.test(url);
}

async function fetchSocialContext(url: string): Promise<{
  caption: string;
  transcript: string;
  thumbnailUrl?: string;
  author?: string;
}> {
  const supadataKey = Deno.env.get('SUPADATA_API_KEY');
  if (supadataKey) {
    try {
      const resp = await fetch(
        `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&text=true`,
        { headers: { 'x-api-key': supadataKey } }
      );
      if (resp.ok) {
        const data = await resp.json();
        return {
          caption: data.description || data.title || '',
          transcript: data.content || '',
          thumbnailUrl: data.thumbnail,
          author: data.author,
        };
      }
    } catch {
      // Fallback to oEmbed / OpenGraph below
    }
  }

  // Fallback: TikTok / YouTube oEmbed or page OpenGraph meta tags
  if (url.includes('tiktok.com')) {
    const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (oembed.ok) {
      const data = await oembed.json();
      return {
        caption: data.title || '',
        transcript: '',
        thumbnailUrl: data.thumbnail_url,
        author: data.author_name,
      };
    }
  }

  const pageResp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeTrackerBot/1.0)' },
    redirect: 'follow',
  });
  const html = await pageResp.text();
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? '';
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? '';
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

  return {
    caption: `${ogTitle}\n${ogDesc}`.trim(),
    transcript: '',
    thumbnailUrl: ogImage,
  };
}

async function extractWithGemini(
  rawContext: string,
  sourceUrl?: string,
  imageUrl?: string,
  author?: string
): Promise<ExtractedPayload> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY secret is not set on Supabase Edge Function.');
  }

  const prompt = `Extract a clean, structured cooking recipe from the following social media post or web page content.
Rules:
1. Convert fractional quantities to decimals in qtyMin/qtyMax (e.g. "1/2" -> 0.5). Set qtyMin to null for "to taste".
2. Set "name" to the clean singular canonical food name without preparation words (e.g. "garlic", "chicken thighs", "heavy cream", "soy sauce").
3. Set isScalable=false for "salt to taste" or frying oil; set isOptional=true for optional garnishes.
4. Set isEstimated=true ONLY when a spoken video mentioned an ingredient without stating a measurement and you estimated a sensible quantity.
5. In each step's tokenizedText, replace direct mentions of an ingredient's quantity+name with {{ing:INDEX}} (0-based index into ingredients array) and replace time durations with {{timer:SECONDS|LABEL}} (e.g. {{timer:300|5 mins}}).

Content:
${rawContext}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(jsonText);

  return {
    title: parsed.title || 'Imported Recipe',
    description: parsed.description,
    baseServings: Number(parsed.baseServings) || 4,
    prepMinutes: parsed.prepMinutes ? Number(parsed.prepMinutes) : undefined,
    cookMinutes: parsed.cookMinutes ? Number(parsed.cookMinutes) : undefined,
    imageUrl: imageUrl || parsed.imageUrl,
    sourceUrl,
    sourceAuthor: author || parsed.sourceAuthor,
    categories: Array.isArray(parsed.categories) ? parsed.categories : ['Imported'],
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
  };
}

async function rehostThumbnailIfPossible(tempImageUrl?: string): Promise<string | undefined> {
  if (!tempImageUrl) return undefined;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return tempImageUrl;

  try {
    const imgResp = await fetch(tempImageUrl);
    if (!imgResp.ok) return tempImageUrl;
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const bytes = await imgResp.arrayBuffer();
    const path = `covers/${crypto.randomUUID()}.${ext}`;

    const admin = createClient(supabaseUrl, serviceKey);
    const { error } = await admin.storage
      .from('recipe-images')
      .upload(path, bytes, { contentType, upsert: false });
    if (error) return tempImageUrl;

    const { data } = admin.storage.from('recipe-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return tempImageUrl;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawInput: string = body.url || body.text || '';
    const saveDirectly: boolean = Boolean(body.saveToDb);
    const ownerKey: string = body.ownerKey || 'default';

    const cleanUrl = cleanIncomingUrl(rawInput);
    let contextText = rawInput;
    let detectedThumb: string | undefined;
    let detectedAuthor: string | undefined;

    if (cleanUrl) {
      if (isSocialUrl(cleanUrl)) {
        const social = await fetchSocialContext(cleanUrl);
        contextText = `Source URL: ${cleanUrl}\nAuthor: ${social.author ?? ''}\nCaption:\n${social.caption}\n\nSpoken Transcript:\n${social.transcript}`;
        detectedThumb = social.thumbnailUrl;
        detectedAuthor = social.author;
      } else {
        const webResp = await fetch(cleanUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeTrackerBot/1.0)' },
        });
        const html = await webResp.text();
        detectedThumb = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
        // Strip script/style bloat except JSON-LD
        const jsonLdBlocks = Array.from(
          html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
        )
          .map((m) => m[1])
          .join('\n');
        const plainBody = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 12000);
        contextText = jsonLdBlocks
          ? `JSON-LD:\n${jsonLdBlocks.slice(0, 15000)}\n\nPage Excerpt:\n${plainBody.slice(0, 4000)}`
          : plainBody;
      }
    }

    const structured = await extractWithGemini(contextText, cleanUrl ?? undefined, detectedThumb, detectedAuthor);
    structured.imageUrl = await rehostThumbnailIfPossible(structured.imageUrl);

    if (saveDirectly) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceKey);
      const id = `rec-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
      await admin.from('recipes').insert({
        id,
        owner_key: ownerKey,
        title: structured.title,
        description: structured.description,
        base_servings: structured.baseServings,
        prep_minutes: structured.prepMinutes,
        cook_minutes: structured.cookMinutes,
        image_url: structured.imageUrl,
        source_url: structured.sourceUrl,
        source_platform: cleanUrl
          ? cleanUrl.includes('tiktok')
            ? 'tiktok'
            : cleanUrl.includes('instagram')
              ? 'instagram'
              : cleanUrl.includes('youtu')
                ? 'youtube'
                : 'web'
          : 'manual',
        source_author: structured.sourceAuthor,
        categories: structured.categories,
        ingredients: structured.ingredients,
        steps: structured.steps,
      });
    }

    return new Response(JSON.stringify({ ok: true, recipe: structured }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown import error';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
