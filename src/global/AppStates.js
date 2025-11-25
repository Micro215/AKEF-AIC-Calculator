/**
 * Manages the global UI state of the application, particularly for canvas interactions.
 * This includes panning, zooming, and dragging elements.
 */
export class AppState {
    /**
     * Initializes the AppState with default values for all state properties.
     */
    constructor() {
        console.debug("[global.AppState] Initializing application state.");
        this.states = {
            // Flag to indicate if the user is currently panning (dragging) the canvas view.
            isPanningCanvas: false,
            // Stores the starting coordinates (x, y) of a pan gesture on the canvas.
            panStart: { x: 0, y: 0 },
            // Stores the current transformation of the canvas: translation (x, y) and scale (zoom level).
            canvasTransform: { x: 0, y: 0, scale: 1 },
            // Stores the starting coordinates for a node drag event, including both mouse position and the node's initial position.
            dragStart: { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 },
            // Stores the distance between two touch points from the last event, used for pinch-to-zoom functionality.
            lastTouchDistance: 0,
        };
    }

    /**
     * Retrieves the entire state object.
     * @returns {Object} The current application state object.
     */
    get() {
        console.debug("[global.AppStates] get() called, returning current state.");
        return this.states;  // window.states
    }
}