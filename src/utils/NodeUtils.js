/**
 * Resets the positions of all nodes in the production graph to their default state.
 * This function re-applies the hierarchical layout and saves the new state to the current tab.
 */
export function resetNodePositions() {
    const datas = window.datas;

    // Validate that a production graph with nodes exists before proceeding.
    if (!datas.productionGraph || !datas.productionGraph.nodes) {
        console.debug('[utils.GraphUtils.resetNodePositions] No production graph or nodes found to reset. Aborting.');
        return;
    }

    console.log('[utils.GraphUtils.resetNodePositions] Resetting all node positions to origin.');

    // Iterate over each node and reset its position and velocity to zero.
    // This effectively moves all nodes to the top-left corner (0,0) and stops any movement.
    datas.productionGraph.nodes.forEach(node => {
        node.x = 0;
        node.y = 0;
        node.vx = 0; // Reset horizontal velocity
        node.vy = 0; // Reset vertical velocity
    });

    // Re-apply the default hierarchical layout to the graph.
    // This arranges the nodes based on their production levels.
    datas.productionGraph.applyLayout('hierarchical');

    // Save the new node positions to the current tab's data if the tab manager is available.
    // This ensures that the reset positions are persisted when the user switches tabs.
    if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
        console.debug('[utils.GraphUtils.resetNodePositions] Saving current tab state with new node positions.');
        window.tabsManager.saveCurrentTabData();
    }

    // Re-render the graph to visually update the node positions on the screen.
    datas.productionGraph.render();

    console.log('[utils.GraphUtils.resetNodePositions] Node positions have been reset and graph re-rendered.');
}