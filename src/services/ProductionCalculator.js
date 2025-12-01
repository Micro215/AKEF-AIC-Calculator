import { CONSTANTS } from '../config/Constants.js';
import { findRecipesForItem } from '../data/RecipeFinder.js';

import { buildLinearSystem, solveLinearSystem } from '../utils/MathUtils.js';

import { renderGraph, resetGraph } from '../utils/GraphUtils.js';
import { showLoading } from '../utils/ShowLoading.js';
import { updateTotalPower } from '../utils/AppUtils.js';

import { ProductionGraph } from "../ui/components/ProductionGraph.js";

/**
 * Main function to calculate the entire production chain for a selected target item and rate.
 * It handles discovery of all items, solving the production system, and populating the data for rendering.
 * @param {boolean} [preservePositions=false] - If true, attempts to keep the nodes in their previous positions.
 * @param {Map<string, {x: number, y: number}>} [positionsToRestore=null] - A map of node positions to restore, overriding preservation.
 */
export function calculateProduction(preservePositions = false, positionsToRestore = null) {
    // --- Input Validation ---
    if (!window.datas.currentTargetItem) {
        const message = window.localization.t('app.select_item_alert');
        alert(message);
        console.warn("[services.ProductionCalculator.calculateProduction] Calculation aborted: No target item selected.");
        return;
    }
    const targetRate = parseFloat(window.elements.amountInput.value);
    if (isNaN(targetRate) || targetRate <= 0) {
        const message = window.localization.t('app.valid_rate_alert');
        alert(message);
        console.warn(`[services.ProductionCalculator.calculateProduction] Calculation aborted: Invalid target rate "${targetRate}".`);
        return;
    }

    console.log(`[services.ProductionCalculator.calculateProduction] Starting calculation for item "${window.datas.currentTargetItem.id}" at rate ${targetRate}/min. Preserve positions: ${preservePositions}`);

    // --- State Preservation ---
    // Save the current map of selected recipes before resetting.
    const currentRecipes = new Map(window.datas.selectedRecipesMap);

    // Use provided positions or clear existing ones based on the preserve flag.
    if (preservePositions && positionsToRestore && positionsToRestore.size > 0) {
        console.debug("[services.ProductionCalculator.calculateProduction] Restoring from provided positions map.");
        window.datas.nodePositions = new Map(positionsToRestore);
    } else if (preservePositions) {
        console.debug("[services.ProductionCalculator.calculateProduction] Preserving positions flag is true, but no positions provided. Clearing existing positions for a fresh layout.");
        window.datas.nodePositions.clear();
    }

    // If preserving, save current node positions before resetting the graph.
    if (preservePositions && window.datas.productionGraph && window.datas.productionGraph.nodes) {
        if (!positionsToRestore) {
            positionsToRestore = new Map();
            window.datas.productionGraph.nodes.forEach((node, itemId) => {
                positionsToRestore.set(itemId, { x: node.x, y: node.y });
            });
            console.debug("[services.ProductionCalculator.calculateProduction] Saved current node positions for preservation.");
        }
    }

    // --- Initialization ---
    // Clear the previous graph from the DOM and data.
    resetGraph();
    // Show the loading indicator to the user.
    showLoading(true);
    window.elements.noRecipeMessage.style.display = 'none';

    // --- Core Calculation (asynchronous) ---
    // Use a small delay to allow the UI to update (e.g., show loading spinner).
    setTimeout(() => {
        console.debug("[services.ProductionCalculator.calculateProduction] Starting core calculation logic.");
        // Clear any previous calculation results.
        window.datas.allNeedsMap.clear();

        // Discover all items involved in the production chain, including byproducts.
        const allItemIds = discoverAllItems(window.datas.currentTargetItem.id);
        if (allItemIds.size === 0) {
            console.warn("[services.ProductionCalculator.calculateProduction] No items found in the production chain.");
            showLoading(false);
            window.elements.noRecipeMessage.style.display = 'block';
            window.datas.productionGraph = null;
            return;
        }
        console.debug(`[services.ProductionCalculator.calculateProduction] Discovered ${allItemIds.size} unique items in the chain.`);

        // Build and solve the system of linear equations to find required production rates.
        const { matrix, vector, itemIndexMap } = buildLinearSystem(allItemIds, window.datas.currentTargetItem.id, targetRate);
        const solutionVector = solveLinearSystem(matrix, vector);

        if (!solutionVector) {
            console.error("[services.ProductionCalculator.calculateProduction] Could not solve the production system. The system may be underdetermined or invalid.");
            showLoading(false);
            window.elements.noRecipeMessage.style.display = 'block';
            window.datas.productionGraph = null;
            return;
        }
        console.debug("[services.ProductionCalculator.calculateProduction] Linear system solved successfully.");

        // Populate the main data map with rates, machine counts, and other details.
        populateNeedsMap(itemIndexMap, solutionVector);

        // Process any waste byproducts and create disposal nodes/edges.
        const wasteDisposalEdges = window.wasteManager.processDisposal(window.datas.allNeedsMap);

        // Calculate hierarchical levels for graph layout after all nodes (including disposal) are present.
        calculateLevels(window.datas.currentTargetItem.id);

        // Create the visual graph component with the calculated data.
        window.datas.productionGraph = new ProductionGraph(window.elements.graphSvg, window.elements.nodesContainer, window.datas.allNeedsMap, wasteDisposalEdges);

        // --- Post-Calculation Setup ---
        // Restore the map of selected recipes.
        window.datas.selectedRecipesMap = currentRecipes;

        // Apply saved or restored positions to the newly created graph nodes.
        if (preservePositions && positionsToRestore && positionsToRestore.size > 0) {
            const validPositions = new Map();
            window.datas.productionGraph.nodes.forEach((node, itemId) => {
                const savedPosition = positionsToRestore.get(itemId);
                if (savedPosition) {
                    validPositions.set(itemId, savedPosition);
                    // Apply the saved position directly to the node object.
                    node.x = savedPosition.x;
                    node.y = savedPosition.y;
                }
            });
            // Update the global map to match the applied positions.
            window.datas.nodePositions = validPositions;
            console.debug("[services.ProductionCalculator.calculateProduction] Applied preserved positions to graph nodes.");
        } else {
            // If not preserving, apply the default hierarchical layout.
            window.datas.productionGraph.applyLayout('hierarchical');
        }

        // Apply user's display settings (e.g., show/hide raw materials).
        if (window.functions.applyDisplaySettings) {
            window.functions.applyDisplaySettings();
        }

        // Finalize: render the graph, update power consumption, and hide loading.
        renderGraph();
        updateTotalPower();
        showLoading(false);
        console.log("[services.ProductionCalculator.calculateProduction] Calculation and rendering complete.");

        // Dispatch a custom event to notify other parts of the application.
        document.dispatchEvent(new CustomEvent('productionCalculated'));
    }, 100);
}

/**
 * Traverses the production chain starting from a root item to discover all related items.
 * It follows both ingredients (up the chain) and products (down the chain to find byproducts).
 * @param {string} rootItemId - The ID of the item to start the discovery from.
 * @returns {Set<string>} A Set containing all unique item IDs found in the chain.
 */
function discoverAllItems(rootItemId) {
    console.debug(`[services.ProductionCalculator.discoverAllItems] Discovering all items for root: ${rootItemId}`);
    const discoveredItems = new Set();
    // Use a stack for a depth-first search (DFS) traversal.
    const stack = [rootItemId];

    while (stack.length > 0) {
        const itemId = stack.pop();

        // Skip if already discovered to prevent cycles and redundant work.
        if (discoveredItems.has(itemId)) {
            continue;
        }

        discoveredItems.add(itemId);

        // Find all possible recipes for the current item.
        const recipes = findRecipesForItem(itemId);
        if (recipes) {
            // Get the recipe selected by the user (or default to the first one).
            const recipe = recipes[window.datas.selectedRecipesMap.get(itemId) ?? 0];
            if (recipe) {
                // Add all ingredients to the stack to be processed.
                if (recipe.ingredients) {
                    recipe.ingredients.forEach(ing => stack.push(ing.item_id));
                }
                // Add all products to the stack to catch byproducts.
                if (recipe.products) {
                    recipe.products.forEach(prod => stack.push(prod.item_id));
                }
            }
        }
    }

    return discoveredItems;
}

/**
 * Calculates the hierarchical level for each item in the production chain using a depth-first search (DFS).
 * The target item is level 0, its ingredients are level 1, their ingredients are level 2, and so on.
 * This is safe for graphs with cycles due to the `visitedPath` check.
 * @param {string} targetItemId - The ID of the final product item.
 */
function calculateLevels(targetItemId) {
    console.debug(`[services.ProductionCalculator.calculateLevels] Calculating hierarchical levels for target: ${targetItemId}`);
    const levels = new Map();

    /**
     * Recursive helper function to perform DFS and assign levels.
     * @param {string} itemId - The current item ID.
     * @param {number} currentLevel - The level to assign to the current item.
     * @param {Map} levels - The map storing item levels.
     * @param {Set} visitedPath - A set of items in the current DFS path to detect cycles.
     */
    function dfsAssignLevels(itemId, currentLevel, levels, visitedPath) {
        // If the item already has a lower or equal level, no update is needed.
        if (levels.has(itemId) && levels.get(itemId) <= currentLevel) return;
        // If the item is in the current path, a cycle is detected; abort to prevent infinite recursion.
        if (visitedPath.has(itemId)) {
            console.warn(`[services.ProductionCalculator.calculateLevels] Cycle detected involving item: ${itemId}. Skipping further traversal.`);
            return;
        }

        levels.set(itemId, currentLevel);
        visitedPath.add(itemId);

        // Disposal nodes are sinks and have no further dependencies.
        if (itemId.startsWith('disposal_')) return;

        const itemData = window.datas.allNeedsMap.get(itemId);
        if (itemData && itemData.allRecipes && itemData.allRecipes.length > 0) {
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe && recipe.ingredients) {
                // Recursively call for each ingredient, incrementing the level.
                for (const ingredient of recipe.ingredients) {
                    if (window.datas.allNeedsMap.has(ingredient.item_id)) {
                        dfsAssignLevels(ingredient.item_id, currentLevel + 1, levels, visitedPath);
                    }
                }
            }
        }
        // Remove the item from the path as we backtrack.
        visitedPath.delete(itemId);
    }

    // Start the DFS from the target item at level 0.
    dfsAssignLevels(targetItemId, 0, levels, new Set());

    // Apply the calculated levels to the data map.
    window.datas.allNeedsMap.forEach((itemData, itemId) => {
        itemData.level = levels.get(itemId) ?? 0;
    });
}

/**
 * Populates the main `window.datas.allNeedsMap` with detailed data for each item based on the solved rates.
 * This is a two-pass process: first for primary items, then for byproducts.
 * @param {Map<string, number>} itemIndexMap - A map from item ID to its index in the solution vector.
 * @param {number[]} solutionVector - The array of calculated production rates for each item.
 */
function populateNeedsMap(itemIndexMap, solutionVector) {
    console.debug("[services.ProductionCalculator.populateNeedsMap] Populating needs map with calculated data.");
    // Create a reverse map from index to item ID for easier lookup.
    const indexItemMap = new Map();
    itemIndexMap.forEach((index, itemId) => {
        indexItemMap.set(index, itemId);
    });

    // --- First Pass: Populate map with primary products calculated by the linear system ---
    for (let i = 0; i < solutionVector.length; i++) {
        const itemId = indexItemMap.get(i);
        const rate = solutionVector[i];

        // Ignore items with a negligible production rate.
        if (rate <= 1e-6) continue;

        const allRecipes = findRecipesForItem(itemId);
        const selectedIndex = window.datas.selectedRecipesMap.get(itemId) ?? 0;
        const selectedRecipe = allRecipes && allRecipes.length > 0 ? allRecipes[selectedIndex] : null;

        // An item is raw if it has no selected recipe or its recipe has no ingredients.
        const isRaw = !selectedRecipe || !selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0;

        let machineCount = 0;
        if (selectedRecipe) {
            const recipeTimeInMinutes = selectedRecipe.time / CONSTANTS.SECONDS_PER_MINUTE;
            if (selectedRecipe.products && selectedRecipe.products.length > 0) {
                // Find the product that matches the current item ID.
                const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
                if (product && product.amount > 0) {
                    // Calculate machines needed: (total rate needed) / (rate one machine produces)
                    machineCount = rate / (product.amount / recipeTimeInMinutes);
                }
            }
        }

        // Calculate transport requirements (e.g., number of conveyor belts).
        let transportType = 'item_log_belt_01';
        let transportCount = 0;
        if (window.datas.itemsData[itemId] && window.datas.itemsData[itemId].transport_type) {
            transportType = window.datas.itemsData[itemId].transport_type;
        }
        if (window.datas.transportData && window.datas.transportData[transportType]) {
            const transportSpeed = window.datas.transportData[transportType].speed;
            transportCount = rate / transportSpeed;
        }

        // Store the comprehensive data for the item in the main map.
        window.datas.allNeedsMap.set(itemId, {
            itemId,
            rate: rate,
            level: 0, // Will be calculated later
            isRaw,
            isTarget: (itemId === window.datas.currentTargetItem.id),
            allRecipes: allRecipes || [],
            selectedRecipeIndex: selectedIndex,
            machineCount: machineCount,
            transportType: transportType,
            transportCount: transportCount
        });
    }

    // --- Second Pass: Calculate and add byproducts to the map ---
    const processedRecipes = new Set(); // To avoid processing the same recipe's byproducts multiple times.
    window.datas.allNeedsMap.forEach((itemData, itemId) => {
        // Skip raw materials or items with no machines.
        if (itemData.isRaw || itemData.machineCount <= 0) return;

        const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
        if (!recipe || !recipe.products || processedRecipes.has(recipe.id)) return;

        processedRecipes.add(recipe.id);
        // Find the primary product of the recipe to use as a reference for rate calculation.
        const primaryProduct = recipe.products.find(p => p.item_id === itemId);
        if (!primaryProduct) return;

        if (Array.isArray(recipe.products)) {
            recipe.products.forEach(product => {
                // Skip the primary product itself.
                if (product.item_id === itemId) return;

                // If the product is a waste item, record it with the waste manager instead of adding it to the main graph.
                if (window.wasteManager && window.wasteManager.isWasteItem(product.item_id)) {
                    // Calculate byproduct rate based on the ratio to the primary product.
                    const byproductRate = itemData.rate * (product.amount / primaryProduct.amount);
                    window.wasteManager.recordWaste(product.item_id, byproductRate);
                    console.debug(`[services.ProductionCalculator.populateNeedsMap] Recorded waste byproduct: ${product.item_id} at rate ${byproductRate.toFixed(2)}/min.`);
                    return;
                }

                // Calculate the rate for the non-waste byproduct.
                const byproductRate = itemData.rate * (product.amount / primaryProduct.amount);
                const existingByproductData = window.datas.allNeedsMap.get(product.item_id);

                if (existingByproductData) {
                    // If the byproduct already exists (e.g., from another recipe), just add to its rate.
                    existingByproductData.rate += byproductRate;
                } else {
                    // If it's a new byproduct, create a new entry for it.
                    const byproductRecipes = findRecipesForItem(product.item_id);
                    const isByproductRaw = !byproductRecipes || byproductRecipes.length === 0;

                    let transportType = 'item_log_belt_01';
                    let transportCount = 0;
                    if (window.datas.itemsData[product.item_id] && window.datas.itemsData[product.item_id].transport_type) {
                        transportType = window.datas.itemsData[product.item_id].transport_type;
                    }
                    if (window.datas.transportData && window.datas.transportData[transportType]) {
                        const transportSpeed = window.datas.transportData[transportType].speed;
                        transportCount = byproductRate / transportSpeed;
                    }

                    window.datas.allNeedsMap.set(product.item_id, {
                        itemId: product.item_id,
                        rate: byproductRate,
                        level: 0, // Will be calculated later
                        isRaw: isByproductRaw,
                        isTarget: false,
                        isByproduct: true, // Flag to identify it as a byproduct
                        allRecipes: byproductRecipes || [],
                        selectedRecipeIndex: 0,
                        machineCount: 0, // Byproducts don't require their own machines in this model
                        transportType: transportType,
                        transportCount: transportCount
                    });
                    console.debug(`[services.ProductionCalculator.populateNeedsMap] Added new byproduct: ${product.item_id} at rate ${byproductRate.toFixed(2)}/min.`);
                }
            });
        }
    });

    // After all nodes are added, calculate their hierarchical levels for layout.
    calculateLevels(window.datas.currentTargetItem.id);
}