/**
 * Finds all recipes that produce the specified item.
 * This function is adapted to search inside the 'modes' property of buildings.
 * @param {string} itemId - The ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects, or null if none are found.
 */
export function findRecipesForItem(itemId) {
    // Log the start of the search for debugging purposes.
    console.debug(`[data.RecipeFinder.findRecipesForItem] Searching for recipes that produce item with ID: "${itemId}"`);

    // Access the global data object. This contains all buildings, modes, and recipes.
    const datas = window.datas;
    const foundRecipes = [];

    // Defensive check: Ensure the buildings data structure exists before trying to iterate.
    if (!datas || !datas.buildingsData || !datas.buildingsData.buildings) {
        console.error("[data.RecipeFinder.findRecipesForItem]: Buildings data is not available.");
        return null;
    }

    // Iterate through each building defined in the data.
    for (const buildingId in datas.buildingsData.buildings) {
        const building = datas.buildingsData.buildings[buildingId];
        // Skip if the building or its modes are not defined.
        if (!building || !building.modes) {
            continue;
        }

        // Iterate through each operational mode of the current building.
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            // Skip if the mode or its recipes are not defined or not an array.
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            // Iterate through all recipes available in the current mode.
            for (const recipe of mode.recipes) {
                // Skip if the recipe or its products are not defined or not an array.
                if (!recipe || !recipe.products || !Array.isArray(recipe.products)) {
                    continue;
                }

                // Check if any of the recipe's output products match the target item ID.
                if (recipe.products.some(p => p.item_id === itemId)) {
                    // A match is found. Create a new object containing the recipe's data
                    // and add context (buildingId and modeId) for later use.
                    const foundRecipe = {
                        ...recipe, // Copy all original recipe properties
                        buildingId: buildingId,
                        modeId: modeId
                    };
                    foundRecipes.push(foundRecipe);
                    console.debug(`[data.RecipeFinder.findRecipesForItem] Found a matching recipe in building "${buildingId}", mode "${modeId}".`);
                }
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
    if (!datas || !datas.buildingsData || !datas.buildingsData.buildings) {
        console.error("[data.RecipeFinder.findDisposalRecipesForItem]: Buildings data is not available.");
        return null;
    }

    // Iterate through each building.
    for (const buildingId in datas.buildingsData.buildings) {
        const building = datas.buildingsData.buildings[buildingId];
        if (!building || !building.modes) {
            continue;
        }

        // Iterate through each mode of the building.
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            // Iterate through all recipes of the current mode.
            for (const recipe of mode.recipes) {
                // Skip if the recipe or its ingredients are not defined.
                if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
                    continue;
                }

                // Check if any of the recipe's input ingredients match the target item ID.
                if (recipe.ingredients.some(ing => ing.item_id === itemId)) {
                    // A match is found. Augment the recipe with its source context.
                    const foundRecipe = {
                        ...recipe, // Copy all original recipe properties
                        buildingId: buildingId,
                        modeId: modeId
                    };
                    foundRecipes.push(foundRecipe);
                    console.debug(`[data.RecipeFinder.findDisposalRecipesForItem] Found a matching disposal recipe in building "${buildingId}", mode "${modeId}".`);
                }
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
    if (!datas || !datas.buildingsData || !datas.buildingsData.buildings) {
        console.error("[data.RecipeFinder.findDisposalRecipeForItem]: Buildings data is not available.");
        return null;
    }

    // Iterate through each building.
    for (const buildingId in datas.buildingsData.buildings) {
        const building = datas.buildingsData.buildings[buildingId];
        if (!building || !building.modes) {
            continue;
        }

        // Iterate through each mode of the building.
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            // Iterate through all recipes of the current mode.
            for (const recipe of mode.recipes) {
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
                        buildingId: buildingId,
                        modeId: modeId
                    };
                    console.debug(`[data.RecipeFinder.findDisposalRecipeForItem] Found the first matching disposal recipe in building "${buildingId}", mode "${modeId}".`);
                    return foundRecipe;
                }
            }
        }
    }

    // If the loops complete without finding a recipe, return null.
    console.debug(`[data.RecipeFinder.findDisposalRecipeForItem] No disposal recipe found for item "${itemId}".`);
    return null;
}