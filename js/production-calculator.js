/**
 * Calculate production based on selected item and target rate
 * @param {boolean} preservePositions - Whether to preserve node positions
 */
function calculateProduction(preservePositions = false) {
    const app = window.productionApp;
    
    // Validate inputs
    if (!app.currentTargetItem) {
        alert('Please select an item to produce.');
        return;
    }
    const targetRate = parseFloat(app.amountInput.value);
    if (isNaN(targetRate) || targetRate <= 0) {
        alert('Please enter a valid production rate.');
        return;
    }

    // Save current node positions if requested
    if (preservePositions && app.productionGraph) {
        saveNodePositions();
    }

    // Show loading state
    showLoading(true);
    app.noRecipeMessage.style.display = 'none';

    // Reset graph
    resetGraph();

    // Calculate with a small delay to allow UI to update
    setTimeout(() => {
        // Clear previous calculations
        app.allNeedsMap.clear();

        // Calculate needs recursively
        calculateNeedsRecursive(app.currentTargetItem.id, targetRate);

        // Check if any recipes were found
        if (app.allNeedsMap.size === 0) {
            showLoading(false);
            app.noRecipeMessage.style.display = 'block';
            app.productionGraph = null;
            return;
        }

        // Create and render the production graph
        app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap);
        
        // Restore positions if requested and available
        if (preservePositions && app.nodePositions.size > 0) {
            restoreNodePositions();
        }
        
        renderGraph();
        updateTotalPower();
        showLoading(false);
    }, 100);
}

/**
 * Save current positions of all nodes
 */
function saveNodePositions() {
    const app = window.productionApp;
    if (!app.productionGraph || !app.productionGraph.nodes) return;
    
    app.nodePositions.clear();
    app.productionGraph.nodes.forEach((node, itemId) => {
        app.nodePositions.set(itemId, {
            x: node.x,
            y: node.y
        });
    });
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
 * Recursively calculate production needs for an item
 * @param {string} itemId - ID of the item
 * @param {number} desiredRate - Desired production rate
 * @param {number} level - Current level in the production chain
 * @param {boolean} isTarget - Whether this is the target item
 */
function calculateNeedsRecursive(itemId, desiredRate, level = 0, isTarget = false) {
    const app = window.productionApp;
    
    // If item already exists in the map, update its rate
    if (app.allNeedsMap.has(itemId)) {
        const existing = app.allNeedsMap.get(itemId);
        const oldRate = existing.rate;
        existing.rate += desiredRate;
        existing.level = Math.max(existing.level, level);

        // Update machine count if item has recipes
        if (existing.allRecipes && existing.allRecipes.length > 0) {
            const selectedRecipe = existing.allRecipes[existing.selectedRecipeIndex];
            if (selectedRecipe) {
                const recipeTimeInMinutes = selectedRecipe.time / app.SECONDS_PER_MINUTE;
                const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
                const machinesNeeded = existing.rate / (product.amount / recipeTimeInMinutes);
                existing.machineCount = machinesNeeded;
            }
        }
        return;
    }

    // Find recipes for the item
    const allRecipes = findRecipesForItem(itemId);
    const selectedIndex = app.selectedRecipesMap.get(itemId) ?? 0;
    const selectedRecipe = allRecipes ? allRecipes[selectedIndex] : null;

    // Determine if this is a raw material
    const isRaw = !allRecipes || allRecipes.length === 0 ||
        (selectedRecipe && (!selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0));

    // Add item to the needs map
    app.allNeedsMap.set(itemId, {
        itemId,
        rate: desiredRate,
        level,
        isRaw,
        isTarget,
        allRecipes: allRecipes || [],
        selectedRecipeIndex: selectedIndex,
        machineCount: 0
    });

    // If item has a recipe, calculate needs for its ingredients
    if (selectedRecipe) {
        const recipeTimeInMinutes = selectedRecipe.time / app.SECONDS_PER_MINUTE;
        const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
        const machinesNeeded = desiredRate / (product.amount / recipeTimeInMinutes);

        // Update machine count for this item
        const itemData = app.allNeedsMap.get(itemId);
        itemData.machineCount = machinesNeeded;

        // Calculate needs for ingredients
        let totalInputRate = 0;
        if (selectedRecipe.ingredients) {
            for (const ingredient of selectedRecipe.ingredients) {
                const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                totalInputRate += consumptionRate;
                calculateNeedsRecursive(ingredient.item_id, consumptionRate, level + 1, false);
            }
        }
        itemData.totalInputRate = totalInputRate;
    }
}

/**
 * Render the production graph
 */
function renderGraph() {
    const app = window.productionApp;
    if (!app.productionGraph) return;
    app.productionGraph.applyLayout('hierarchical');
}

/**
 * Update the total power consumption display
 */
function updateTotalPower() {
    const app = window.productionApp;
    if (!app.allNeedsMap || app.allNeedsMap.size === 0) return;
    
    let totalPower = 0;
    app.allNeedsMap.forEach(itemData => {
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
    app.selectedItemName.textContent = 'Choose a recipe...';
    app.allNeedsMap.clear();
    app.selectedRecipesMap.clear();
    app.nodePositions.clear();
    app.canvasTransform = { x: 0, y: 0, scale: 1 };

    // Clear graph
    resetGraph();
    app.noRecipeMessage.style.display = 'none';
}

/**
 * Show or hide loading message
 * @param {boolean} show - Whether to show the loading message
 */
function showLoading(show) {
    const app = window.productionApp;
    app.loadingMessage.style.display = show ? 'flex' : 'none';
}