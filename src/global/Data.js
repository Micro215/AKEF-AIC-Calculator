/**
 * A centralized data container for the application.
 * This class holds both static game data (items, buildings) and dynamic state
 * related to the production graph simulation and UI.
 */
export class AppData {
    /**
     * Initializes the AppData with default structures for all application data.
     * This includes static data loaded from external sources and runtime state.
     */
    constructor() {
        console.debug("[global.AppData] Initializing application data container.");
        this.datas = {
            // Static data objects, likely populated from JSON files.
            // Contains information about all items in the game.
            itemsData: {},
            // Contains information about all buildings, their modes, and recipes.
            buildingsData: {},
            // Contains information about transport methods (e.g., conveyors, drones).
            transportData: {},

            // --- Runtime State for Production Graph ---

            // Reference to the node currently being dragged by the user.
            draggingNode: null,
            // The main instance of the production graph visualization and logic.
            productionGraph: null,
            // A map storing the selected recipe for each item ID.
            selectedRecipesMap: new Map(),
            // A map storing the calculated total needs for each item in the production chain.
            allNeedsMap: new Map(),
            // The ID of the current target item for which the production graph is generated.
            currentTargetItem: null,

            // --- UI State ---

            // The currently selected category for filtering items in the UI.
            currentCategory: 'all',
            // A set of all available item categories, dynamically populated.
            allCategories: new Set(),
            // Reference to a node that is marked for deletion in the UI.
            nodePendingDeletion: null,
            // A map to store the last known positions of nodes to persist layout.
            nodePositions: new Map(),
        };
    }

    /**
     * Retrieves the entire application data object.
     * @returns {Object} The object containing all application data.
     */
    get() {
        console.debug("[global.AppData] get() called, returning application data.");
        return this.datas;  // window.datas
    }
}