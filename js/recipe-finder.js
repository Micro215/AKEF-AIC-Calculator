/**
 * Finds all recipes that produce the specified item.
 * This function is adapted to search inside the 'modes' property of buildings.
 * @param {string} itemId - The ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects, or null if none are found.
 */
function findRecipesForItem(itemId) {
    const app = window.productionApp;
    const foundRecipes = [];

    if (!app || !app.buildingsData || !app.buildingsData.buildings) {
        console.error("findRecipesForItem: App or buildings data is not available.");
        return null;
    }

    for (const buildingId in app.buildingsData.buildings) {
        const building = app.buildingsData.buildings[buildingId];
        if (!building || !building.modes) {
            continue;
        }

        // Iterate through each mode of the building
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            // Iterate through all recipes of the current mode
            for (const recipe of mode.recipes) {
                if (!recipe || !recipe.products || !Array.isArray(recipe.products)) {
                    continue;
                }

                // Check if any of the recipe's products match the target item ID
                if (recipe.products.some(p => p.item_id === itemId)) {
                    foundRecipes.push({
                        ...recipe, // copy all original properties
                        buildingId: buildingId,
                        modeId: modeId
                    });
                }
            }
        }
    }

    if (foundRecipes.length > 0) {
        return foundRecipes;
    } else {
        // console.warn(`findRecipesForItem: No recipes found for item: ${itemId}`);
        return null;
    }
}

/**
 * Finds all recipes that use the specified item as an ingredient.
 * This is used for finding all possible waste disposal recipes.
 * @param {string} itemId - The ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects, or null if none are found.
 */
function findDisposalRecipesForItem(itemId) {
    const app = window.productionApp;
    const foundRecipes = [];

    if (!app || !app.buildingsData || !app.buildingsData.buildings) {
        console.error("findDisposalRecipesForItem: App or buildings data is not available.");
        return null;
    }

    for (const buildingId in app.buildingsData.buildings) {
        const building = app.buildingsData.buildings[buildingId];
        if (!building || !building.modes) {
            continue;
        }

        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            for (const recipe of mode.recipes) {
                if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
                    continue;
                }

                // Check if any of the recipe's ingredients match the target item ID
                if (recipe.ingredients.some(ing => ing.item_id === itemId)) {
                    // This is critical for preventing UI bugs.
                    foundRecipes.push({
                        ...recipe, // copy all original properties
                        buildingId: buildingId,
                        modeId: modeId
                    });
                }
            }
        }
    }

    if (foundRecipes.length > 0) {
        return foundRecipes;
    } else {
        // console.warn(`findDisposalRecipesForItem: No disposal recipes found for item: ${itemId}`); // for debugging
        return null;
    }
}

/**
 * Finds a recipe that uses the specified item as an ingredient.
 * This is primarily used for finding waste disposal recipes.
 * @param {string} itemId - The ID of the item to find a recipe for.
 * @returns {Object|null} The recipe object, or null if none is found.
 */
function findDisposalRecipeForItem(itemId) {
    const app = window.productionApp;
    if (!app || !app.buildingsData || !app.buildingsData.buildings) {
        return null;
    }

    for (const buildingId in app.buildingsData.buildings) {
        const building = app.buildingsData.buildings[buildingId];
        if (!building || !building.modes) {
            continue;
        }

        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode || !mode.recipes || !Array.isArray(mode.recipes)) {
                continue;
            }

            for (const recipe of mode.recipes) {
                if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
                    continue;
                }

                if (recipe.ingredients.some(ing => ing.item_id === itemId)) {
                    return {
                        ...recipe, // copy all original properties
                        buildingId: buildingId,
                        modeId: modeId
                    };
                }
            }
        }
    }
    return null;
}