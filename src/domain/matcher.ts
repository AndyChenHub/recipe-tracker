import { getCanonicalById, ingredientsMatchInTaxonomy } from './taxonomy';
import { MatchTier, Recipe, RecipeIngredient, RecipeMatchResult } from './types';

/**
 * Stateless Temporary Pantry / Fridge Matcher ("What Can I Make Right Now?")
 *
 * Since users enter a temporary scratchpad of ingredients they currently have on hand
 * (plus assumed everyday basics like salt, pepper, oil), we rank recipes by:
 *  1. Most entered scratchpad items matched (Input Hits)
 *  2. Fewest additional required ingredients needed (Missing Required)
 *  3. Overall required completion ratio + recipe rating tie-breaker
 */
export function matchRecipesByTemporaryIngredients(
  recipes: Recipe[],
  enteredCanonicalIds: string[],
  assumedStapleIds: string[]
): RecipeMatchResult[] {
  const uniqueEntered = Array.from(new Set(enteredCanonicalIds));
  const stapleSet = new Set(assumedStapleIds);

  if (uniqueEntered.length === 0) {
    return [];
  }

  const results: RecipeMatchResult[] = [];

  for (const recipe of recipes) {
    const matchedInputSet = new Set<string>();
    const missingRequired: RecipeIngredient[] = [];
    const optionalItems: RecipeIngredient[] = [];
    let requiredNonStapleCount = 0;
    let matchedRequiredCount = 0;

    // De-duplicate recipe ingredients by canonical ID in case Sauce & Main both use garlic
    const seenRecipeCanonicals = new Set<string>();

    for (const ing of recipe.ingredients) {
      if (ing.isOptional) {
        optionalItems.push(ing);
        // Still credit input hits if the user specifically entered an optional herb/topping!
        for (const enteredId of uniqueEntered) {
          if (ingredientsMatchInTaxonomy(enteredId, ing.canonicalIngredientId)) {
            matchedInputSet.add(enteredId);
          }
        }
        continue;
      }

      // Check if this ingredient matches any temporary item the user entered
      let matchedUserEntry = false;
      for (const enteredId of uniqueEntered) {
        if (ingredientsMatchInTaxonomy(enteredId, ing.canonicalIngredientId)) {
          matchedInputSet.add(enteredId);
          matchedUserEntry = true;
        }
      }

      // Check if covered by assumed staples (salt, black pepper, water, cooking oil, etc.)
      let isAssumedStaple = stapleSet.has(ing.canonicalIngredientId);
      if (!isAssumedStaple) {
        for (const stapleId of stapleSet) {
          if (ingredientsMatchInTaxonomy(stapleId, ing.canonicalIngredientId)) {
            isAssumedStaple = true;
            break;
          }
        }
      }

      if (seenRecipeCanonicals.has(ing.canonicalIngredientId)) {
        continue;
      }
      seenRecipeCanonicals.add(ing.canonicalIngredientId);

      // Only count non-staples (or items the user explicitly entered!) toward required tally
      if (!isAssumedStaple || matchedUserEntry) {
        requiredNonStapleCount++;
        if (matchedUserEntry) {
          matchedRequiredCount++;
        } else {
          missingRequired.push(ing);
        }
      }
    }

    const matchedInputIds = Array.from(matchedInputSet);
    if (matchedInputIds.length === 0) {
      continue;
    }

    const matchedInputNames = matchedInputIds.map(
      (id) => getCanonicalById(id)?.name ?? id.replace(/^custom-/, '').replace(/-/g, ' ')
    );

    const denom = Math.max(1, requiredNonStapleCount);
    const matchRatio = matchedRequiredCount / denom;
    const missingCount = missingRequired.length;

    let tier: MatchTier = 'uses_your_items';
    if (missingCount === 0) {
      tier = 'ready_now';
    } else if (missingCount <= 2) {
      tier = 'almost_there';
    }

    // Composite ranking:
    // - Heavy weight on matchedInputIds.length so using 3/3 of your entered items beats 1/3
    // - Strong bonus for 0 missing (ready now) and penalty per missing extra ingredient
    // - Match ratio tie-breaker
    const score =
      matchedInputIds.length * 100 +
      (missingCount === 0 ? 60 : 0) -
      missingCount * 12 +
      matchRatio * 40 +
      (recipe.rating ?? 0);

    results.push({
      recipe,
      tier,
      matchedInputIds,
      matchedInputNames,
      totalEnteredCount: uniqueEntered.length,
      missingRequiredIngredients: missingRequired,
      optionalIngredients: optionalItems,
      requiredNonStapleCount,
      matchedRequiredCount,
      matchRatio,
      score,
    });
  }

  return results.sort((a, b) => {
    if (b.matchedInputIds.length !== a.matchedInputIds.length) {
      return b.matchedInputIds.length - a.matchedInputIds.length;
    }
    if (a.missingRequiredIngredients.length !== b.missingRequiredIngredients.length) {
      return a.missingRequiredIngredients.length - b.missingRequiredIngredients.length;
    }
    return b.score - a.score;
  });
}
