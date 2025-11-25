/**
 * Retrieves all items from the global application data.
 * Transforms the items object from `window.datas.itemsData.items` into an array of item objects.
 * @returns {Array<Object>} An array of item objects, each with an 'id' and its properties. Returns an empty array if data is unavailable.
 */
export function getAllItems() {
    const datas = window.datas;

    // Guard clause: Ensure the necessary data structure exists before proceeding.
    if (!datas.itemsData || !datas.itemsData.items) {
        console.error('[data.DataLoader.getAllItems] itemsData or itemsData.items is not defined in window.datas.');
        return [];
    }

    // Transform the items object into an array.
    // Each key from the object becomes the 'id' of a new item object.
    const allItems = Object.keys(datas.itemsData.items).map(itemId => ({
        id: itemId,
        ...datas.itemsData.items[itemId]
    }));

    console.debug(`[data.DataLoader.getAllItems] Successfully retrieved ${allItems.length} items.`);
    return allItems;
}

/**
 * Searches through all buildings and their modes to find all recipes that produce a specific item.
 * Note: Despite its name, this function returns the full recipe objects, not just the count.
 * @param {string} itemId - The unique ID of the item to find recipes for.
 * @returns {Array<Object>|null} An array of recipe objects that produce the item, or null if no recipes are found.
 */
export function findRecipesCountForItem(itemId) {
    const datas = window.datas;

    // Guard clause: Ensure the buildings data structure exists before trying to iterate over it.
    if (!datas.buildingsData || !datas.buildingsData.buildings) {
        console.error('[data.DataLoader.findRecipesCountForItem] buildingsData or buildingsData.buildings is not defined in window.datas.');
        return null;
    }

    console.debug(`[data.DataLoader.findRecipesCountForItem] Searching for recipes that produce item with ID: "${itemId}"`);
    const recipes = [];

    // Iterate through all buildings defined in the data.
    for (const buildingId in datas.buildingsData.buildings) {
        const building = datas.buildingsData.buildings[buildingId];
        if (!building.modes) continue; // Skip if the building has no operational modes.

        // Iterate through all modes of the current building.
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode.recipes) continue; // Skip if the mode has no recipes.

            // Iterate through all recipes in the current mode.
            for (const recipe of mode.recipes) {
                // Check if the recipe's products array contains the target itemId.
                if (recipe.products && Array.isArray(recipe.products) && recipe.products.some(p => p.item_id === itemId)) {
                    // If a match is found, enrich the recipe object with its parent building's ID and add it to the results.
                    recipe.buildingId = buildingId;
                    recipes.push(recipe);
                    console.debug(`[data.DataLoader.findRecipesCountForItem] Found recipe for item "${itemId}" in building "${buildingId}", mode "${modeId}".`);
                }
            }
        }
    }

    const result = recipes.length > 0 ? recipes : null;
    console.debug(`[data.DataLoader.findRecipesCountForItem] Search complete. Found ${recipes.length} recipes for item "${itemId}".`);
    return result;
}