document.addEventListener('DOMContentLoaded', () => {
    const app = {
        // --- DOM ELEMENT REFERENCES ---
        itemSelectorBtn: document.getElementById('item-selector-btn'),
        selectedItemName: document.getElementById('selected-item-name'),
        recipeSelectorModal: document.getElementById('recipe-selector-modal'),
        recipeSearchInput: document.getElementById('recipe-search-input'),
        categoryTabs: document.querySelector('.category-tabs'),
        recipeGrid: document.getElementById('all-recipes'),
        amountInput: document.getElementById('amount-input'),
        calculateBtn: document.getElementById('calculate-btn'),
        resetBtn: document.getElementById('reset-btn'),
        helpBtn: document.getElementById('help-btn'),
        helpModal: document.getElementById('help-modal'),
        modalClose: document.getElementById('help-modal').querySelector('.modal-close'),
        showRawMaterials: document.getElementById('show-raw-materials'),
        showPower: document.getElementById('show-power'),
        graphContainer: document.getElementById('graph-container'),
        graphSvg: document.getElementById('graph-svg'),
        nodesContainer: document.getElementById('nodes-container'),
        loadingMessage: document.getElementById('loading-message'),
        noRecipeMessage: document.getElementById('no-recipe-message'),
        totalPowerEl: document.getElementById('total-power'),
        
        // --- GLOBAL STATE VARIABLES ---
        itemsData: {},
        buildingsData: {},
        productionGraph: null,
        selectedRecipesMap: new Map(),
        allNeedsMap: new Map(),
        currentTargetItem: null,
        isDraggingNode: null,
        isPanningCanvas: false,
        panStart: { x: 0, y: 0 },
        canvasTransform: { x: 0, y: 0, scale: 1 },
        SECONDS_PER_MINUTE: 60,
        currentCategory: 'all',
        allCategories: new Set(),
        nodePendingDeletion: null,
        nodePositions: new Map(),
        dragStart: { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 }
    };

    window.productionApp = app;

    // --- INITIALIZATION ---
    /**
     * Initialize the application by loading data and setting up event listeners
     */
    async function initializeApp() {
        // Disable controls during data load
        app.itemSelectorBtn.disabled = true;
        app.calculateBtn.disabled = true;
        app.selectedItemName.textContent = 'Loading data...';

        try {
            // Load both data files in parallel
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch('db/items.json'),
                fetch('db/buildings.json')
            ]);

            // Check if both requests were successful
            if (!itemsResponse.ok || !buildingsResponse.ok) {
                throw new Error('Failed to load data files.');
            }

            // Parse JSON data
            app.itemsData = await itemsResponse.json();
            app.buildingsData = await buildingsResponse.json();

            // Set up event listeners after data is loaded
            setupEventListeners();

            // Re-enable controls after successful load
            app.itemSelectorBtn.disabled = false;
            app.calculateBtn.disabled = false;
            app.selectedItemName.textContent = 'Choose a recipe...';

        } catch (error) {
            console.error("Initialization failed:", error);
            app.selectedItemName.textContent = 'Error: Could not load data';
            app.itemSelectorBtn.disabled = true; // Keep button disabled on error
        }
    }

    // --- EVENT LISTENERS SETUP ---
    /**
     * Set up all event listeners for the application
     */
    function setupEventListeners() {
        // Recipe selector modal
        app.itemSelectorBtn.addEventListener('click', () => {
            app.recipeSelectorModal.classList.add('is-active');
            if (!app.recipeGrid.innerHTML) {
                renderRecipeCategories();
            }
        });

        app.recipeSearchInput.addEventListener('input', handleRecipeSearch);

        const modalCloseBtn = app.recipeSelectorModal.querySelector('.modal-close');
        modalCloseBtn.addEventListener('click', () => {
            app.recipeSelectorModal.classList.remove('is-active');
        });

        // Main controls
        app.calculateBtn.addEventListener('click', calculateProduction);
        app.resetBtn.addEventListener('click', resetApp);
        app.helpBtn.addEventListener('click', () => app.helpModal.classList.add('is-active'));
        app.modalClose.addEventListener('click', () => app.helpModal.classList.remove('is-active'));

        // Display options
        app.showRawMaterials.addEventListener('change', () => {
            if (app.productionGraph) {
                app.productionGraph.stopSimulation();
                resetGraph();
                app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap);
                renderGraph();
                updateTotalPower();
            }
        });
        
        app.showPower.addEventListener('change', () => {
            if (app.productionGraph) {
                app.productionGraph.updatePowerDisplay();
                updateTotalPower();
            }
        });

        // Graph interaction
        app.graphContainer.addEventListener('mousedown', handleCanvasMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        app.graphContainer.addEventListener('wheel', handleWheel, { passive: false });

        // Delete confirmation modal
        const deleteModal = document.getElementById('delete-confirmation-modal');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const deleteModalCloseBtn = deleteModal.querySelector('.modal-close');

        confirmDeleteBtn.addEventListener('click', () => {
            if (app.nodePendingDeletion) {
                deleteNodeAndDependents(app.nodePendingDeletion);
            }
            hideDeleteConfirmation();
        });

        cancelDeleteBtn.addEventListener('click', hideDeleteConfirmation);
        deleteModalCloseBtn.addEventListener('click', hideDeleteConfirmation);

        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                hideDeleteConfirmation();
            }
        });
    }

    // --- START THE APP ---
    initializeApp();
});