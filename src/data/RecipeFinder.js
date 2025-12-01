/**
 * Finds all recipes that produce the specified item.
 * This function searches for recipes directly within buildings.
 * @param {string} itemId - The ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects, or null if none are found.
 */
export function findRecipesForItem(itemId) {
    console.debug(`[data.RecipeFinder.findRecipesForItem] Searching for recipes that produce item with ID: "${itemId}"`);

    const datas = window.datas;
    const foundRecipes = [];

    if (!datas || !datas.buildingsData) {
        console.error("[data.RecipeFinder.findRecipesForItem]: Buildings data is not available.");
        return null;
    }

    for (const buildingId in datas.buildingsData) {
        const building = datas.buildingsData[buildingId];
        if (!building || !building.recipes || !Array.isArray(building.recipes)) {
            continue;
        }

        for (let i = 0; i < building.recipes.length; i++) {
            const recipe = building.recipes[i];
            // Skip if the recipe or its products are not defined or not an array.
            if (!recipe || !recipe.products || !Array.isArray(recipe.products)) {
                continue;
            }

            // Check if any of the recipe's output products match the target item ID.
            if (recipe.products.some(p => p.item_id === itemId)) {
                if (typeof recipe.id === 'undefined') {
                    recipe.id = `${buildingId}_recipe_${i}`;
                    console.warn(`[data.RecipeFinder.findRecipesForItem] Recipe for item "${itemId}" in building "${buildingId}" was missing an ID. Generated temporary ID: "${recipe.id}". Please update your data file.`);
                }

                const foundRecipe = {
                    ...recipe,
                    buildingId: buildingId
                };
                foundRecipes.push(foundRecipe);
                console.debug(`[data.RecipeFinder.findRecipesForItem] Found a matching recipe in building "${buildingId}".`);
            }
        }
    }

    // Return the array of found recipes, or null if no recipes were found.
    if (foundRecipes.length > 0) {
        console.debug(`[data.RecipeFinder.findRecipesForItem] Found ${foundRecipes.length} recipes for item "${itemId}".`);
        return foundRecipes;
    } else {
        console.debug(`[data.RecipeFinder.findRecipesForItem] No recipes found for item "${itemId}".`);
        return null;
    }
}

/**
 * Finds all recipes that use the specified item as an ingredient.
 * This is used for finding all possible waste disposal recipes.
 * @param {string} itemId - The ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects, or null if none are found.
 */
export function findDisposalRecipesForItem(itemId) {
    // Log the start of the search for debugging purposes.
    console.debug(`[data.RecipeFinder.findDisposalRecipesForItem] Searching for recipes that use item with ID "${itemId}" as an ingredient.`);

    // Access the global data object.
    const datas = window.datas;
    const foundRecipes = [];

    // Defensive check: Ensure the buildings data structure exists.
    if (!datas || !datas.buildingsData) {
        console.error("[data.RecipeFinder.findDisposalRecipesForItem]: Buildings data is not available.");
        return null;
    }

    // Iterate through each building.
    for (const buildingId in datas.buildingsData) {
        const building = datas.buildingsData[buildingId];
        if (!building || !building.recipes || !Array.isArray(building.recipes)) {
            continue;
        }

        // Iterate through all recipes of the current building.
        for (const recipe of building.recipes) {
            // Skip if the recipe or its ingredients are not defined.
            if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
                continue;
            }

            // Check if any of the recipe's input ingredients match the target item ID.
            if (recipe.ingredients.some(ing => ing.item_id === itemId)) {
                // A match is found. Augment the recipe with its source context.
                const foundRecipe = {
                    ...recipe, // Copy all original recipe properties
                    buildingId: buildingId
                };
                foundRecipes.push(foundRecipe);
                console.debug(`[data.RecipeFinder.findDisposalRecipesForItem] Found a matching disposal recipe in building "${buildingId}".`);
            }
        }
    }

    // Return the array of found recipes, or null if none were found.
    if (foundRecipes.length > 0) {
        console.debug(`[data.RecipeFinder.findDisposalRecipesForItem] Found ${foundRecipes.length} disposal recipes for item "${itemId}".`);
        return foundRecipes;
    } else {
        console.debug(`[data.RecipeFinder.findDisposalRecipesForItem] No disposal recipes found for item "${itemId}".`);
        return null;
    }
}

/**
 * Finds a recipe that uses the specified item as an ingredient.
 * This is primarily used for finding waste disposal recipes.
 * @param {string} itemId - The ID of the item to find a recipe for.
 * @returns {Object|null} The recipe object, or null if none is found.
 */
export function findDisposalRecipeForItem(itemId) {
    // Log the start of the search.
    console.debug(`[data.RecipeFinder.findDisposalRecipeForItem] Searching for the first recipe that uses item "${itemId}" as an ingredient.`);

    const datas = window.datas;
    // Defensive check: Ensure the buildings data structure exists.
    if (!datas || !datas.buildingsData || !datas.buildingsData) {
        console.error("[data.RecipeFinder.findDisposalRecipeForItem]: Buildings data is not available.");
        return null;
    }

    // Iterate through each building.
    for (const buildingId in datas.buildingsData) {
        const building = datas.buildingsData[buildingId];
        if (!building || !building.recipes || !Array.isArray(building.recipes)) {
            continue;
        }

        // Iterate through all recipes of the current building.
        for (const recipe of building.recipes) {
            // Skip if the recipe or its ingredients are not defined.
            if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
                continue;
            }

            // Check if any of the recipe's ingredients match the target item ID.
            if (recipe.ingredients.some(ing => ing.item_id === itemId)) {
                // A match is found. Immediately return the augmented recipe object.
                // This "early return" pattern ensures we only get the first match.
                const foundRecipe = {
                    ...recipe, // Copy all original recipe properties
                    buildingId: buildingId
                };
                console.debug(`[data.RecipeFinder.findDisposalRecipeForItem] Found the first matching disposal recipe in building "${buildingId}".`);
                return foundRecipe;
            }
        }
    }

    // If the loops complete without finding a recipe, return null.
    console.debug(`[data.RecipeFinder.findDisposalRecipeForItem] No disposal recipe found for item "${itemId}".`);
    return null;
}