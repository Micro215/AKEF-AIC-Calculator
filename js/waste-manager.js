/**
 * Manages waste disposal logic by finding producers and creating edges to disposal nodes.
 */
class WasteManager {
    constructor() {
        this.wasteItems = new Set();
        // Add a map to store discovered waste items and their rates during a calculation
        this.discoveredWaste = new Map();
    }

    /**
     * Load waste items from db/waste.json
     */
    async loadWasteItems() {
        try {
            if (!window.productionApp || !window.productionApp.projectBaseUrl) {
                console.error('ProductionApp is not initialized');
                return false;
            }

            const response = await fetch(`${window.productionApp.projectBaseUrl}db/waste.json`);
            if (response.ok) {
                const wasteItems = await response.json();
                this.wasteItems = new Set(wasteItems);
                return true;
            }
        } catch (error) {
            console.error('Error loading waste items:', error);
        }
        return false;
    }

    /**
     * Checks if an item is defined as a waste item.
     * @param {string} itemId - The ID of the item to check.
     * @returns {boolean} True if the item is a waste item.
     */
    isWasteItem(itemId) {
        return this.wasteItems.has(itemId);
    }

    /**
     * Records a waste item and its production rate.
     * This is called during the populateNeedsMap phase.
     * @param {string} itemId - The ID of the waste item.
     * @param {number} rate - The production rate of the waste item.
     */
    recordWaste(itemId, rate) {
        if (this.isWasteItem(itemId)) {
            if (this.discoveredWaste.has(itemId)) {
                this.discoveredWaste.set(itemId, this.discoveredWaste.get(itemId) + rate);
            } else {
                this.discoveredWaste.set(itemId, rate);
            }
        }
    }

    /**
     * Processes the recorded waste items, creates disposal nodes and edges.
     * This is called after populateNeedsMap is complete.
     * @param {Map<string, Object>} allNeedsMap - The map containing all production nodes and their data.
     * @returns {Array<Object>} An array of edge objects for waste disposal.
     */
    processDisposal(allNeedsMap) {
        const edgesToAdd = [];

        this.discoveredWaste.forEach((wasteRate, wasteItemId) => {
            // Find ALL production nodes that create this waste byproduct
            const producerNodes = [];
            allNeedsMap.forEach((producerData, producerId) => {
                if (producerData.isRaw || producerId === wasteItemId) {
                    return;
                }

                const recipe = producerData.allRecipes[producerData.selectedRecipeIndex];
                if (recipe && recipe.products) {
                    const isWasteInProducts = recipe.products.some(p => p.item_id === wasteItemId);
                    if (isWasteInProducts) {
                        producerNodes.push({
                            nodeId: producerId,
                            level: producerData.level
                        });
                    }
                }
            });

            if (producerNodes.length === 0) {
                console.warn(`Could not find a producer for waste item: ${wasteItemId}`);
                return;
            }

            // Find ALL disposal recipes for the waste item
            const disposalRecipes = findDisposalRecipesForItem(wasteItemId);
            if (!disposalRecipes || disposalRecipes.length === 0) {
                console.warn(`No disposal recipes found for waste item: ${wasteItemId}`);
                return;
            }

            // Select the first recipe for calculation purposes, but store all of them
            const disposalRecipe = disposalRecipes[0];
            const recipeTimeInMinutes = disposalRecipe.time / window.productionApp.SECONDS_PER_MINUTE;
            const wasteIngredient = disposalRecipe.ingredients.find(ing => ing.item_id === wasteItemId);

            if (!wasteIngredient || wasteIngredient.amount <= 0) {
                console.error(`Invalid ingredient data for disposal of ${wasteItemId}`);
                return;
            }
            const machinesNeeded = wasteRate / (wasteIngredient.amount / recipeTimeInMinutes);

            const disposalNodeId = `disposal_${wasteItemId}`;

            // Add the disposal node to the map so it can be rendered
            allNeedsMap.set(disposalNodeId, {
                itemId: disposalNodeId,
                originalItemId: wasteItemId,
                rate: wasteRate,
                level: producerNodes[0].level + 1, // Set level based on the first producer
                isRaw: false,
                isTarget: false,
                isWasteDisposal: true,
                allRecipes: disposalRecipes,
                selectedRecipeIndex: 0,
                machineCount: machinesNeeded,
                transportType: 'belt',
                transportCount: 0
            });

            // Create edges from ALL producer nodes to the waste disposal node
            producerNodes.forEach(producer => {
                edgesToAdd.push({
                    source: producer.nodeId,
                    target: disposalNodeId,
                    amount: wasteRate
                });
            });
        });

        // Clear the discovered waste for the next calculation
        this.discoveredWaste.clear();

        return edgesToAdd;
    }
}

// Export for use in other modules
window.WasteManager = WasteManager;