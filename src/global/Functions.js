/**
 * A container class for globally accessible utility functions.
 * This class acts as a registry for functions that may be needed across different parts of the application.
 */
export class Functions {
    /**
     * Initializes the function registry.
     */
    constructor() {
        console.debug("[global.Functions] Initializing global function registry.");
        this.functions = {
            // Registers the 'closeAllDropdowns' function to be globally accessible.
            closeAllDropdowns: closeAllDropdowns
        };
    }

    /**
     * Retrieves the object containing all registered utility functions.
     * @returns {Object} An object where keys are function names and values are the functions themselves.
     */
    get() {
        console.debug("[global.Functions] get() called, returning function registry.");
        return this.functions;
    }
}

/**
 * Finds and removes all active recipe dropdown menus from the DOM.
 * This is a UI utility to clean up any open dropdowns.
 */
function closeAllDropdowns() {
    // Select all DOM elements that are currently active recipe dropdowns.
    const activeDropdowns = document.querySelectorAll('.recipe-dropdown.is-active');

    // Iterate over the found dropdowns and remove each one from the DOM.
    activeDropdowns.forEach(dropdown => {
        dropdown.remove();
    });

    // Log the action for debugging purposes.
    if (activeDropdowns.length > 0) {
        console.log(`[global.Functions.closeAllDropdowns]: Closed ${activeDropdowns.length} active dropdown(s).`);
    } else {
        console.debug("[global.Functions.closeAllDropdowns]: No active dropdowns found to close.");
    }
}