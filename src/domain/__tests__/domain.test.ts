import { describe, expect, it } from 'vitest';
import { computeNextVersion } from '../../../scripts/bump-version.mjs';
import { mergeRecipeIntoGroceryList } from '../grocery';
import {
  extractUrlFromSharedText,
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
    // Base is 4 servings; butter is 2 tbsp -> scaling to 8 servings = 4 tbsp = ¼ cup!
    const butterScaled = scaleIngredient(tuscan.ingredients[2], 4, 8, 'original');
    expect(butterScaled.formattedAmount).toBe('¼ cup');

    // Non-scalable "Kosher salt and black pepper to taste" stays unchanged
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
    // 1/2 cup broth -> 1 cup; 1 cup heavy cream -> 2 cups; 1/2 cup parmesan -> 1 cup
    expect(ingTexts).toEqual([
      '1 cup chicken broth',
      '2 cups heavy cream',
      '1 cup parmesan cheese',
    ]);

    const timerSeg = segments.find((s) => s.type === 'timer');
    expect(timerSeg).toEqual({ type: 'timer', seconds: 180, label: '3 mins' });
  });

  it('auto-detects timers in plain-text steps', () => {
    const tokenized = autoTokenizeStepTimers('Bake at 180C for 25 minutes, then rest for 5 mins.');
    expect(tokenized).toContain('{{timer:1500|25 minutes}}');
    expect(tokenized).toContain('{{timer:300|5 mins}}');
  });
});

describe('Smart Grocery Consolidation Engine', () => {
  it('consolidates overlapping canonical ingredients across scaled recipes and sorts by aisle', () => {
    const staples = getDefaultStapleIds().filter((id) => id !== 'butter' && id !== 'garlic');
    // Tuscan Chicken (base 4 -> 4 servings): 1 cup heavy cream, 3 cups spinach, 2 tbsp butter, 4 cloves garlic
    let list = mergeRecipeIntoGroceryList([], SAMPLE_RECIPES[0], 4, {
      excludeCanonicalIds: staples,
    });
    // Garlic Lemon Shrimp (base 2 -> 4 servings = 2x): 4 cups spinach, 6 tbsp butter, 8 cloves garlic
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

    // 2 tbsp butter + 6 tbsp butter = 8 tbsp = ½ cup!
    const butter = list.find((i) => i.canonicalIngredientId === 'butter');
    expect(butter?.formattedAmount).toBe('½ cup');

    // Produce items appear before Dairy & Eggs in aisle order
    const produceIdx = list.findIndex((i) => i.aisle === 'Produce');
    const dairyIdx = list.findIndex((i) => i.aisle === 'Dairy & Eggs');
    expect(produceIdx).toBeLessThan(dairyIdx);
  });
});

describe('Stateless Temporary Pantry / Fridge Matcher', () => {
  it('ranks recipes by most entered items matched, then fewest missing required items', () => {
    const staples = getDefaultStapleIds();

    // User enters shrimp, lemon, spinach -> Garlic Lemon Shrimp needs 0 extra items (ready_now!)
    // while Tuscan Chicken only matches spinach (needs chicken, sun-dried tomato, broth, cream, parmesan)
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
    expect(matches[0].tier).toBe('almost_there'); // Only missing sun-dried-tomato & chicken-broth
    expect(matches[0].missingRequiredIngredients.map((i) => i.canonicalIngredientId)).toEqual([
      'sun-dried-tomato',
      'chicken-broth',
    ]);
  });
});

describe('Social Media & Web Recipe Importer', () => {
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

  it('parses TikTok/Instagram captions into structured ingredients and steps', () => {
    const caption = `
Honey Soy Glazed Salmon
Ingredients:
2 salmon fillets
2 tbsp soy sauce
1 tbsp honey
2 cloves garlic, minced
Instructions:
1. Sear salmon skin-side down for 4 minutes.
2. Add garlic, soy sauce, and honey and baste for 2 minutes.
    `;
    const parsed = parseRecipeFromCaptionOrText(caption, {
      sourceUrl: 'https://www.instagram.com/reel/abc123/',
    });
    expect(parsed.title).toBe('Honey Soy Glazed Salmon');
    expect(parsed.sourcePlatform).toBe('instagram');
    expect(parsed.ingredients).toHaveLength(4);
    expect(parsed.steps[0].tokenizedText).toContain('{{timer:240|4 minutes}}');
  });
});

describe('Semantic Version Release Helper', () => {
  it('increments patch, minor, major, and explicit versions accurately', () => {
    expect(computeNextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(computeNextVersion('0.1.4', 'minor')).toBe('0.2.0');
    expect(computeNextVersion('0.9.3', 'major')).toBe('1.0.0');
    expect(computeNextVersion('0.1.0', '2.3.4')).toBe('2.3.4');
  });
});
