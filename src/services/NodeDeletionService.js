import { updateTotalPower } from "../utils/AppUtils.js";
import { renderGraph, resetGraph } from "../utils/GraphUtils.js";

import { ProductionGraph } from "../ui/components/ProductionGraph.js";
import { updateItemSelectorIcon } from "../ui/controllers/UpdateIcons.js";

/**
 * Recursively finds all nodes that become obsolete when a specific node is deleted.
 * A node is considered obsolete if it's an ingredient for the deleted node and is not used by any other active node.
 * @param {string} initialNodeId - The ID of the node to start the deletion from.
 * @returns {Set<string>} A Set containing the IDs of all nodes to be deleted.
 */
function findNodesToDelete(initialNodeId) {
    console.debug(`[services.NodeDeletionService.findNodesToDelete] Starting deletion cascade for node: ${initialNodeId}`);
    // Initialize a set to store all nodes marked for deletion and a stack for nodes to check.
    const nodesToDelete = new Set([initialNodeId]);
    const nodesToCheck = [initialNodeId];

    // Continue checking as long as there are nodes in the stack.
    while (nodesToCheck.length > 0) {
        // Get the next node to check from the top of the stack.
        const currentNodeId = nodesToCheck.pop();
        const currentNodeData = window.datas.allNeedsMap.get(currentNodeId);

        // Skip if the node doesn't exist or is a raw material (as they have no dependencies).
        if (!currentNodeData || currentNodeData.isRaw) {
            console.debug(`[services.NodeDeletionService.findNodesToDelete] Skipping node ${currentNodeId} (raw material or not found).`);
            continue;
        }

        const recipe = currentNodeData.allRecipes[currentNodeData.selectedRecipeIndex];
        if (!recipe || !recipe.ingredients) {
            console.warn(`[services.NodeDeletionService.findNodesToDelete] Node ${currentNodeId} has no recipe or ingredients. Skipping.`);
            continue;
        }

        // Iterate through each ingredient of the current node's recipe.
        for (const ingredient of recipe.ingredients) {
            const ingredientId = ingredient.item_id;

            // If the ingredient is already marked for deletion, skip to the next one.
            if (nodesToDelete.has(ingredientId)) {
                continue;
            }

            // Check if this ingredient is used by any other node in the production graph.
            let isUsedElsewhere = false;
            for (const [otherNodeId, otherNodeData] of window.datas.allNeedsMap.entries()) {
                // Skip checking against itself and nodes already marked for deletion.
                if (otherNodeId === currentNodeId || nodesToDelete.has(otherNodeId)) {
                    continue;
                }

                // Check if the other node's recipe uses this ingredient.
                const otherRecipe = otherNodeData.allRecipes[otherNodeData.selectedRecipeIndex];
                if (otherRecipe && otherRecipe.ingredients) {
                    if (otherRecipe.ingredients.some(ing => ing.item_id === ingredientId)) {
                        isUsedElsewhere = true;
                        break; // Found another use, no need to check further.
                    }
                }
            }

            // If the ingredient is not used anywhere else, mark it for deletion and add it to the stack for further checking.
            if (!isUsedElsewhere) {
                console.debug(`[services.NodeDeletionService.findNodesToDelete] Marking dependent node ${ingredientId} for deletion.`);
                nodesToDelete.add(ingredientId);
                nodesToCheck.push(ingredientId);
            }
        }
    }

    console.log(`[services.NodeDeletionService.findNodesToDelete] Final set of nodes to delete:`, Array.from(nodesToDelete));
    return nodesToDelete;
}

/**
 * Deletes a specific node and all its dependent nodes from the production graph.
 * This function updates the data structures and re-renders the graph.
 * @param {string} nodeId - The ID of the node to delete.
 */
export function deleteNodeAndDependents(nodeId) {
    console.log(`[services.NodeDeletionService.deleteNodeAndDependents] Deleting node and its dependents, starting with: ${nodeId}`);

    // Step 1: Find all nodes that should be deleted.
    const nodesToDelete = findNodesToDelete(nodeId);

    // Step 2: Modify the existing graph instance instead of recreating it.
    // This preserves the state of edges (including waste disposal edges).
    const graph = window.datas.productionGraph;
    if (graph) {
        console.log("[services.NodeDeletionService.deleteNodeAndDependents] Modifying existing graph instance.");

        // Step 2a: Remove nodes from the graph's internal map and from the DOM.
        nodesToDelete.forEach(idToDelete => {
            const nodeToRemove = graph.nodes.get(idToDelete);
            if (nodeToRemove && nodeToRemove.element) {
                nodeToRemove.element.remove();
            }
            graph.nodes.delete(idToDelete);
            // Also remove from the main data map and position map
            window.datas.allNeedsMap.delete(idToDelete);
            window.datas.nodePositions.delete(idToDelete);
        });

        // Step 2b: Remove edges connected to the deleted nodes.
        const initialEdgeCount = graph.edges.length;
        graph.edges = graph.edges.filter(edge => 
            !nodesToDelete.has(edge.source) && !nodesToDelete.has(edge.target)
        );
        console.debug(`[services.NodeDeletionService.deleteNodeAndDependents] Removed ${initialEdgeCount - graph.edges.length} edges.`);

        // Step 2c-extra: Check if only raw materials and disposal nodes are left.
        // If so, remove the now-redundant disposal nodes.
        if (graph.nodes.size > 0) {
            let onlyRawAndDisposalLeft = true;
            for (const node of graph.nodes.values()) {
                // If we find any node that is not raw and not a disposal node, we stop.
                if (!node.data.isRaw && !node.data.isWasteDisposal) {
                    onlyRawAndDisposalLeft = false;
                    break;
                }
            }

            if (onlyRawAndDisposalLeft) {
                console.log("[services.NodeDeletionService.deleteNodeAndDependents] Only raw and disposal nodes left. Auto-removing disposal nodes.");
                const disposalNodesToDelete = [];
                graph.nodes.forEach((node, itemId) => {
                    if (node.data.isWasteDisposal) {
                        disposalNodesToDelete.push(itemId);
                    }
                });

                // Remove the identified disposal nodes and their edges
                disposalNodesToDelete.forEach(idToDelete => {
                    const nodeToRemove = graph.nodes.get(idToDelete);
                    if (nodeToRemove && nodeToRemove.element) {
                        nodeToRemove.element.remove();
                    }
                    graph.nodes.delete(idToDelete);
                    window.datas.allNeedsMap.delete(idToDelete);
                    window.datas.nodePositions.delete(idToDelete);
                });

                // Filter edges again to remove those connected to the deleted disposal nodes
                const edgesBeforeDisposalRemoval = graph.edges.length;
                graph.edges = graph.edges.filter(edge => 
                    !disposalNodesToDelete.includes(edge.source) && !disposalNodesToDelete.includes(edge.target)
                );
                console.debug(`[services.NodeDeletionService.deleteNodeAndDependents] Removed ${edgesBeforeDisposalRemoval - graph.edges.length} disposal-related edges.`);
            }
        }

        // Step 2d: If the graph is now empty, perform a full reset.
        if (graph.nodes.size === 0) {
            console.log("[services.NodeDeletionService.deleteNodeAndDependents] Graph is now empty. Performing full reset.");
            resetGraph();
            window.elements.noRecipeMessage.style.display = 'block';
        } else {
            // Step 2e: Otherwise, re-render the modified graph to update the SVG.
            graph.render();
        }

        // Step 2f: Update total power consumption based on the remaining nodes.
        updateTotalPower();
        updateItemSelectorIcon();

    } else {
        // This is a fallback for cases where the graph instance doesn't exist.
        // It's less ideal as it loses state, but it's a safe fallback.
        console.warn("[services.NodeDeletionService.deleteNodeAndDependents] No graph instance found. Falling back to full reset.");
        resetApp();
    }
}