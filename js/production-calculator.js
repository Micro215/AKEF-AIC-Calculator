/**
 * Calculate production based on selected item and target rate
 * @param {boolean} preservePositions - Whether to preserve node positions
 */
function calculateProduction(preservePositions = false, positionsToRestore = null) {
    const app = window.productionApp;

    // Validate inputs
    if (!app.currentTargetItem) {
        alert(window.localization.t('app.select_item_alert'));
        return;
    }
    const targetRate = parseFloat(app.amountInput.value);
    if (isNaN(targetRate) || targetRate <= 0) {
        alert(window.localization.t('app.valid_rate_alert'));
        return;
    }

    // Save current recipes before calculation
    const currentRecipes = new Map(app.selectedRecipesMap);

    // Use passed positions if provided
    if (preservePositions && positionsToRestore && positionsToRestore.size > 0) {
        app.nodePositions = new Map(positionsToRestore);
    } else if (preservePositions) {
        app.nodePositions.clear();
    }

    // Save current node positions before resetting the graph
    if (preservePositions && app.productionGraph && app.productionGraph.nodes) {
        if (!positionsToRestore) {
            positionsToRestore = new Map();
            app.productionGraph.nodes.forEach((node, itemId) => {
                positionsToRestore.set(itemId, {
                    x: node.x,
                    y: node.y
                });
            });
        }
    }

    // Reset graph
    resetGraph();

    // Show loading state
    showLoading(true);
    app.noRecipeMessage.style.display = 'none';

    // Calculate with a small delay to allow UI to update
    setTimeout(() => {
        // Clear previous calculations
        app.allNeedsMap.clear();

        const allItemIds = discoverAllItems(app.currentTargetItem.id);
        if (allItemIds.size === 0) {
            showLoading(false);
            app.noRecipeMessage.style.display = 'block';
            app.productionGraph = null;
            return;
        }

        const { matrix, vector, itemIndexMap } = buildLinearSystem(allItemIds, app.currentTargetItem.id, targetRate);
        const solutionVector = solveLinearSystem(matrix, vector);

        if (!solutionVector) {
            console.error("Could not solve the production system.");
            showLoading(false);
            app.noRecipeMessage.style.display = 'block';
            app.productionGraph = null;
            return;
        }

        populateNeedsMap(itemIndexMap, solutionVector);

        // Get waste edges from the manager and pass them to the graph
        const wasteDisposalEdges = window.wasteManager.processDisposal(app.allNeedsMap);

        // Calculate the hierarchical levels for layout, now that disposal nodes exist
        calculateLevels(app.currentTargetItem.id);

        // Create and render the production graph
        app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap, wasteDisposalEdges);

        // Apply display settings now that the graph is guaranteed to exist
        if (app.applyDisplaySettings) {
            app.applyDisplaySettings();
        }

        // Restore recipes after calculation
        app.selectedRecipesMap = currentRecipes;

        // Apply positions after creating the production graph
        if (preservePositions && positionsToRestore && positionsToRestore.size > 0) {
            // Create a new map with only positions that match current nodes
            const validPositions = new Map();
            app.productionGraph.nodes.forEach((node, itemId) => {
                const savedPosition = positionsToRestore.get(itemId);
                if (savedPosition) {
                    validPositions.set(itemId, savedPosition);
                    // Apply the position directly to the node object
                    node.x = savedPosition.x;
                    node.y = savedPosition.y;
                }
            });

            // Update the global map for consistency
            app.nodePositions = validPositions;
        }

        renderGraph();
        updateTotalPower();
        showLoading(false);

        document.dispatchEvent(new CustomEvent('productionCalculated'));
    }, 100);
}

/**
 * Discovers all items required for the target item by traversing ingredients and products.
 * @param {string} rootItemId - The ID of the item to start from.
 * @returns {Set<string>} A set of all item IDs in the production chain.
 */
function discoverAllItems(rootItemId) {
    const app = window.productionApp;
    const discoveredItems = new Set();
    const stack = [rootItemId];

    while (stack.length > 0) {
        const itemId = stack.pop();

        if (discoveredItems.has(itemId)) {
            continue;
        }

        discoveredItems.add(itemId);

        const recipes = findRecipesForItem(itemId);
        if (recipes) {
            const recipe = recipes[app.selectedRecipesMap.get(itemId) ?? 0];
            if (recipe) {
                // Traverse ingredients
                if (recipe.ingredients) {
                    recipe.ingredients.forEach(ing => stack.push(ing.item_id));
                }
                // Traverse ALL products to capture byproducts
                if (recipe.products) {
                    recipe.products.forEach(prod => stack.push(prod.item_id));
                }
            }
        }
    }

    return discoveredItems;
}

/**
 * Builds the system of linear equations (Ax = b) for the production chain.
 * @param {Set<string>} itemIds - All item IDs in the chain.
 * @param {string} targetItemId - The final product's ID.
 * @param {number} targetRate - The desired production rate for the target.
 * @returns {{matrix: number[][], vector: number[], itemIndexMap: Map<string, number>}}
 */
function buildLinearSystem(itemIds, targetItemId, targetRate) {
    const app = window.productionApp;
    const itemIndexMap = new Map();
    const indexItemMap = new Map();
    let index = 0;
    for (const itemId of itemIds) {
        itemIndexMap.set(itemId, index);
        indexItemMap.set(index, itemId);
        index++;
    }

    const n = itemIds.size;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    const vector = new Array(n).fill(0);

    // Set the external demand (b vector)
    const targetIndex = itemIndexMap.get(targetItemId);
    vector[targetIndex] = targetRate;

    // Build the matrix (A)
    for (let i = 0; i < n; i++) {
        const itemId = indexItemMap.get(i);
        matrix[i][i] = 1; // x_i on the left side

        const recipes = findRecipesForItem(itemId);
        if (recipes) {
            const recipe = recipes[app.selectedRecipesMap.get(itemId) ?? 0];
            if (recipe && recipe.ingredients) {
                for (const ingredient of recipe.ingredients) {
                    if (!itemIndexMap.has(ingredient.item_id)) continue;

                    const ingredientIndex = itemIndexMap.get(ingredient.item_id);
                    const product = recipe.products.find(p => p.item_id === itemId) || recipe.products[0];

                    // Coefficient is (ingredient_amount / product_amount)
                    const coefficient = ingredient.amount / product.amount;
                    matrix[ingredientIndex][i] -= coefficient;
                }
            }
        }
    }

    return { matrix, vector, itemIndexMap };
}

/**
 * Solves a system of linear equations Ax = b using Gaussian elimination.
 * @param {number[][]} A - The coefficient matrix.
 * @param {number[]} b - The constant vector.
 * @returns {number[] | null} The solution vector x, or null if no unique solution exists.
 */
function solveLinearSystem(A, b) {
    const n = b.length;
    // Create an augmented matrix [A|b]
    const aug = A.map((row, i) => [...row, b[i]]);

    // Forward elimination
    for (let col = 0; col < n; col++) {
        // Find pivot row
        let pivotRow = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) {
                pivotRow = r;
            }
        }

        // Swap current row with pivot row
        [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

        // If the pivot element is zero, the system is singular or has infinite solutions
        if (Math.abs(aug[col][col]) < 1e-9) {
            return null;
        }

        // Eliminate this variable from all other rows
        for (let r = 0; r < n; r++) {
            if (r !== col) {
                const factor = aug[r][col] / aug[col][col];
                for (let c = col; c <= n; c++) {
                    aug[r][c] -= factor * aug[col][c];
                }
            }
        }
    }

    // Back substitution (since we have reduced row echelon form)
    const solution = new Array(n);
    for (let i = 0; i < n; i++) {
        solution[i] = aug[i][n] / aug[i][i];
    }

    return solution;
}

/**
 * Calculates the hierarchical level for each item using a DFS approach.
 * This is safe for graphs with cycles.
 * @param {string} targetItemId - The ID of the final product.
 */
function calculateLevels(targetItemId) {
    const app = window.productionApp;
    const levels = new Map();

    /**
     * Recursive helper function to perform DFS and assign levels.
     * @param {string} itemId - The current item to process.
     * @param {number} currentLevel - The level to assign to the current item.
     * @param {Map<string, number>} levels - The map storing item levels.
     * @param {Set<string>} visitedPath - The set of items in the current recursion path to detect cycles.
     */
    function dfsAssignLevels(itemId, currentLevel, levels, visitedPath) {
        // If we've already found a shorter or equal path to this item, stop.
        if (levels.has(itemId) && levels.get(itemId) <= currentLevel) {
            return;
        }

        // Cycle detection: if the item is already in the current path, we've hit a loop.
        if (visitedPath.has(itemId)) {
            return;
        }

        // Assign the (new) level to the item.
        levels.set(itemId, currentLevel);
        // Add the item to the current path to detect cycles on deeper levels.
        visitedPath.add(itemId);

        // Handle waste disposal nodes
        if (itemId.startsWith('disposal_')) {
            return;
        }

        const itemData = app.allNeedsMap.get(itemId);
        if (itemData && itemData.allRecipes && itemData.allRecipes.length > 0) {
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe && recipe.ingredients) {
                // Recurse for each ingredient, assigning it a level one deeper.
                for (const ingredient of recipe.ingredients) {
                    if (app.allNeedsMap.has(ingredient.item_id)) {
                        dfsAssignLevels(ingredient.item_id, currentLevel + 1, levels, visitedPath);
                    }
                }
            }
        }

        // Backtrack: remove the item from the path as we return from recursion.
        visitedPath.delete(itemId);
    }

    // Start the DFS from the target item at level 0.
    dfsAssignLevels(targetItemId, 0, levels, new Set());

    // Update the levels in the allNeedsMap for the graph rendering.
    app.allNeedsMap.forEach((itemData, itemId) => {
        itemData.level = levels.get(itemId) ?? 0;
    });
}

/**
 * Populates the app.allNeedsMap with the calculated production rates.
 * @param {Map<string, number>} itemIndexMap - Map from item ID to matrix index.
 * @param {number[]} solutionVector - The calculated production rates.
 */
function populateNeedsMap(itemIndexMap, solutionVector) {
    const app = window.productionApp;
    const indexItemMap = new Map();
    itemIndexMap.forEach((index, itemId) => {
        indexItemMap.set(index, itemId);
    });

    // First pass: Populate map with primary products calculated by the linear system
    for (let i = 0; i < solutionVector.length; i++) {
        const itemId = indexItemMap.get(i);
        const rate = solutionVector[i];

        if (rate <= 1e-6) continue; // Skip items with negligible production

        const allRecipes = findRecipesForItem(itemId);
        const selectedIndex = app.selectedRecipesMap.get(itemId) ?? 0;
        const selectedRecipe = allRecipes && allRecipes.length > 0 ? allRecipes[selectedIndex] : null;

        const isRaw = !selectedRecipe || !selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0;

        let machineCount = 0;
        if (selectedRecipe) {
            const recipeTimeInMinutes = selectedRecipe.time / app.SECONDS_PER_MINUTE;
            if (selectedRecipe.products && selectedRecipe.products.length > 0) {
                const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
                if (product && product.amount > 0) {
                    machineCount = rate / (product.amount / recipeTimeInMinutes);
                }
            }
        }

        // Calculate transport requirements
        let transportType = 'belt'; // Default to belt
        let transportCount = 0;

        if (app.itemsData.items[itemId] && app.itemsData.items[itemId].transport_type) {
            transportType = app.itemsData.items[itemId].transport_type;
        }

        if (app.transportData && app.transportData[transportType]) {
            const transportSpeed = app.transportData[transportType].speed;
            transportCount = rate / transportSpeed;
        }

        app.allNeedsMap.set(itemId, {
            itemId,
            rate: rate,
            level: 0, // Will be updated by calculateLevels
            isRaw,
            isTarget: (itemId === app.currentTargetItem.id),
            allRecipes: allRecipes || [],
            selectedRecipeIndex: selectedIndex,
            machineCount: machineCount,
            transportType: transportType,
            transportCount: transportCount
        });
    }

    // Second pass: Calculate and add byproducts to the map
    const processedRecipes = new Set(); // Avoid processing the same recipe multiple times
    app.allNeedsMap.forEach((itemData, itemId) => {
        // Skip raw resources or items that aren't being produced
        if (itemData.isRaw || itemData.machineCount <= 0) {
            return;
        }

        const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
        if (!recipe || !recipe.products || processedRecipes.has(recipe.id)) {
            return;
        }

        processedRecipes.add(recipe.id);
        const primaryProduct = recipe.products.find(p => p.item_id === itemId);

        if (!primaryProduct) return;

        // Check that products is an array before calling forEach
        if (Array.isArray(recipe.products)) {
            recipe.products.forEach(product => {
                // Skip the primary product, we already have it
                if (product.item_id === itemId) return;

                // Check if it's a waste item and record it
                if (window.wasteManager && window.wasteManager.isWasteItem(product.item_id)) {
                    const byproductRate = itemData.rate * (product.amount / primaryProduct.amount);
                    window.wasteManager.recordWaste(product.item_id, byproductRate);
                    return; // Don't create a node for the waste item itself
                }

                // Calculate the byproduct rate based on the primary product's rate
                const byproductRate = itemData.rate * (product.amount / primaryProduct.amount);

                // Check if the byproduct already exists in the map
                const existingByproductData = app.allNeedsMap.get(product.item_id);

                if (existingByproductData) {
                    // If it exists, add to its rate. It might be produced by multiple recipes.
                    existingByproductData.rate += byproductRate;
                } else {
                    // If it's a new byproduct, create an entry for it.
                    const byproductRecipes = findRecipesForItem(product.item_id);
                    const isByproductRaw = !byproductRecipes || byproductRecipes.length === 0;

                    // Calculate transport for the new byproduct
                    let transportType = 'belt';
                    let transportCount = 0;
                    if (app.itemsData.items[product.item_id] && app.itemsData.items[product.item_id].transport_type) {
                        transportType = app.itemsData.items[product.item_id].transport_type;
                    }
                    if (app.transportData && app.transportData[transportType]) {
                        const transportSpeed = app.transportData[transportType].speed;
                        transportCount = byproductRate / transportSpeed;
                    }

                    app.allNeedsMap.set(product.item_id, {
                        itemId: product.item_id,
                        rate: byproductRate,
                        level: 0, // Will be updated by calculateLevels
                        isRaw: isByproductRaw,
                        isTarget: false,
                        isByproduct: true, // Flag this as a byproduct
                        allRecipes: byproductRecipes || [],
                        selectedRecipeIndex: 0,
                        machineCount: 0, // Byproducts don't require machines themselves
                        transportType: transportType,
                        transportCount: transportCount
                    });
                }
            });
        }
    });

    // Calculate the hierarchical levels for layout
    calculateLevels(app.currentTargetItem.id);
}

/**
 * Restore saved positions to nodes
 */
function restoreNodePositions() {
    const app = window.productionApp;
    if (!app.productionGraph || !app.productionGraph.nodes || app.nodePositions.size === 0) return;

    app.productionGraph.nodes.forEach((node, itemId) => {
        const savedPosition = app.nodePositions.get(itemId);
        if (savedPosition) {
            node.x = savedPosition.x;
            node.y = savedPosition.y;
        }
    });
}

/**
 * Render the production graph
 */
function renderGraph() {
    const app = window.productionApp;
    if (!app.productionGraph) return;

    // Ensure waste disposal nodes are properly handled
    app.allNeedsMap.forEach((itemData, itemId) => {
        if (itemId.startsWith('disposal_')) {
            // Ensure waste disposal nodes have the correct properties
            itemData.isWasteDisposal = true;
            itemData.originalItemId = itemId.replace('disposal_', '');
        }
    });

    app.productionGraph.applyLayout('hierarchical');

    // Force a render to update the DOM with the final node positions
    app.productionGraph.render();
}

/**
 * Update the total power consumption display
 */
function updateTotalPower() {
    const app = window.productionApp;
    if (!app.allNeedsMap || app.allNeedsMap.size === 0) return;

    let totalPower = 0;
    app.allNeedsMap.forEach(itemData => {
        // Skip byproducts, as they don't consume power directly
        if (itemData.isByproduct) {
            return;
        }

        if (itemData.isRaw && !app.showRawMaterials.checked) return;

        if (itemData.machineCount > 0) {
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe) {
                const power = app.buildingsData.buildings[recipe.buildingId].power || 0;
                totalPower += Math.ceil(itemData.machineCount) * power;
            }
        }
    });
    app.totalPowerEl.textContent = totalPower.toFixed(0);
}

/**
 * Reset the graph
 */
function resetGraph() {
    const app = window.productionApp;
    if (app.productionGraph) {
        app.productionGraph.stopSimulation();
    }
    app.graphSvg.innerHTML = '';
    while (app.nodesContainer.firstChild) {
        app.nodesContainer.removeChild(app.nodesContainer.firstChild);
    }
    app.productionGraph = null;
    app.totalPowerEl.textContent = '0';
}

/**
 * Reset the entire application
 */
function resetApp() {
    const app = window.productionApp;
    app.currentTargetItem = null;
    app.selectedItemName.textContent = window.localization.t('app.choose_recipe');
    app.allNeedsMap.clear();
    app.nodePositions.clear();
    app.canvasTransform = { x: 0, y: 0, scale: 1 };

    // Clear graph
    resetGraph();
    app.noRecipeMessage.style.display = 'none';
}

/**
 * Reset the entire application and clear all cached data
 */
function clearApp() {
    // Set flag to prevent beforeunload from saving data
    window.isResetting = true;

    // Clear all localStorage data
    localStorage.clear();

    // Reload the page to get a clean state
    window.location.reload();
}

/**
 * Show or hide loading message
 * @param {boolean} show - Whether to show the loading message
 */
function showLoading(show) {
    const app = window.productionApp;
    app.loadingMessage.style.display = show ? 'flex' : 'none';
}

/**
 * Restore saved positions to nodes
 */
function restoreNodePositions() {
    const app = window.productionApp;

    if (!app.productionGraph || !app.productionGraph.nodes) {
        return 0;
    }

    if (app.nodePositions.size === 0) {
        return 0;
    }

    let positionsRestored = 0;
    let positionsMatched = 0;
    let positionsNotMatched = 0;

    app.productionGraph.nodes.forEach((node, itemId) => {
        const savedPosition = app.nodePositions.get(itemId);
        if (savedPosition && typeof savedPosition.x === 'number' && typeof savedPosition.y === 'number') {
            node.x = savedPosition.x;
            node.y = savedPosition.y;
            positionsRestored++;
            positionsMatched++;
        } else {
            positionsNotMatched++;
        }
    });

    return positionsRestored;
}