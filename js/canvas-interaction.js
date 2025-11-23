// =============================================================================
// MOUSE EVENT HANDLERS (For Desktop)
// =============================================================================

/**
 * Handle mouse down on canvas.
 * @param {MouseEvent} e - The mouse event.
 */
function handleCanvasMouseDown(e) {
    const app = window.productionApp;

    // Ignore if clicking on a node, as it will be handled by the node's own listener
    if (e.target.closest('.node')) {
        return;
    }

    // Start panning the canvas
    app.isPanningCanvas = true;
    app.panStart.x = e.clientX - app.canvasTransform.x;
    app.panStart.y = e.clientY - app.canvasTransform.y;
    app.graphContainer.style.cursor = 'grabbing';
}

/**
 * Handle mouse move.
 * @param {MouseEvent} e - The mouse event.
 */
function handleMouseMove(e) {
    const app = window.productionApp;

    // Handle node dragging
    if (app.isDraggingNode) {
        const deltaX = (e.clientX - app.dragStart.mouseX) / app.canvasTransform.scale;
        const deltaY = (e.clientY - app.dragStart.mouseY) / app.canvasTransform.scale;

        app.isDraggingNode.x = app.dragStart.nodeX + deltaX;
        app.isDraggingNode.y = app.dragStart.nodeY + deltaY;

        // Reset velocity while dragging for a stable interaction
        app.isDraggingNode.vx = 0;
        app.isDraggingNode.vy = 0;

        app.isDraggingNode.render();
        if (app.productionGraph) app.productionGraph.render();

        // Update global node positions in real-time
        app.nodePositions.set(app.isDraggingNode.data.itemId, {
            x: app.isDraggingNode.x,
            y: app.isDraggingNode.y
        });
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

        // Save the position immediately
        app.nodePositions.set(app.isDraggingNode.data.itemId, {
            x: app.isDraggingNode.x,
            y: app.isDraggingNode.y
        });

        app.isDraggingNode = null;
    }
    // Stop panning canvas
    if (app.isPanningCanvas) {
        app.isPanningCanvas = false;
        app.graphContainer.style.cursor = 'grab';
    }
}

/**
 * Handle wheel event for zooming.
 * @param {WheelEvent} e - The wheel event.
 */
function handleWheel(e) {
    const app = window.productionApp;

    // Ignore if hovering over a dropdown or other interactive element
    if (e.target.closest('.recipe-dropdown, .modal')) {
        return;
    }

    e.preventDefault();
    if (!app.productionGraph) return;

    // Calculate new scale
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(e.clientX, e.clientY, delta);
}


// =============================================================================
// TOUCH EVENT HANDLERS (For Mobile)
// =============================================================================

/**
 * Handle touch start on canvas.
 * @param {TouchEvent} e - The touch event.
 */
function handleTouchStart(e) {
    const app = window.productionApp;

    if (e.touches.length === 2) {
        e.preventDefault();
        app.lastTouchDistance = getTouchDistance(e.touches);
        return;
    }

    if (e.touches.length !== 1) {
        return;
    }

    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

    if (targetElement && targetElement.closest('.recipe-selector, .node-delete-btn, .recipe-dropdown, .modal, .reset-positions-btn')) {
        return;
    }

    e.preventDefault();

    window.productionApp.closeAllDropdowns();

    if (targetElement && targetElement.closest('.node')) {
        const nodeElement = targetElement.closest('.node');
        const nodeId = nodeElement.dataset.nodeId;
        const node = app.productionGraph.nodes.get(nodeId);

        if (node) {
            app.isDraggingNode = node;
            app.dragStart.mouseX = touch.clientX;
            app.dragStart.mouseY = touch.clientY;
            app.dragStart.nodeX = node.x;
            app.dragStart.nodeY = node.y;
            node.element.classList.add('is-dragging');
            node.isPinned = true;
        }
    }

    else {
        app.isPanningCanvas = true;
        app.panStart.x = touch.clientX - app.canvasTransform.x;
        app.panStart.y = touch.clientY - app.canvasTransform.y;
    }
}

/**
 * Handle touch move.
 * Continues the action started in `handleTouchStart`.
 * @param {TouchEvent} e - The touch event.
 */
function handleTouchMove(e) {
    const app = window.productionApp;

    e.preventDefault();

    if (e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches);

        if (app.lastTouchDistance > 0) {
            const scale = currentDistance / app.lastTouchDistance;
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            if (app.productionGraph) {
                applyZoom(centerX, centerY, scale);
            }
        }
        app.lastTouchDistance = currentDistance;
        return;
    }

    if (e.touches.length === 1) {
        const touch = e.touches[0];

        if (app.isDraggingNode) {
            const deltaX = (touch.clientX - app.dragStart.mouseX) / app.canvasTransform.scale;
            const deltaY = (touch.clientY - app.dragStart.mouseY) / app.canvasTransform.scale;

            app.isDraggingNode.x = app.dragStart.nodeX + deltaX;
            app.isDraggingNode.y = app.dragStart.nodeY + deltaY;
            app.isDraggingNode.vx = 0;
            app.isDraggingNode.vy = 0;

            app.isDraggingNode.render();
            if (app.productionGraph) app.productionGraph.render();

            // Update global node positions in real-time
            app.nodePositions.set(app.isDraggingNode.data.itemId, {
                x: app.isDraggingNode.x,
                y: app.isDraggingNode.y
            });
        }
        else if (app.isPanningCanvas) {
            app.canvasTransform.x = touch.clientX - app.panStart.x;
            app.canvasTransform.y = touch.clientY - app.panStart.y;
            if (app.productionGraph) app.productionGraph.render();
        }
    }
}

/**
 * Handle touch end
 * Resets all interaction states
 * @param {TouchEvent} e - The touch event
 */
function handleTouchEnd(e) {
    const app = window.productionApp;

    if (app.isDraggingNode) {
        app.isDraggingNode.element.classList.remove('is-dragging');
        app.isDraggingNode.isPinned = false;

        // Save the position immediately
        app.nodePositions.set(app.isDraggingNode.data.itemId, {
            x: app.isDraggingNode.x,
            y: app.isDraggingNode.y
        });

        app.isDraggingNode = null;
    }

    if (app.isPanningCanvas) {
        app.isPanningCanvas = false;
    }

    if (e.touches.length === 0) {
        app.lastTouchDistance = 0;
    }
}


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculates the distance between two touch points.
 * @param {TouchList} touches - The list of touches (should contain 2).
 * @returns {number} The distance between the first two touches.
 */
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Applies zoom to the canvas, centered on a specific point.
 * @param {number} centerX - The X coordinate of the zoom center.
 * @param {number} centerY - The Y coordinate of the zoom center.
 * @param {number} scaleDelta - The scale factor.
 */
function applyZoom(centerX, centerY, scaleDelta) {
    const app = window.productionApp;
    if (!app.productionGraph) return;

    const newScale = app.canvasTransform.scale * scaleDelta;
    if (newScale < 0.2 || newScale > 3) return;

    const rect = app.graphContainer.getBoundingClientRect();
    const x = centerX - rect.left;
    const y = centerY - rect.top;

    app.canvasTransform.x = x - (x - app.canvasTransform.x) * scaleDelta;
    app.canvasTransform.y = y - (y - app.canvasTransform.y) * scaleDelta;
    app.canvasTransform.scale = newScale;

    if (app.productionGraph) app.productionGraph.render();
}