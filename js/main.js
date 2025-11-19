document.addEventListener('DOMContentLoaded', async () => {
    function getProjectBaseUrl() {
        const pathSegments = window.location.pathname.split('/').filter(segment => segment);
        return pathSegments.length > 0 ? '/' + pathSegments[0] + '/' : '/';
    }

    const projectBaseUrl = getProjectBaseUrl();

    const app = {
        // --- CONFIGURATION ---
        projectBaseUrl: projectBaseUrl,

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
        controlPanel: document.querySelector('.control-panel'),
        nodesContainer: document.getElementById('nodes-container'),
        loadingMessage: document.getElementById('loading-message'),
        noRecipeMessage: document.getElementById('no-recipe-message'),
        totalPowerEl: document.getElementById('total-power'),
        languageSelect: document.getElementById('language-select'),

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
        dragStart: { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 },
        lastTouchDistance: 0,

        // --- HELPERS ---
        closeAllDropdowns: function () {
            document.querySelectorAll('.recipe-dropdown.is-active').forEach(dropdown => {
                dropdown.remove();
            });
        }
    };

    window.productionApp = app;

    // --- INITIALIZATION ---
    /**
     * Detect language from url
     * @returns {Promise<string>}
     */
    async function getInitialLanguageFromURL() {
        try {
            const response = await fetch(`${app.projectBaseUrl}db/languages.json`);
            const availableLanguages = await response.json();
            const languageCodes = Object.keys(availableLanguages);
    
            const pathSegments = window.location.pathname.split('/').filter(segment => segment);

            const languageIndex = pathSegments.findIndex(segment => languageCodes.includes(segment));
            
            if (languageIndex !== -1) {
                return pathSegments[languageIndex];
            }
        } catch (error) {
            console.error("Could not load languages.json for URL detection:", error);
        }
    
        return 'en';
    }


    /**
     * Initialize the application by loading data and setting up event listeners
     */
    async function initializeApp(language) {
        // Initialize localization first
        await window.localization.init(language);

        // Update UI with localized strings
        updateUIWithLocalization();

        // Setup language selector
        await setupLanguageSelector();

        // Disable controls during data load
        app.itemSelectorBtn.disabled = true;
        app.calculateBtn.disabled = true;
        app.selectedItemName.textContent = window.localization.t('app.loading');

        try {
            // Load both data files in parallel
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch(`${app.projectBaseUrl}db/items.json`),
                fetch(`${app.projectBaseUrl}db/buildings.json`)
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
            app.selectedItemName.textContent = window.localization.t('app.choose_recipe');

        } catch (error) {
            console.error("Initialization failed:", error);
            app.selectedItemName.textContent = window.localization.t('app.error');
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
        // Mouse Events
        app.graphContainer.addEventListener('mousedown', handleCanvasMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        app.graphContainer.addEventListener('wheel', handleWheel, { passive: false });

        // Touch Events
        app.graphContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        app.graphContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        app.graphContainer.addEventListener('touchend', handleTouchEnd);

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

        // Menu Toggle Control
        const menuToggleBtn = document.getElementById('menu-toggle-btn');
        const appOverlay = document.createElement('div');
        appOverlay.className = 'app-overlay';
        document.body.appendChild(appOverlay);

        menuToggleBtn.addEventListener('click', () => {
            app.controlPanel.classList.toggle('is-open');
            appOverlay.classList.toggle('is-active');
        });

        appOverlay.addEventListener('click', () => {
            app.controlPanel.classList.remove('is-open');
            appOverlay.classList.remove('is-active');
        });

        // Mobile Recipe Selector Modal
        const mobileRecipeModal = document.getElementById('recipe-selector-modal-mobile');
        const mobileRecipeModalCloseBtn = mobileRecipeModal.querySelector('.modal-close');

        mobileRecipeModalCloseBtn.addEventListener('click', hideMobileRecipeSelector);

        mobileRecipeModal.addEventListener('click', (e) => {
            if (e.target === mobileRecipeModal) {
                hideMobileRecipeSelector();
            }
        });

        // Language change event listener
        // window.addEventListener('languageChanged', () => {
        //     updateUIWithLocalization();
            
        //     // Update the selected item name with the new language
        //     if (app.currentTargetItem) {
        //         app.selectedItemName.textContent = window.localization.getItemName(app.currentTargetItem);
        //     } else {
        //         app.selectedItemName.textContent = window.localization.t('app.choose_recipe');
        //     }
            
        //     // Close any open recipe dropdowns
        //     document.querySelectorAll('.recipe-dropdown.is-active').forEach(dropdown => {
        //         dropdown.remove();
        //     });
            
        //     // Update recipe selector modal if it's open
        //     const recipeModal = document.getElementById('recipe-selector-modal');
        //     if (recipeModal && recipeModal.classList.contains('is-active')) {
        //         renderRecipeCategories();
        //     }
            
        //     // Update mobile recipe selector modal if it's open
        //     const mobileRecipeModal = document.getElementById('recipe-selector-modal-mobile');
        //     if (mobileRecipeModal && mobileRecipeModal.classList.contains('is-active')) {
        //         // Get the current node ID from the modal
        //         const currentNodeId = mobileRecipeModal.dataset.nodeId;
        //         if (currentNodeId) {
        //             showMobileRecipeSelector(currentNodeId);
        //         }
        //     }
            
        //     // Re-render the graph if it exists
        //     if (app.productionGraph) {
        //         app.productionGraph.stopSimulation();
        //         resetGraph();
        //         app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap);
        //         renderGraph();
        //         updateTotalPower();
        //     }
        // });
    }

    // --- START THE APP ---
    async function startApp() {
        const initialLanguage = await getInitialLanguageFromURL();
        await initializeApp(initialLanguage);
    }

    startApp();
});