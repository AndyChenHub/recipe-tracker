import { describe, expect, it } from 'vitest';
import { computeNextVersion } from '../../../scripts/bump-version.mjs';
import { fetchTikTokContext, getDefaultCloudSettings, importRecipeUniversal } from '../../services/cloudSync';
import { mergeRecipeIntoGroceryList } from '../grocery';
import {
  cleanWebVttTranscript,
  extractUrlFromSharedText,
  linkIngredientsInStepText,
  parseRecipeFromCaptionOrText,
  parseRecipeFromHtmlJsonLd,
} from '../importer';
import { matchRecipesByTemporaryIngredients } from '../matcher';
import { SAMPLE_RECIPES } from '../sampleRecipes';
import {
  autoTokenizeStepTimers,
  formatKitchenNumber,
  renderStepTokens,
  scaleIngredient,
} from '../scaling';
import {
  getDefaultStapleIds,
  ingredientsMatchInTaxonomy,
  parseIngredientLine,
  resolveCanonicalIngredient,
} from '../taxonomy';

describe('Canonical Ingredient Taxonomy & Line Parser', () => {
  it('resolves synonyms and strips preparation words cleanly', () => {
    expect(resolveCanonicalIngredient('scallions').canonicalId).toBe('green-onion');
    expect(resolveCanonicalIngredient('spring onion').canonicalId).toBe('green-onion');
    expect(resolveCanonicalIngredient('fresh finely minced garlic cloves').canonicalId).toBe('garlic');
    expect(resolveCanonicalIngredient('boneless skinless chicken thighs').canonicalId).toBe('chicken-thigh');
    expect(resolveCanonicalIngredient('thickened cream').canonicalId).toBe('heavy-cream');
  });

  it('matches parent-child hierarchies (e.g. chicken <-> chicken-thigh, milk <-> oat-milk)', () => {
    expect(ingredientsMatchInTaxonomy('chicken', 'chicken-thigh')).toBe(true);
    expect(ingredientsMatchInTaxonomy('oat-milk', 'milk')).toBe(true);
    expect(ingredientsMatchInTaxonomy('garlic', 'onion')).toBe(false);
  });

  it('parses fractions, ranges, units, preparation, and optional flags', () => {
    const parsed = parseIngredientLine('2 1/2 tbsp low-sodium soy sauce, chilled (optional)');
    expect(parsed.qtyMin).toBeCloseTo(2.5, 3);
    expect(parsed.unit).toBe('tbsp');
    expect(parsed.canonicalIngredientId).toBe('soy-sauce');
    expect(parsed.preparation).toBe('chilled');
    expect(parsed.isOptional).toBe(true);

    const range = parseIngredientLine('2-3 cloves garlic, finely minced');
    expect(range.qtyMin).toBe(2);
    expect(range.qtyMax).toBe(3);
    expect(range.unit).toBe('clove');
    expect(range.canonicalIngredientId).toBe('garlic');
  });
});

describe('Dynamic Serving Scaler & Inline Step Renderer', () => {
  it('snaps kitchen fractions cleanly and promotes awkward small units', () => {
    expect(formatKitchenNumber(0.25, 'cup')).toBe('¼');
    expect(formatKitchenNumber(0.3333, 'cup')).toBe('⅓');
    expect(formatKitchenNumber(1.5, 'tbsp')).toBe('1½');

    const tuscan = SAMPLE_RECIPES[0];
    const butterScaled = scaleIngredient(tuscan.ingredients[2], 4, 8, 'original');
    expect(butterScaled.formattedAmount).toBe('¼ cup');

    const saltScaled = scaleIngredient(tuscan.ingredients[9], 4, 10, 'original');
    expect(saltScaled.qtyMin).toBeNull();
    expect(saltScaled.formattedLine).toContain('to taste');
  });

  it('scales inline {{ing:N}} tokens and renders {{timer:S}} chips inside steps', () => {
    const tuscan = SAMPLE_RECIPES[0];
    const segments = renderStepTokens(
      tuscan.steps[2].tokenizedText,
      tuscan.ingredients,
      4,
      8,
      'original'
    );

    const ingTexts = segments.filter((s) => s.type === 'ingredient').map((s) => s.text);
    expect(ingTexts).toEqual([
      '1 cup chicken broth',
      '2 cups heavy cream',
      '1 cup parmesan cheese',
    ]);

    const timerSeg = segments.find((s) => s.type === 'timer');
    expect(timerSeg).toEqual({ type: 'timer', seconds: 180, label: '3 mins' });
  });

  it('auto-detects timers and links inline ingredients inside plain-text steps', () => {
    const tokenized = autoTokenizeStepTimers('Bake at 180C for 25 minutes, then rest for 5 mins.');
    expect(tokenized).toContain('{{timer:1500|25 minutes}}');
    expect(tokenized).toContain('{{timer:300|5 mins}}');

    const ings = [parseIngredientLine('2 tbsp butter', 0), parseIngredientLine('4 cloves garlic', 1)];
    const linked = linkIngredientsInStepText(
      'Melt 2 tbsp butter in a skillet and saute 4 cloves garlic for 2 minutes.',
      ings
    );
    expect(linked).toContain('{{ing:0}}');
    expect(linked).toContain('{{ing:1}}');
    expect(linked).toContain('{{timer:120|2 minutes}}');
  });
});

describe('Smart Grocery Consolidation Engine', () => {
  it('consolidates overlapping canonical ingredients across scaled recipes and sorts by aisle', () => {
    const staples = getDefaultStapleIds().filter((id) => id !== 'butter' && id !== 'garlic');
    let list = mergeRecipeIntoGroceryList([], SAMPLE_RECIPES[0], 4, {
      excludeCanonicalIds: staples,
    });
    list = mergeRecipeIntoGroceryList(list, SAMPLE_RECIPES[2], 4, {
      excludeCanonicalIds: staples,
    });

    const garlic = list.find((i) => i.canonicalIngredientId === 'garlic');
    expect(garlic?.totalQty).toBe(12);
    expect(garlic?.formattedAmount).toBe('12 cloves');
    expect(garlic?.sources).toHaveLength(2);

    const spinach = list.find((i) => i.canonicalIngredientId === 'spinach');
    expect(spinach?.totalQty).toBe(7);
    expect(spinach?.formattedAmount).toBe('7 cups');

    const butter = list.find((i) => i.canonicalIngredientId === 'butter');
    expect(butter?.formattedAmount).toBe('½ cup');

    const produceIdx = list.findIndex((i) => i.aisle === 'Produce');
    const dairyIdx = list.findIndex((i) => i.aisle === 'Dairy & Eggs');
    expect(produceIdx).toBeLessThan(dairyIdx);
  });
});

describe('Stateless Temporary Pantry / Fridge Matcher', () => {
  it('ranks recipes by most entered items matched, then fewest missing required items', () => {
    const staples = getDefaultStapleIds();
    const matches = matchRecipesByTemporaryIngredients(
      SAMPLE_RECIPES,
      ['shrimp', 'lemon', 'spinach'],
      staples
    );

    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0].recipe.id).toBe('sample-garlic-lemon-shrimp');
    expect(matches[0].tier).toBe('ready_now');
    expect(matches[0].matchedInputIds).toHaveLength(3);
    expect(matches[0].missingRequiredIngredients).toHaveLength(0);
  });

  it('matches parent category entries like "chicken" against recipes using "chicken-thigh"', () => {
    const staples = getDefaultStapleIds();
    const matches = matchRecipesByTemporaryIngredients(
      SAMPLE_RECIPES,
      ['chicken', 'heavy-cream', 'spinach', 'parmesan'],
      staples
    );

    expect(matches[0].recipe.id).toBe('sample-tuscan-chicken');
    expect(matches[0].matchedInputIds).toHaveLength(4);
    expect(matches[0].tier).toBe('almost_there');
    expect(matches[0].missingRequiredIngredients.map((i) => i.canonicalIngredientId)).toEqual([
      'sun-dried-tomato',
      'chicken-broth',
    ]);
  });
});

describe('Social Media, TikTok & Web Recipe Importer', () => {
  it('cleans messy Share Sheet text and parses schema.org/Recipe JSON-LD', () => {
    const url = extractUrlFromSharedText(
      'Make this tonight!! https://www.tiktok.com/@chef/video/987654321?is_from_webapp=1 #pasta'
    );
    expect(url).toBe('https://www.tiktok.com/@chef/video/987654321?is_from_webapp=1');

    const sampleHtml = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "5-Minute Chili Crisp Eggs",
        "recipeYield": "2 servings",
        "prepTime": "PT2M",
        "cookTime": "PT4M",
        "recipeIngredient": ["2 large eggs", "1 tbsp soy sauce"],
        "recipeInstructions": [
          { "@type": "HowToStep", "text": "Fry eggs in chili oil for 3 minutes until crispy." }
        ]
      }
      </script>
      </head></html>
    `;
    const recipe = parseRecipeFromHtmlJsonLd(sampleHtml, 'https://foodblog.example.com/chili-eggs');
    expect(recipe).not.toBeNull();
    expect(recipe?.title).toBe('5-Minute Chili Crisp Eggs');
    expect(recipe?.baseServings).toBe(2);
    expect(recipe?.cookMinutes).toBe(4);
    expect(recipe?.ingredients[0].canonicalIngredientId).toBe('egg');
    expect(recipe?.steps[0].tokenizedText).toContain('{{timer:180|3 minutes}}');
  });

  it('parses TikTok inline-bullet captions with Unicode line separators and hashtags', () => {
    const tiktokCaption =
      'One-Pan Penne Alfredo - 30 min!\u2028INGREDIENTS: • 2 tbsp olive oil • 1/2 yellow onion, finely diced • 4 garlic cloves, minced • 1/4 cup white wine • 2 1/2 cups chicken broth • 1/2 cup heavy cream\u20281. Heat 2 tbsp olive oil and saute onion and garlic for 2 minutes.\u20282. Add chicken broth and heavy cream and simmer for 12 minutes. #pastarecipe #tiktokfood #easyrecipe';

    const parsed = parseRecipeFromCaptionOrText(tiktokCaption, {
      sourceUrl: 'https://www.tiktok.com/@chef/video/7566434572934644236',
    });

    expect(parsed.title).toBe('One-Pan Penne Alfredo - 30 min!');
    expect(parsed.sourcePlatform).toBe('tiktok');
    expect(parsed.ingredients.length).toBe(6);
    expect(parsed.ingredients.map((i) => i.canonicalIngredientId)).toContain('olive-oil');
    expect(parsed.ingredients.map((i) => i.canonicalIngredientId)).toContain('heavy-cream');
    expect(parsed.steps.length).toBe(2);
    expect(parsed.steps[0].rawText).not.toContain('#pastarecipe');
    expect(parsed.steps[1].tokenizedText).toContain('{{timer:720|12 minutes}}');
  });

  it('cleans WebVTT subtitle files and extracts recipes from spoken TikTok transcripts', () => {
    const sampleVtt = `WEBVTT

1
00:00:00.000 --> 00:00:03.500
Start by searing two chicken breasts in one tablespoon of olive oil for 5 minutes per side.

2
00:00:03.500 --> 00:00:08.000
Add four cloves of minced garlic, one cup of heavy cream, and half a cup of parmesan cheese, then simmer for 3 minutes.`;

    const cleanTranscript = cleanWebVttTranscript(sampleVtt);
    expect(cleanTranscript).not.toContain('WEBVTT');
    expect(cleanTranscript).not.toContain('-->');

    const parsed = parseRecipeFromCaptionOrText('Creamy Garlic Chicken #foodtiktok #dinner', {
      sourceUrl: 'https://www.tiktok.com/@cook/video/7111111111111111111',
      transcript: cleanTranscript,
    });

    expect(parsed.title).toBe('Creamy Garlic Chicken');
    expect(parsed.ingredients.length).toBeGreaterThanOrEqual(4);
    const canonicalIds = parsed.ingredients.map((i) => i.canonicalIngredientId);
    expect(canonicalIds).toContain('chicken-breast');
    expect(canonicalIds).toContain('olive-oil');
    expect(canonicalIds).toContain('garlic');
    expect(canonicalIds).toContain('heavy-cream');
    expect(parsed.steps.length).toBe(2);
    expect(parsed.steps[0].tokenizedText).toContain('{{timer:300|5 minutes}}');
  });

  it('extracts live TikTok URLs (spoken WebVTT subtitles + TikTok Notes recipes) end-to-end', async () => {
    const settings = getDefaultCloudSettings();

    // 1. Live TikTok video with spoken WebVTT subtitles (@hankgreen1)
    const ttContext = await fetchTikTokContext(
      'https://www.tiktok.com/@hankgreen1/video/7047596209028074758'
    );
    expect(ttContext.author).toBe('@hankgreen1');
    expect(ttContext.transcript.length).toBeGreaterThan(50);
    expect(ttContext.thumbnailUrl).toBeTruthy();

    // 2. Live TikTok Notes recipe post (@niqq_xo Creamy Chicken Alfredo)
    const imported = await importRecipeUniversal(
      'https://notes.tiktok.com/@niqq_xo/7689617153183564319',
      settings
    );
    expect(imported.recipe.title).toContain('Chicken Alfredo');
    expect(imported.recipe.sourcePlatform).toBe('tiktok');
    expect(imported.recipe.ingredients.length).toBeGreaterThanOrEqual(4);
    expect(imported.recipe.steps.length).toBeGreaterThanOrEqual(2);
  }, 20000);
});

describe('Semantic Version Release Helper', () => {
  it('increments patch, minor, major, and explicit versions accurately', () => {
    expect(computeNextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(computeNextVersion('0.1.4', 'minor')).toBe('0.2.0');
    expect(computeNextVersion('0.9.3', 'major')).toBe('1.0.0');
    expect(computeNextVersion('0.1.0', '2.3.4')).toBe('2.3.4');
  });
});
