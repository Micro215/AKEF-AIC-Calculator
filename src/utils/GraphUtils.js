/**
 * Renders the production graph to the screen.
 * This function should be called after the ProductionGraph instance has been created and populated.
 * It applies a layout and renders the visual representation of the nodes and edges.
 */
export function renderGraph() {
    // Check if a production graph instance exists before proceeding.
    if (!window.datas.productionGraph) {
        console.warn("[utils.GraphUtils.renderGraph] Production graph instance not found. Cannot render.");
        return;
    }
    console.log("[utils.GraphUtils.renderGraph] Starting graph rendering process.");

    // This loop ensures that waste disposal nodes are correctly identified.
    // It iterates through the calculated needs map to find nodes with a special 'disposal_' prefix.
    window.datas.allNeedsMap.forEach((itemData, itemId) => {
        if (itemId.startsWith('disposal_')) {
            // Set a flag to easily identify this node type later.
            itemData.isWasteDisposal = true;
            // Store the original item ID by stripping the prefix, which is useful for lookups.
            itemData.originalItemId = itemId.replace('disposal_', '');
        }
    });

    // Apply the 'hierarchical' layout to arrange the nodes visually.
    window.datas.productionGraph.applyLayout('hierarchical');

    // Render the nodes and edges to the DOM.
    window.datas.productionGraph.render();

    console.debug("[utils.GraphUtils.renderGraph] Graph rendering complete.");
}

/**
 * Resets the visual graph and clears related data.
 * This function is called before a new graph is calculated or when the application is reset.
 */
export function resetGraph() {
    console.log("[utils.GraphUtils.resetGraph] Resetting the graph visualization and data.");

    // If a graph instance exists, stop its physics simulation to prevent resource usage.
    if (window.datas.productionGraph) {
        window.datas.productionGraph.stopSimulation();
    }

    // Clear all SVG content (edges) by setting its inner HTML to an empty string.
    window.elements.graphSvg.innerHTML = '';

    // Clear all DOM nodes by removing them from their container.
    // This while loop is more performant than setting innerHTML to '' for a large number of children.
    while (window.elements.nodesContainer.firstChild) {
        window.elements.nodesContainer.removeChild(window.elements.nodesContainer.firstChild);
    }

    // Invalidate the current graph instance.
    window.datas.productionGraph = null;

    // Reset the total power display to zero.
    window.elements.totalPowerEl.textContent = '0';

    console.debug("[utils.GraphUtils.resetGraph] Graph reset complete.");
}