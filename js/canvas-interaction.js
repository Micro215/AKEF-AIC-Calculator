/**
 * Handle mouse down on canvas
 * @param {Event} e - Mouse event
 */
function handleCanvasMouseDown(e) {
    const app = window.productionApp;
    
    // Ignore if clicking on a node
    if (e.target.closest('.node')) {
        return;
    }

    // Start panning
    app.isPanningCanvas = true;
    app.panStart.x = e.clientX - app.canvasTransform.x;
    app.panStart.y = e.clientY - app.canvasTransform.y;
    app.graphContainer.style.cursor = 'grabbing';
}

/**
 * Handle mouse move
 * @param {Event} e - Mouse event
 */
function handleMouseMove(e) {
    const app = window.productionApp;
    
    // Handle node dragging
    if (app.isDraggingNode) {
        const deltaX = (e.clientX - app.dragStart.mouseX) / app.canvasTransform.scale;
        const deltaY = (e.clientY - app.dragStart.mouseY) / app.canvasTransform.scale;

        app.isDraggingNode.x = app.dragStart.nodeX + deltaX;
        app.isDraggingNode.y = app.dragStart.nodeY + deltaY;

        // Give the node velocity based on drag speed for a natural interaction
        app.isDraggingNode.vx = 0;
        app.isDraggingNode.vy = 0;

        app.isDraggingNode.render();
        if (app.productionGraph) app.productionGraph.render();
    }
    // Handle canvas panning
    else if (app.isPanningCanvas) {
        app.canvasTransform.x = e.clientX - app.panStart.x;
        app.canvasTransform.y = e.clientY - app.panStart.y;
        if (app.productionGraph) app.productionGraph.render();
    }
}

/**
 * Handle mouse up
 */
function handleMouseUp() {
    const app = window.productionApp;
    
    // Stop dragging node
    if (app.isDraggingNode) {
        app.isDraggingNode.element.classList.remove('is-dragging');
        app.isDraggingNode.isPinned = false; // Unpin the node so it's affected by forces again
        app.isDraggingNode = null;
    }
    // Stop panning canvas
    if (app.isPanningCanvas) {
        app.isPanningCanvas = false;
        app.graphContainer.style.cursor = 'grab';
    }
}

/**
 * Handle wheel event for zooming
 * @param {Event} e - Wheel event
 */
function handleWheel(e) {
    const app = window.productionApp;
    
    // Ignore if hovering over dropdown
    if (e.target.closest('.recipe-dropdown')) {
        return;
    }

    e.preventDefault();
    if (!app.productionGraph) return;

    // Calculate new scale
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = app.canvasTransform.scale * delta;
    if (newScale < 0.2 || newScale > 3) return;

    // Calculate new transform
    const rect = app.graphContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    app.canvasTransform.x = x - (x - app.canvasTransform.x) * delta;
    app.canvasTransform.y = y - (y - app.canvasTransform.y) * delta;
    app.canvasTransform.scale = newScale;

    // Re-render graph
    if (app.productionGraph) app.productionGraph.render();
}