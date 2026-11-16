import { AisleCategory, CanonicalIngredient, RecipeIngredient } from './types';

export const CANONICAL_INGREDIENTS: CanonicalIngredient[] = [
  // Staples & Basics
  { id: 'water', name: 'Water', aisle: 'Other', isDefaultStaple: true, densityGPerMl: 1.0, aliases: ['tap water', 'warm water', 'cold water', 'boiling water', 'ice water'] },
  { id: 'salt', name: 'Salt', aisle: 'Spices & Baking', isDefaultStaple: true, densityGPerMl: 1.2, aliases: ['kosher salt', 'sea salt', 'table salt', 'fine salt', 'flaky sea salt'] },
  { id: 'black-pepper', name: 'Black Pepper', aisle: 'Spices & Baking', isDefaultStaple: true, densityGPerMl: 0.45, aliases: ['pepper', 'freshly cracked black pepper', 'ground black pepper', 'cracked pepper'] },
  { id: 'cooking-oil', name: 'Cooking Oil', aisle: 'Oils, Vinegars & Sauces', isDefaultStaple: true, densityGPerMl: 0.92, aliases: ['neutral oil', 'vegetable oil', 'canola oil', 'sunflower oil', 'avocado oil', 'frying oil'] },
  { id: 'olive-oil', name: 'Olive Oil', aisle: 'Oils, Vinegars & Sauces', parentId: 'cooking-oil', isDefaultStaple: true, densityGPerMl: 0.91, aliases: ['extra-virgin olive oil', 'extra virgin olive oil', 'evoo', 'light olive oil'] },
  { id: 'sesame-oil', name: 'Sesame Oil', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 0.92, aliases: ['toasted sesame oil'] },

  // Produce - Aromatics & Vegetables
  { id: 'garlic', name: 'Garlic', aisle: 'Produce', isDefaultStaple: true, avgUnitWeightG: 4, aliases: ['garlic clove', 'garlic cloves', 'cloves garlic', 'clove garlic', 'fresh garlic', 'minced garlic'] },
  { id: 'onion', name: 'Onion', aisle: 'Produce', isDefaultStaple: true, avgUnitWeightG: 150, densityGPerMl: 0.67, aliases: ['onions', 'yellow onion', 'brown onion', 'white onion', 'diced onion'] },
  { id: 'red-onion', name: 'Red Onion', aisle: 'Produce', parentId: 'onion', avgUnitWeightG: 150, aliases: ['red onions', 'purple onion'] },
  { id: 'shallot', name: 'Shallot', aisle: 'Produce', parentId: 'onion', avgUnitWeightG: 40, aliases: ['shallots', 'french shallot'] },
  { id: 'green-onion', name: 'Green Onion', aisle: 'Produce', avgUnitWeightG: 15, aliases: ['green onions', 'scallion', 'scallions', 'spring onion', 'spring onions'] },
  { id: 'ginger', name: 'Fresh Ginger', aisle: 'Produce', avgUnitWeightG: 15, aliases: ['ginger', 'ginger root', 'grated ginger', 'minced ginger'] },
  { id: 'lemon', name: 'Lemon', aisle: 'Produce', avgUnitWeightG: 85, densityGPerMl: 1.03, aliases: ['lemons', 'lemon juice', 'fresh lemon juice', 'lemon zest'] },
  { id: 'lime', name: 'Lime', aisle: 'Produce', avgUnitWeightG: 65, densityGPerMl: 1.03, aliases: ['limes', 'lime juice', 'fresh lime juice', 'lime zest'] },
  { id: 'spinach', name: 'Spinach', aisle: 'Produce', densityGPerMl: 0.13, aliases: ['baby spinach', 'fresh spinach', 'spinach leaves'] },
  { id: 'tomato', name: 'Tomato', aisle: 'Produce', avgUnitWeightG: 125, aliases: ['tomatoes', 'roma tomato', 'vine tomatoes', 'cherry tomatoes', 'grape tomatoes'] },
  { id: 'sun-dried-tomato', name: 'Sun-Dried Tomatoes', aisle: 'Canned & Jarred', densityGPerMl: 0.65, aliases: ['sun dried tomatoes', 'sundried tomatoes', 'julienned sun-dried tomatoes'] },
  { id: 'bell-pepper', name: 'Bell Pepper', aisle: 'Produce', avgUnitWeightG: 150, aliases: ['bell peppers', 'red bell pepper', 'capsicum', 'red capsicum', 'green bell pepper', 'yellow bell pepper'] },
  { id: 'chili-pepper', name: 'Chili Pepper', aisle: 'Produce', avgUnitWeightG: 15, aliases: ['jalapeno', 'serrano pepper', 'thai chili', 'birds eye chili', 'red chili', 'fresh chili'] },
  { id: 'potato', name: 'Potato', aisle: 'Produce', avgUnitWeightG: 170, aliases: ['potatoes', 'russet potato', 'yukon gold potatoes', 'baby potatoes'] },
  { id: 'sweet-potato', name: 'Sweet Potato', aisle: 'Produce', avgUnitWeightG: 180, aliases: ['sweet potatoes', 'kumara'] },
  { id: 'carrot', name: 'Carrot', aisle: 'Produce', avgUnitWeightG: 65, aliases: ['carrots', 'baby carrots'] },
  { id: 'broccoli', name: 'Broccoli', aisle: 'Produce', avgUnitWeightG: 300, aliases: ['broccoli florets', 'broccolini'] },
  { id: 'mushroom', name: 'Mushrooms', aisle: 'Produce', densityGPerMl: 0.3, aliases: ['mushroom', 'cremini mushrooms', 'button mushrooms', 'shiitake mushrooms', 'swiss brown mushrooms'] },
  { id: 'avocado', name: 'Avocado', aisle: 'Produce', avgUnitWeightG: 150, aliases: ['avocados', 'ripe avocado'] },
  { id: 'cucumber', name: 'Cucumber', aisle: 'Produce', avgUnitWeightG: 200, aliases: ['cucumbers', 'english cucumber', 'persian cucumber'] },
  { id: 'lettuce', name: 'Lettuce', aisle: 'Produce', avgUnitWeightG: 250, aliases: ['iceberg lettuce', 'romaine lettuce', 'cos lettuce', 'shredded lettuce'] },
  { id: 'zucchini', name: 'Zucchini', aisle: 'Produce', avgUnitWeightG: 195, aliases: ['zucchinis', 'courgette'] },

  // Fresh Herbs
  { id: 'parsley', name: 'Fresh Parsley', aisle: 'Produce', aliases: ['parsley', 'flat-leaf parsley', 'italian parsley', 'chopped parsley'] },
  { id: 'cilantro', name: 'Fresh Cilantro', aisle: 'Produce', aliases: ['cilantro', 'coriander leaves', 'fresh coriander'] },
  { id: 'basil', name: 'Fresh Basil', aisle: 'Produce', aliases: ['basil', 'basil leaves', 'sweet basil'] },
  { id: 'thyme', name: 'Fresh Thyme', aisle: 'Produce', aliases: ['thyme', 'thyme sprigs'] },
  { id: 'rosemary', name: 'Fresh Rosemary', aisle: 'Produce', aliases: ['rosemary', 'rosemary sprigs'] },

  // Meat & Seafood
  { id: 'chicken', name: 'Chicken', aisle: 'Meat & Seafood', aliases: ['poultry'] },
  { id: 'chicken-breast', name: 'Chicken Breast', aisle: 'Meat & Seafood', parentId: 'chicken', avgUnitWeightG: 200, aliases: ['chicken breasts', 'boneless skinless chicken breast', 'boneless chicken breast'] },
  { id: 'chicken-thigh', name: 'Chicken Thighs', aisle: 'Meat & Seafood', parentId: 'chicken', avgUnitWeightG: 130, aliases: ['chicken thigh', 'boneless skinless chicken thighs', 'skin-on chicken thighs'] },
  { id: 'ground-beef', name: 'Ground Beef', aisle: 'Meat & Seafood', aliases: ['beef mince', 'minced beef', '80/20 ground beef', 'lean ground beef'] },
  { id: 'steak', name: 'Beef Steak', aisle: 'Meat & Seafood', aliases: ['sirloin steak', 'ribeye', 'flank steak', 'skirt steak', 'beef strips'] },
  { id: 'pork', name: 'Pork', aisle: 'Meat & Seafood', aliases: ['ground pork', 'pork mince', 'pork shoulder', 'pork belly', 'pork chops'] },
  { id: 'bacon', name: 'Bacon', aisle: 'Meat & Seafood', avgUnitWeightG: 28, aliases: ['streaky bacon', 'pancetta', 'guanciale', 'bacon strips'] },
  { id: 'sausage', name: 'Sausage', aisle: 'Meat & Seafood', avgUnitWeightG: 100, aliases: ['italian sausage', 'chorizo', 'pork sausage'] },
  { id: 'shrimp', name: 'Shrimp', aisle: 'Meat & Seafood', avgUnitWeightG: 15, aliases: ['prawns', 'large shrimp', 'peeled shrimp', 'raw prawns', 'jumbo shrimp'] },
  { id: 'salmon', name: 'Salmon', aisle: 'Meat & Seafood', avgUnitWeightG: 170, aliases: ['salmon fillet', 'salmon fillets', 'atlantic salmon'] },
  { id: 'tofu', name: 'Tofu', aisle: 'Produce', avgUnitWeightG: 400, aliases: ['firm tofu', 'extra-firm tofu', 'silken tofu'] },

  // Dairy & Eggs
  { id: 'egg', name: 'Eggs', aisle: 'Dairy & Eggs', isDefaultStaple: true, avgUnitWeightG: 50, aliases: ['egg', 'large egg', 'large eggs', 'egg yolk', 'egg yolks'] },
  { id: 'butter', name: 'Butter', aisle: 'Dairy & Eggs', isDefaultStaple: true, densityGPerMl: 0.96, aliases: ['unsalted butter', 'salted butter', 'melted butter'] },
  { id: 'milk', name: 'Milk', aisle: 'Dairy & Eggs', densityGPerMl: 1.03, aliases: ['whole milk', 'skim milk', '2% milk', 'full cream milk'] },
  { id: 'oat-milk', name: 'Oat Milk', aisle: 'Dairy & Eggs', parentId: 'milk', densityGPerMl: 1.03, aliases: ['unsweetened oat milk'] },
  { id: 'cream', name: 'Cream', aisle: 'Dairy & Eggs', densityGPerMl: 1.01, aliases: ['cooking cream', 'light cream'] },
  { id: 'heavy-cream', name: 'Heavy Cream', aisle: 'Dairy & Eggs', parentId: 'cream', densityGPerMl: 1.01, aliases: ['heavy whipping cream', 'thickened cream', 'double cream', 'whipping cream'] },
  { id: 'cheese', name: 'Cheese', aisle: 'Dairy & Eggs', densityGPerMl: 0.45, aliases: ['shredded cheese'] },
  { id: 'parmesan', name: 'Parmesan Cheese', aisle: 'Dairy & Eggs', parentId: 'cheese', densityGPerMl: 0.42, aliases: ['parmesan', 'parmigiano-reggiano', 'parmigiano reggiano', 'grated parmesan', 'pecorino romano'] },
  { id: 'cheddar', name: 'Cheddar Cheese', aisle: 'Dairy & Eggs', parentId: 'cheese', avgUnitWeightG: 22, densityGPerMl: 0.48, aliases: ['cheddar', 'sharp cheddar', 'american cheese', 'cheese slices', 'sliced cheddar'] },
  { id: 'mozzarella', name: 'Mozzarella', aisle: 'Dairy & Eggs', parentId: 'cheese', densityGPerMl: 0.48, aliases: ['mozzarella cheese', 'fresh mozzarella', 'shredded mozzarella'] },
  { id: 'greek-yogurt', name: 'Greek Yogurt', aisle: 'Dairy & Eggs', densityGPerMl: 1.05, aliases: ['yogurt', 'plain yogurt', 'natural yogurt'] },
  { id: 'sour-cream', name: 'Sour Cream', aisle: 'Dairy & Eggs', densityGPerMl: 1.02, aliases: ['creme fraiche'] },

  // Pantry, Pasta, Rice & Bread
  { id: 'pasta', name: 'Pasta', aisle: 'Pantry & Grains', aliases: ['dried pasta', 'short pasta'] },
  { id: 'rigatoni', name: 'Rigatoni', aisle: 'Pantry & Grains', parentId: 'pasta', aliases: ['penne', 'ziti', 'paccheri', 'fusilli'] },
  { id: 'spaghetti', name: 'Spaghetti', aisle: 'Pantry & Grains', parentId: 'pasta', aliases: ['linguine', 'fettuccine', 'angel hair', 'bucatini'] },
  { id: 'rice', name: 'Rice', aisle: 'Pantry & Grains', densityGPerMl: 0.82, aliases: ['white rice', 'jasmine rice', 'basmati rice', 'cooked rice', 'long-grain rice'] },
  { id: 'noodles', name: 'Noodles', aisle: 'Pantry & Grains', aliases: ['ramen noodles', 'udon noodles', 'rice noodles', 'egg noodles'] },
  { id: 'all-purpose-flour', name: 'All-Purpose Flour', aisle: 'Spices & Baking', isDefaultStaple: true, densityGPerMl: 0.53, aliases: ['flour', 'plain flour', 'ap flour', 'white flour'] },
  { id: 'cornstarch', name: 'Cornstarch', aisle: 'Spices & Baking', densityGPerMl: 0.54, aliases: ['cornflour', 'corn starch', 'potato starch'] },
  { id: 'sugar', name: 'Sugar', aisle: 'Spices & Baking', isDefaultStaple: true, densityGPerMl: 0.85, aliases: ['white sugar', 'granulated sugar', 'caster sugar'] },
  { id: 'brown-sugar', name: 'Brown Sugar', aisle: 'Spices & Baking', densityGPerMl: 0.93, aliases: ['light brown sugar', 'dark brown sugar'] },
  { id: 'honey', name: 'Honey', aisle: 'Spices & Baking', densityGPerMl: 1.42, aliases: ['raw honey', 'maple syrup'] },
  { id: 'bread', name: 'Bread', aisle: 'Bakery & Bread', avgUnitWeightG: 35, aliases: ['sourdough bread', 'crusty bread', 'toast'] },
  { id: 'burger-buns', name: 'Burger Buns', aisle: 'Bakery & Bread', avgUnitWeightG: 65, aliases: ['brioche buns', 'potato buns', 'hamburger buns'] },
  { id: 'tortilla', name: 'Tortillas', aisle: 'Bakery & Bread', avgUnitWeightG: 45, aliases: ['flour tortillas', 'corn tortillas', 'wraps'] },
  { id: 'breadcrumbs', name: 'Breadcrumbs', aisle: 'Pantry & Grains', densityGPerMl: 0.45, aliases: ['panko', 'panko breadcrumbs'] },

  // Canned, Sauces & Condiments
  { id: 'chicken-broth', name: 'Chicken Broth', aisle: 'Canned & Jarred', densityGPerMl: 1.0, aliases: ['chicken stock', 'vegetable broth', 'vegetable stock', 'broth', 'stock'] },
  { id: 'tomato-paste', name: 'Tomato Paste', aisle: 'Canned & Jarred', densityGPerMl: 1.1, aliases: ['double concentrated tomato paste', 'tomato puree'] },
  { id: 'canned-tomatoes', name: 'Canned Tomatoes', aisle: 'Canned & Jarred', densityGPerMl: 1.02, aliases: ['crushed tomatoes', 'diced tomatoes', 'whole peeled tomatoes', 'passata'] },
  { id: 'coconut-milk', name: 'Coconut Milk', aisle: 'Canned & Jarred', densityGPerMl: 1.01, aliases: ['full-fat coconut milk', 'coconut cream'] },
  { id: 'chickpeas', name: 'Chickpeas', aisle: 'Canned & Jarred', aliases: ['garbanzo beans', 'canned chickpeas'] },
  { id: 'black-beans', name: 'Black Beans', aisle: 'Canned & Jarred', aliases: ['canned black beans', 'kidney beans'] },
  { id: 'soy-sauce', name: 'Soy Sauce', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 1.15, aliases: ['light soy sauce', 'low-sodium soy sauce', 'tamari', 'shoyu'] },
  { id: 'gochujang', name: 'Gochujang', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 1.25, aliases: ['korean chili paste', 'gochujang paste'] },
  { id: 'mayonnaise', name: 'Mayonnaise', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 0.95, aliases: ['mayo', 'kewpie mayo'] },
  { id: 'mustard', name: 'Mustard', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 1.05, aliases: ['dijon mustard', 'yellow mustard', 'wholegrain mustard'] },
  { id: 'ketchup', name: 'Ketchup', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 1.14, aliases: ['tomato sauce', 'tomato ketchup'] },
  { id: 'pickles', name: 'Pickles', aisle: 'Canned & Jarred', aliases: ['dill pickles', 'sliced pickles', 'gherkin', 'gherkins', 'pickle relish'] },
  { id: 'vodka', name: 'Vodka', aisle: 'Other', densityGPerMl: 0.95, aliases: [] },
  { id: 'white-wine', name: 'White Wine', aisle: 'Other', densityGPerMl: 0.99, aliases: ['dry white wine', 'pinot grigio', 'sauvignon blanc'] },
  { id: 'vinegar', name: 'Vinegar', aisle: 'Oils, Vinegars & Sauces', densityGPerMl: 1.01, aliases: ['rice vinegar', 'apple cider vinegar', 'red wine vinegar', 'white wine vinegar', 'balsamic vinegar'] },

  // Spices
  { id: 'red-pepper-flakes', name: 'Red Pepper Flakes', aisle: 'Spices & Baking', aliases: ['chili flakes', 'crushed red pepper', 'red chilli flakes'] },
  { id: 'paprika', name: 'Paprika', aisle: 'Spices & Baking', aliases: ['smoked paprika', 'sweet paprika'] },
  { id: 'italian-seasoning', name: 'Italian Seasoning', aisle: 'Spices & Baking', aliases: ['dried oregano', 'oregano', 'mixed herbs'] },
  { id: 'cumin', name: 'Ground Cumin', aisle: 'Spices & Baking', aliases: ['cumin', 'cumin powder'] },
  { id: 'garlic-powder', name: 'Garlic Powder', aisle: 'Spices & Baking', aliases: ['onion powder'] },
];

const BY_ID = new Map<string, CanonicalIngredient>();
const ALIAS_LOOKUP = new Map<string, CanonicalIngredient>();

for (const item of CANONICAL_INGREDIENTS) {
  BY_ID.set(item.id, item);
  ALIAS_LOOKUP.set(item.name.toLowerCase(), item);
  ALIAS_LOOKUP.set(item.id.toLowerCase(), item);
  for (const alias of item.aliases) {
    ALIAS_LOOKUP.set(alias.toLowerCase(), item);
  }
}

export function getCanonicalById(id: string): CanonicalIngredient | undefined {
  return BY_ID.get(id);
}

export function getDefaultStapleIds(): string[] {
  return CANONICAL_INGREDIENTS.filter((c) => c.isDefaultStaple).map((c) => c.id);
}

export function slugifyIngredient(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

const DESCRIPTOR_STOPWORDS = new Set([
  'fresh',
  'freshly',
  'organic',
  'large',
  'medium',
  'small',
  'boneless',
  'skinless',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'crushed',
  'finely',
  'roughly',
  'thinly',
  'melted',
  'softened',
  'room',
  'temperature',
  'unsalted',
  'salted',
  'raw',
  'peeled',
  'deveined',
  'packed',
]);

/**
 * Resolves raw scraped or user-entered ingredient names to our canonical catalog.
 * Falls back gracefully to a deterministic custom slug if unknown.
 */
export function resolveCanonicalIngredient(rawName: string): {
  canonicalId: string;
  displayName: string;
  aisle: AisleCategory;
  known: boolean;
} {
  const cleaned = rawName
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return { canonicalId: 'other-item', displayName: rawName.trim() || 'Item', aisle: 'Other', known: false };
  }

  const direct = ALIAS_LOOKUP.get(cleaned);
  if (direct) {
    return { canonicalId: direct.id, displayName: direct.name, aisle: direct.aisle, known: true };
  }

  // Strip trailing plural 's' / 'es'
  const singular = cleaned.endsWith('ies')
    ? `${cleaned.slice(0, -3)}y`
    : cleaned.endsWith('es')
      ? cleaned.slice(0, -2)
      : cleaned.endsWith('s')
        ? cleaned.slice(0, -1)
        : cleaned;
  const singularHit = ALIAS_LOOKUP.get(singular);
  if (singularHit) {
    return { canonicalId: singularHit.id, displayName: singularHit.name, aisle: singularHit.aisle, known: true };
  }

  // Strip common prep/size descriptors ("fresh finely minced garlic" -> "garlic")
  const coreTokens = cleaned
    .split(' ')
    .filter((tok) => tok && !DESCRIPTOR_STOPWORDS.has(tok));
  if (coreTokens.length > 0) {
    const corePhrase = coreTokens.join(' ');
    const phraseHit = ALIAS_LOOKUP.get(corePhrase);
    if (phraseHit) {
      return { canonicalId: phraseHit.id, displayName: phraseHit.name, aisle: phraseHit.aisle, known: true };
    }
    // Check longest suffix match ("boneless chicken thighs" -> "chicken thighs")
    for (let i = 0; i < coreTokens.length; i++) {
      const sub = coreTokens.slice(i).join(' ');
      const subHit = ALIAS_LOOKUP.get(sub);
      if (subHit) {
        return { canonicalId: subHit.id, displayName: subHit.name, aisle: subHit.aisle, known: true };
      }
    }
  }

  const prettyName = cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return {
    canonicalId: `custom-${slugifyIngredient(cleaned)}`,
    displayName: prettyName,
    aisle: 'Other',
    known: false,
  };
}

/**
 * Checks if two canonical ingredient IDs match directly or via parent/child hierarchy
 * (e.g., scratchpad 'chicken' matches recipe 'chicken-thigh', or scratchpad 'oat-milk' matches recipe 'milk').
 */
export function ingredientsMatchInTaxonomy(idA: string, idB: string): boolean {
  if (idA === idB) return true;
  const itemA = BY_ID.get(idA);
  const itemB = BY_ID.get(idB);
  if (itemA?.parentId && itemA.parentId === idB) return true;
  if (itemB?.parentId && itemB.parentId === idA) return true;
  return false;
}

/**
 * Autocomplete search over canonical ingredients and their synonyms.
 */
export function searchCanonicalIngredients(query: string, limit = 12): CanonicalIngredient[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return CANONICAL_INGREDIENTS.filter((c) => !c.isDefaultStaple).slice(0, limit);
  }
  const scored: Array<{ item: CanonicalIngredient; score: number }> = [];
  for (const item of CANONICAL_INGREDIENTS) {
    const nameLower = item.name.toLowerCase();
    if (nameLower === q) {
      scored.push({ item, score: 100 });
    } else if (nameLower.startsWith(q)) {
      scored.push({ item, score: 85 });
    } else if (item.aliases.some((a) => a.toLowerCase() === q)) {
      scored.push({ item, score: 90 });
    } else if (item.aliases.some((a) => a.toLowerCase().startsWith(q))) {
      scored.push({ item, score: 75 });
    } else if (nameLower.includes(q) || item.aliases.some((a) => a.toLowerCase().includes(q))) {
      scored.push({ item, score: 50 });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((s) => s.item);
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '⅛': 0.125,
  '¼': 0.25,
  '⅓': 0.333333,
  '⅜': 0.375,
  '½': 0.5,
  '⅝': 0.625,
  '⅔': 0.666667,
  '¾': 0.75,
  '⅞': 0.875,
};

const UNIT_ALIASES: Record<string, string> = {
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  bunch: 'bunch',
  bunches: 'bunch',
  slice: 'slice',
  slices: 'slice',
  sprig: 'sprig',
  sprigs: 'sprig',
  pinch: 'pinch',
  pinches: 'pinch',
  fillet: 'fillet',
  fillets: 'fillet',
};

export function normalizeUnit(rawUnit: string): string {
  const key = rawUnit.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] ?? key;
}

function parseNumberToken(str: string): number | null {
  let s = str.trim();
  if (!s) return null;
  for (const [glyph, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s === glyph) return val;
    if (s.endsWith(glyph)) {
      const whole = Number(s.slice(0, -glyph.length).trim());
      if (!Number.isNaN(whole)) return whole + val;
    }
  }
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    return den ? whole + num / den : whole;
  }
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    return den ? num / den : null;
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/**
 * Deterministic NLP-lite parser for raw ingredient lines:
 * e.g. "2 1/2 tbsp soy sauce, low sodium (optional)"
 */
export function parseIngredientLine(rawLine: string, sortOrder = 0): RecipeIngredient {
  const trimmed = rawLine.replace(/^[\s•\-*]+/, '').trim();
  const lower = trimmed.toLowerCase();
  const isOptional = /\boptional\b|\bfor garnish\b|\bto garnish\b|\bfor serving\b/.test(lower);
  const nonScalable = /\bto taste\b|\bas needed\b|\bfor frying\b|\bfor deep frying\b/.test(lower);

  let working = trimmed.replace(/\(optional\)/gi, '').trim();

  // Match leading quantity or range e.g. "1 1/2", "2-3", "½", "200g"
  const qtyRegex =
    /^((?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\d*[⅛¼⅓⅜½⅝⅔¾⅞])(?:\s*(?:-|–|to)\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\d*[⅛¼⅓⅜½⅝⅔¾⅞]))?)\s*(.*)$/i;
  const match = working.match(qtyRegex);

  let qtyMin: number | null = null;
  let qtyMax: number | null = null;
  let remainder = working;

  if (match) {
    const rawQty = match[1].trim();
    remainder = match[2].trim();
    const rangeParts = rawQty.split(/\s*(?:-|–|to)\s*/i);
    if (rangeParts.length === 2) {
      qtyMin = parseNumberToken(rangeParts[0]);
      qtyMax = parseNumberToken(rangeParts[1]);
    } else {
      qtyMin = parseNumberToken(rawQty);
    }
  }

  // Extract unit if first word of remainder is a known unit (or attached e.g. "g" in "200g flour")
  let unit = '';
  const firstWordMatch = remainder.match(/^([a-zA-Z.]+)\b\s*(.*)$/);
  if (firstWordMatch) {
    const candidate = firstWordMatch[1].toLowerCase().replace(/\.$/, '');
    if (UNIT_ALIASES[candidate]) {
      unit = UNIT_ALIASES[candidate];
      remainder = firstWordMatch[2].replace(/^of\s+/i, '').trim();
    }
  }

  // Separate preparation after comma ("garlic, finely minced")
  let namePart = remainder;
  let preparation: string | undefined;
  const commaIdx = remainder.indexOf(',');
  if (commaIdx > 0) {
    namePart = remainder.slice(0, commaIdx).trim();
    preparation = remainder.slice(commaIdx + 1).trim();
  }

  const resolved = resolveCanonicalIngredient(namePart || trimmed);

  return {
    id: `ing-${sortOrder}-${ Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sortOrder,
    canonicalIngredientId: resolved.canonicalId,
    displayName: resolved.displayName,
    rawText: trimmed,
    qtyMin,
    qtyMax,
    unit,
    preparation,
    isOptional,
    isScalable: !nonScalable && qtyMin !== null,
  };
}
