/**
 * Get all items from itemsData
 * @returns {Array} Array of all items
 */
function getAllItems() {
    const app = window.productionApp;
    if (!app.itemsData || !app.itemsData.items) {
        console.error('itemsData or itemsData.items is not defined');
        return [];
    }
    return Object.keys(app.itemsData.items).map(itemId => ({
        id: itemId,
        ...app.itemsData.items[itemId]
    }));
}

/**
 * Find all recipes for an item
 * @param {string} itemId - ID of the item
 * @returns {Array|null} Array of recipes or null if none found
 */
function findRecipesForItem(itemId) {
    const app = window.productionApp;
    const recipes = [];
    for (const buildingId in app.buildingsData.buildings) {
        const building = app.buildingsData.buildings[buildingId];
        if (!building.modes) continue;
        for (const modeId in building.modes) {
            const mode = building.modes[modeId];
            if (!mode.recipes) continue;
            for (const recipe of mode.recipes) {
                if (recipe.products && Array.isArray(recipe.products) && recipe.products.some(p => p.item_id === itemId)) {
                    recipe.buildingId = buildingId;
                    recipes.push(recipe);
                }
            }
        }
    }
    return recipes.length > 0 ? recipes : null;
}