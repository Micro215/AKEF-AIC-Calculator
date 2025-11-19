/**
 * Show delete confirmation modal
 * @param {string} itemId - ID of the item to delete
 */
function showDeleteConfirmation(itemId) {
    const app = window.productionApp;
    const deleteModal = document.getElementById('delete-confirmation-modal');
    const deleteItemName = document.getElementById('delete-item-name');

    const item = app.itemsData.items[itemId];
    if (item) {
        deleteItemName.textContent = window.localization.getItemName(item);
        app.nodePendingDeletion = itemId;
        deleteModal.classList.add('is-active');
    }
}

/**
 * Hide delete confirmation modal
 */
function hideDeleteConfirmation() {
    const app = window.productionApp;
    const deleteModal = document.getElementById('delete-confirmation-modal');
    deleteModal.classList.remove('is-active');
    app.nodePendingDeletion = null;
}

/**
 * Find all nodes that should be deleted when deleting a specific node
 * @param {string} initialNodeId - ID of the initial node to delete
 * @returns {Set} Set of node IDs to delete
 */
function findNodesToDelete(initialNodeId) {
    const app = window.productionApp;
    const nodesToDelete = new Set([initialNodeId]);
    const nodesToCheck = [initialNodeId];

    while (nodesToCheck.length > 0) {
        const currentNodeId = nodesToCheck.pop();
        const currentNodeData = app.allNeedsMap.get(currentNodeId);

        // Skip if node doesn't exist or is a raw material
        if (!currentNodeData || currentNodeData.isRaw) {
            continue;
        }

        const recipe = currentNodeData.allRecipes[currentNodeData.selectedRecipeIndex];
        if (!recipe || !recipe.ingredients) {
            continue;
        }

        // Check each ingredient
        for (const ingredient of recipe.ingredients) {
            const ingredientId = ingredient.item_id;

            // Skip if already marked for deletion
            if (nodesToDelete.has(ingredientId)) {
                continue;
            }

            // Check if ingredient is used elsewhere
            let isUsedElsewhere = false;
            for (const [otherNodeId, otherNodeData] of app.allNeedsMap.entries()) {
                // Skip self and nodes already marked for deletion
                if (otherNodeId === currentNodeId || nodesToDelete.has(otherNodeId)) {
                    continue;
                }

                // Check if other node uses this ingredient
                const otherRecipe = otherNodeData.allRecipes[otherNodeData.selectedRecipeIndex];
                if (otherRecipe && otherRecipe.ingredients) {
                    if (otherRecipe.ingredients.some(ing => ing.item_id === ingredientId)) {
                        isUsedElsewhere = true;
                        break;
                    }
                }
            }

            // If not used elsewhere, mark for deletion
            if (!isUsedElsewhere) {
                nodesToDelete.add(ingredientId);
                nodesToCheck.push(ingredientId);
            }
        }
    }

    return nodesToDelete;
}

/**
 * Delete a node and all its dependent nodes
 * @param {string} nodeId - ID of the node to delete
 */
function deleteNodeAndDependents(nodeId) {
    const app = window.productionApp;
    
    // Find all nodes to delete
    const nodesToDelete = findNodesToDelete(nodeId);

    // Clear the graph
    app.graphSvg.innerHTML = '';
    while (app.nodesContainer.firstChild) {
        app.nodesContainer.removeChild(app.nodesContainer.firstChild);
    }

    // Remove nodes from the needs map
    nodesToDelete.forEach(idToDelete => {
        app.allNeedsMap.delete(idToDelete);
        app.nodePositions.delete(idToDelete); // Also remove from saved positions
    });

    // If deleted node was the target, reset target
    if (app.currentTargetItem && app.currentTargetItem.id === nodeId) {
        app.currentTargetItem = null;
        app.selectedItemName.textContent = window.localization.t('app.choose_recipe');
    }

    // Recreate graph if there are still nodes
    if (app.allNeedsMap.size > 0) {
        app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap);
        renderGraph();
        updateTotalPower();
    } else {
        app.productionGraph = null;
        app.totalPowerEl.textContent = '0';
        app.nodePositions.clear(); // Clear saved positions if graph is empty
    }
}