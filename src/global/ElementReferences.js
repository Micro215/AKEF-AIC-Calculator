/**
 * Caches references to DOM elements for performance and easy access throughout the application.
 * This prevents repeated, expensive DOM queries.
 */
export class ElementReferences {
    /**
     * Initializes and populates the elements object with references to key UI components.
     */
    constructor() {
        console.debug("[global.ElementReferences] Initializing and caching DOM element references.");
        this.elements = {
            // Item selector and display elements
            itemSelectorBtn: document.getElementById('item-selector-btn'),
            selectedItemName: document.getElementById('selected-item-name'),

            // Recipe selection modal and its components
            recipeSelectorModal: document.getElementById('recipe-selector-modal'),
            recipeSearchInput: document.getElementById('recipe-search-input'),
            categoryTabs: document.querySelector('.category-tabs'),
            recipeGrid: document.getElementById('all-recipes'),

            // Main calculation controls
            amountInput: document.getElementById('amount-input'),
            calculateBtn: document.getElementById('calculate-btn'),
            resetBtn: document.getElementById('reset-btn'),

            // Help modal elements
            helpBtn: document.getElementById('help-btn'),
            helpModal: document.getElementById('help-modal'),
            modalClose: document.getElementById('help-modal').querySelector('.modal-close'),

            // Display settings toggles
            showRawMaterials: document.getElementById('show-raw-materials'),
            showPower: document.getElementById('show-power'),
            showAlternativeRecipes: document.getElementById('show-alternative-recipes'),
            physicsSimulation: document.getElementById('physics-simulation'),

            // Graph visualization elements
            graphContainer: document.getElementById('graph-container'),
            graphSvg: document.getElementById('graph-svg'),
            nodesContainer: document.getElementById('nodes-container'),

            // UI panels and messages
            controlPanel: document.querySelector('.control-panel'),
            loadingMessage: document.getElementById('loading-message'),
            noRecipeMessage: document.getElementById('no-recipe-message'),
            totalPowerEl: document.getElementById('total-power'),

            // Language selection
            languageSelector: document.getElementById('language-selector'),
        }
    }

    /**
     * Retrieves the object containing all cached DOM element references.
     * @returns {Object} An object with keys matching element IDs and values being the DOM elements.
     */
    get() {
        console.debug("[global.ElementReferences] get() called, returning cached elements.");
        return this.elements;  // window.elements
    }
}