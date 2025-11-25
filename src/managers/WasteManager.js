import { findDisposalRecipesForItem } from "../data/RecipeFinder.js";

/**
 * Manages waste disposal logic by identifying waste byproducts,
 * finding appropriate disposal recipes, and integrating disposal nodes
 * into the production graph.
 */
export class WasteManager {
    constructor() {
        // A Set to store the IDs of all items defined as waste.
        this.wasteItems = new Set();
        // A Map to temporarily store waste items discovered during a production calculation.
        // Key: itemId (string), Value: total production rate (number).
        this.discoveredWaste = new Map();
        console.debug("[managers.WasteManager] Initialized.");
    }

    /**
     * Asynchronously loads the list of waste item IDs from the 'db/waste.json' file.
     * @returns {Promise<boolean>} A promise that resolves to true if loading was successful, false otherwise.
     */
    async loadWasteItems() {
        console.debug("[managers.WasteManager] Loading waste items from 'db/waste.json'.");
        try {
            // Ensure the project's base URL is available before fetching.
            if (!window.projectBaseUrl) {
                console.error('[managers.WasteManager] Project base URL is not initialized. Cannot load waste items.');
                return false;
            }
            const response = await fetch(`${window.projectBaseUrl}db/waste.json`);
            if (response.ok) {
                const wasteItems = await response.json();
                this.wasteItems = new Set(wasteItems);
                console.log(`[managers.WasteManager] Successfully loaded ${this.wasteItems.size} waste items.`);
                return true;
            } else {
                console.error(`[managers.WasteManager] Failed to load waste items. Server responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('[managers.WasteManager] Error loading waste items:', error);
        }
        return false;
    }

    /**
     * Checks if a given item ID is defined as a waste item.
     * @param {string} itemId - The ID of the item to check.
     * @returns {boolean} True if the item is a waste item, false otherwise.
     */
    isWasteItem(itemId) {
        const isWaste = this.wasteItems.has(itemId);
        console.debug(`[managers.WasteManager] Checking if item "${itemId}" is waste: ${isWaste}`);
        return isWaste;
    }

    /**
     * Records a waste item and its production rate during the production calculation phase.
     * This method aggregates the total production rate for each waste item.
     * @param {string} itemId - The ID of the waste item.
     * @param {number} rate - The production rate of the waste item (items per minute).
     */
    recordWaste(itemId, rate) {
        if (this.isWasteItem(itemId)) {
            if (this.discoveredWaste.has(itemId)) {
                // If the item is already recorded, add the new rate to the existing one.
                const currentRate = this.discoveredWaste.get(itemId);
                this.discoveredWaste.set(itemId, currentRate + rate);
                console.debug(`[managers.WasteManager] Updating waste for "${itemId}": ${currentRate} + ${rate} = ${currentRate + rate}`);
            } else {
                // If it's the first time this waste item is discovered, create a new entry.
                this.discoveredWaste.set(itemId, rate);
                console.debug(`[managers.WasteManager] Recording new waste item "${itemId}" with rate: ${rate}`);
            }
        }
    }

    /**
     * Processes all recorded waste items, finds disposal solutions, and integrates them into the production graph.
     * This method should be called after the main production needs map has been populated.
     * @param {Map<string, Object>} allNeedsMap - The map containing all production nodes and their data.
     * @returns {Array<Object>} An array of edge objects to be added to the graph, representing waste flows.
     */
    processDisposal(allNeedsMap) {
        console.log("[managers.WasteManager] Processing disposal for all discovered waste items.");
        const edgesToAdd = [];

        // Iterate over each unique waste item discovered during the calculation.
        this.discoveredWaste.forEach((wasteRate, wasteItemId) => {
            console.debug(`[managers.WasteManager] Processing disposal for waste item "${wasteItemId}" with total rate: ${wasteRate}.`);

            // Find all producer nodes that create this specific waste item as a byproduct.
            const producerNodes = [];
            allNeedsMap.forEach((producerData, producerId) => {
                // Skip raw materials and the waste item itself if it's a target.
                if (producerData.isRaw || producerId === wasteItemId) return;
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
                console.warn(`[managers.WasteManager] Could not find a producer for waste item: ${wasteItemId}. Skipping disposal.`);
                return;
            }
            console.debug(`[managers.WasteManager] Found ${producerNodes.length} producer(s) for waste item "${wasteItemId}".`);

            // Find a recipe that can dispose of this waste item.
            const disposalRecipes = findDisposalRecipesForItem(wasteItemId);
            if (!disposalRecipes || disposalRecipes.length === 0) {
                console.warn(`[managers.WasteManager] No disposal recipes found for waste item: ${wasteItemId}. Skipping disposal.`);
                return;
            }
            // Use the first available disposal recipe.
            const disposalRecipe = disposalRecipes[0];
            console.debug(`[managers.WasteManager] Using disposal recipe for waste item "${wasteItemId}".`);

            // Calculate the number of disposal machines required to handle the total waste rate.
            const recipeTimeInMinutes = disposalRecipe.time / 60;
            const wasteIngredient = disposalRecipe.ingredients.find(ing => ing.item_id === wasteItemId);

            if (!wasteIngredient || wasteIngredient.amount <= 0) {
                console.error(`[managers.WasteManager] Invalid ingredient data for disposal of ${wasteItemId}. Amount is ${wasteIngredient?.amount}. Skipping.`);
                return;
            }
            // Rate per machine = (amount of waste one recipe can handle) / (time for one recipe in minutes)
            const ratePerMachine = wasteIngredient.amount / recipeTimeInMinutes;
            const machinesNeeded = wasteRate / ratePerMachine;
            console.debug(`[managers.WasteManager] Calculated ${machinesNeeded.toFixed(2)} machines needed for disposal of "${wasteItemId}".`);

            // Create a unique ID for the new disposal node.
            const disposalNodeId = `disposal_${wasteItemId}`;

            // Add the new disposal node to the main needs map.
            allNeedsMap.set(disposalNodeId, {
                itemId: disposalNodeId,
                originalItemId: wasteItemId, // Keep track of the original waste item ID.
                rate: wasteRate,
                // Place the disposal node one level below its highest-level producer.
                level: Math.max(...Array.from(allNeedsMap.values()).map(n => n.level || 0)) + 1,
                isRaw: false,
                isTarget: false,
                isWasteDisposal: true, // Flag to identify this as a disposal node.
                allRecipes: disposalRecipes,
                selectedRecipeIndex: 0,
                machineCount: machinesNeeded,
                transportType: 'belt',
                transportCount: 0
            });
            console.log(`[managers.WasteManager] Created disposal node "${disposalNodeId}" for waste item "${wasteItemId}".`);

            // Create edges from all producer nodes to the new disposal node.
            producerNodes.forEach(producer => {
                edgesToAdd.push({
                    source: producer.nodeId,
                    target: disposalNodeId,
                    amount: wasteRate
                });
            });
            console.debug(`[managers.WasteManager] Created ${producerNodes.length} edges to disposal node "${disposalNodeId}".`);
        });

        // Clear the discovered waste map to prepare for the next calculation cycle.
        this.discoveredWaste.clear();
        console.log(`[managers.WasteManager] Disposal processing complete. Generated ${edgesToAdd.length} new edges.`);
        return edgesToAdd;
    }
}