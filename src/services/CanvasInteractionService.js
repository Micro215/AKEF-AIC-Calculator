// =============================================================================
// MOUSE EVENT HANDLERS (For Desktop)
// =============================================================================

/**
 * Handles the mousedown event on the main graph canvas.
 * Initiates panning if the click is on an empty area.
 * @param {MouseEvent} e - The mouse event object.
 */
export function handleCanvasMouseDown(e) {
    const states = window.states;
    const elements = window.elements;

    // If the click is on a node, let the node's own listener handle it.
    if (e.target.closest('.node')) {
        // console.debug("[services.CanvasInteractionService.handleCanvasMouseDown] Clicked on a node, ignoring canvas pan.");
        return;
    }

    // Initiate canvas panning.
    // console.debug("[services.CanvasInteractionService.handleCanvasMouseDown] Starting canvas panning.");
    states.isPanningCanvas = true;
    // Record the starting mouse position relative to the current canvas transform.
    states.panStart.x = e.clientX - states.canvasTransform.x;
    states.panStart.y = e.clientY - states.canvasTransform.y;
    elements.graphContainer.style.cursor = 'grabbing';
}

/**
 * Handles the mousemove event for both node dragging and canvas panning.
 * @param {MouseEvent} e - The mouse event object.
 */
export function handleMouseMove(e) {
    const states = window.states;
    const datas = window.datas;

    // If a node is being dragged, update its position.
    if (datas.draggingNode) {
        // Calculate the change in mouse position, adjusted for the current zoom scale.
        const deltaX = (e.clientX - states.dragStart.mouseX) / states.canvasTransform.scale;
        const deltaY = (e.clientY - states.dragStart.mouseY) / states.canvasTransform.scale;

        // Update the node's coordinates.
        datas.draggingNode.x = states.dragStart.nodeX + deltaX;
        datas.draggingNode.y = states.dragStart.nodeY + deltaY;

        // Reset velocity to prevent physics simulation interference during a manual drag.
        datas.draggingNode.vx = 0;
        datas.draggingNode.vy = 0;

        // Re-render the node and the entire graph to show the changes in real-time.
        datas.draggingNode.render();
        if (datas.productionGraph) datas.productionGraph.render();

        // Update the global map of node positions to persist the new location.
        datas.nodePositions.set(datas.draggingNode.data.itemId, {
            x: datas.draggingNode.x,
            y: datas.draggingNode.y
        });
    }
    // If the canvas is being panned, update its translation.
    else if (states.isPanningCanvas) {
        // Update the canvas transform based on the new mouse position.
        states.canvasTransform.x = e.clientX - states.panStart.x;
        states.canvasTransform.y = e.clientY - states.panStart.y;
        // Re-render the graph to reflect the new view position.
        if (datas.productionGraph) datas.productionGraph.render();
    }
}

/**
 * Handles the mouseup event to stop any ongoing dragging or panning.
 */
export function handleMouseUp() {
    const states = window.states;
    const datas = window.datas;
    const elements = window.elements;

    // If a node was being dragged, finalize the action.
    if (datas.draggingNode) {
        // console.debug(`[services.CanvasInteractionService.handleMouseUp] Stopped dragging node: ${datas.draggingNode.data.itemId}`);
        datas.draggingNode.element.classList.remove('is-dragging');
        // Unpin the node so it can be affected by the physics simulation again.
        datas.draggingNode.isPinned = false;

        // Save the final position of the node.
        datas.nodePositions.set(datas.draggingNode.data.itemId, {
            x: datas.draggingNode.x,
            y: datas.draggingNode.y
        });

        datas.draggingNode = null;
    }
    // If the canvas was being panned, finalize the action.
    if (states.isPanningCanvas) {
        // console.debug("[services.CanvasInteractionService.handleMouseUp] Stopped canvas panning.");
        states.isPanningCanvas = false;
        elements.graphContainer.style.cursor = 'grab';
    }
}

/**
 * Handles the wheel event for zooming the canvas in and out.
 * @param {WheelEvent} e - The wheel event object.
 */
export function handleWheel(e) {
    const datas = window.datas;

    // Prevent zooming if the cursor is over an interactive UI element like a dropdown or modal.
    if (e.target.closest('.recipe-dropdown, .modal')) {
        // console.debug("[services.CanvasInteractionService.handleWheel] Wheel event over interactive element, ignoring zoom.");
        return;
    }

    e.preventDefault();
    if (!datas.productionGraph) return;

    // Determine the zoom direction (in or out).
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    // console.debug(`[services.CanvasInteractionService.handleWheel] Applying zoom with delta: ${delta}`);
    applyZoom(e.clientX, e.clientY, delta);
}


// =============================================================================
// TOUCH EVENT HANDLERS (For Mobile)
// =============================================================================

/**
 * Handles the touchstart event on the canvas.
 * Distinguishes between pinch-to-zoom, node dragging, and canvas panning.
 * @param {TouchEvent} e - The touch event object.
 */
export function handleTouchStart(e) {
    const states = window.states;
    const datas = window.datas;

    // Handle two-finger touch for pinch-to-zoom.
    if (e.touches.length === 2) {
        e.preventDefault();
        states.lastTouchDistance = getTouchDistance(e.touches);
        // console.debug("[services.CanvasInteractionService.handleTouchStart] Two-finger touch detected, preparing for zoom.");
        return;
    }

    // Ignore if more than two fingers or no fingers are touching.
    if (e.touches.length !== 1) {
        return;
    }

    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

    // Prevent interaction if the touch is on a specific UI element.
    if (targetElement && targetElement.closest('.recipe-selector, .node-delete-btn, .recipe-dropdown, .modal, .reset-positions-btn')) {
        // console.debug("[services.CanvasInteractionService.handleTouchStart] Touch on interactive UI element, ignoring.");
        return;
    }

    e.preventDefault();

    // Close any open dropdowns when touching the main canvas.
    window.functions.closeAllDropdowns();

    // Handle single-finger touch on a node for dragging.
    if (targetElement && targetElement.closest('.node')) {
        const nodeElement = targetElement.closest('.node');
        const nodeId = nodeElement.dataset.nodeId;
        const node = datas.productionGraph.nodes.get(nodeId);

        if (node) {
            // console.debug(`[services.CanvasInteractionService.handleTouchStart] Starting to drag node: ${nodeId}`);
            datas.draggingNode = node;
            // Record initial touch and node positions.
            states.dragStart.mouseX = touch.clientX;
            states.dragStart.mouseY = touch.clientY;
            states.dragStart.nodeX = node.x;
            states.dragStart.nodeY = node.y;
            node.element.classList.add('is-dragging');
            node.isPinned = true;
        }
    }
    // Handle single-finger touch on the canvas for panning.
    else {
        // console.debug("[services.CanvasInteractionService.handleTouchStart] Starting canvas panning with touch.");
        states.isPanningCanvas = true;
        states.panStart.x = touch.clientX - states.canvasTransform.x;
        states.panStart.y = touch.clientY - states.canvasTransform.y;
    }
}

/**
 * Handles the touchmove event, continuing the action from touchstart.
 * Manages pinch-to-zoom, node dragging, and canvas panning.
 * @param {TouchEvent} e - The touch event object.
 */
export function handleTouchMove(e) {
    const states = window.states;
    const datas = window.datas;

    e.preventDefault();

    // Handle two-finger touch for pinch-to-zoom.
    if (e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches);

        if (states.lastTouchDistance > 0) {
            // Calculate the scale factor based on the change in distance between fingers.
            const scale = currentDistance / states.lastTouchDistance;
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            if (datas.productionGraph) {
                applyZoom(centerX, centerY, scale);
            }
        }
        states.lastTouchDistance = currentDistance;
        return;
    }

    // Handle single-finger touch for dragging or panning.
    if (e.touches.length === 1) {
        const touch = e.touches[0];

        // If a node is being dragged, update its position.
        if (datas.draggingNode) {
            const deltaX = (touch.clientX - states.dragStart.mouseX) / states.canvasTransform.scale;
            const deltaY = (touch.clientY - states.dragStart.mouseY) / states.canvasTransform.scale;

            datas.draggingNode.x = states.dragStart.nodeX + deltaX;
            datas.draggingNode.y = states.dragStart.nodeY + deltaY;
            datas.draggingNode.vx = 0;
            datas.draggingNode.vy = 0;

            datas.draggingNode.render();
            if (datas.productionGraph) datas.productionGraph.render();

            // Update the global map of node positions in real-time.
            datas.nodePositions.set(datas.draggingNode.data.itemId, {
                x: datas.draggingNode.x,
                y: datas.draggingNode.y
            });
        }
        // If the canvas is being panned, update its translation.
        else if (states.isPanningCanvas) {
            states.canvasTransform.x = touch.clientX - states.panStart.x;
            states.canvasTransform.y = touch.clientY - states.panStart.y;
            if (datas.productionGraph) datas.productionGraph.render();
        }
    }
}

/**
 * Handles the touchend event to reset all interaction states.
 * @param {TouchEvent} e - The touch event object.
 */
export function handleTouchEnd(e) {
    const states = window.states;
    const datas = window.datas;

    // If a node was being dragged, finalize the action.
    if (datas.draggingNode) {
        // console.debug(`[services.CanvasInteractionService.handleTouchEnd] Stopped dragging node: ${datas.draggingNode.data.itemId}`);
        datas.draggingNode.element.classList.remove('is-dragging');
        datas.draggingNode.isPinned = false;

        // Save the final position of the node.
        // Note: This should be `datas.nodePositions`, not `states.nodePositions`. Correcting.
        datas.nodePositions.set(datas.draggingNode.data.itemId, {
            x: datas.draggingNode.x,
            y: datas.draggingNode.y
        });

        datas.draggingNode = null;
    }

    // If the canvas was being panned, finalize the action.
    if (states.isPanningCanvas) {
        // console.debug("[services.CanvasInteractionService.handleTouchEnd] Stopped canvas panning.");
        states.isPanningCanvas = false;
    }

    // Reset the touch distance when all fingers are lifted.
    if (e.touches.length === 0) {
        states.lastTouchDistance = 0;
    }
}


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculates the Euclidean distance between two touch points.
 * @param {TouchList} touches - The list of touches (should contain 2).
 * @returns {number} The distance between the first two touches.
 */
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Applies a zoom transformation to the canvas, centered on a specific point.
 * This function handles the complex logic of adjusting the canvas translation
 * to keep the zoom centered on the cursor or touch point.
 * @param {number} centerX - The X coordinate of the zoom center (relative to the viewport).
 * @param {number} centerY - The Y coordinate of the zoom center (relative to the viewport).
 * @param {number} scaleDelta - The scale factor to apply (e.g., 1.1 for zoom in, 0.9 for zoom out).
 */
function applyZoom(centerX, centerY, scaleDelta) {
    const states = window.states;
    const datas = window.datas;
    const elements = window.elements;
    if (!datas.productionGraph) return;

    // Calculate the new scale and clamp it to a minimum and maximum value.
    const newScale = states.canvasTransform.scale * scaleDelta;
    if (newScale < 0.2 || newScale > 3) {
        // console.debug(`[services.CanvasInteractionService.applyZoom] Zoom level out of bounds. New scale would be ${newScale}. Ignoring.`);
        return;
    }

    // Get the canvas container's bounding rectangle to calculate relative coordinates.
    const rect = elements.graphContainer.getBoundingClientRect();
    const x = centerX - rect.left;
    const y = centerY - rect.top;

    // Adjust the canvas translation (x, y) to keep the zoom centered on the cursor.
    // This is the core of the zoom logic: it moves the canvas so the point under the cursor
    // remains in the same place after the scale is applied.
    states.canvasTransform.x = x - (x - states.canvasTransform.x) * scaleDelta;
    states.canvasTransform.y = y - (y - states.canvasTransform.y) * scaleDelta;
    states.canvasTransform.scale = newScale;

    // console.debug(`[services.CanvasInteractionService.applyZoom] Applied zoom. New scale: ${newScale.toFixed(2)}, New transform: (${states.canvasTransform.x.toFixed(2)}, ${states.canvasTransform.y.toFixed(2)})`);

    // Re-render the graph to show the new zoom level and position.
    if (datas.productionGraph) datas.productionGraph.render();
}