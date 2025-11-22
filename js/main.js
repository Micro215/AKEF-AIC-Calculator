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
        physicsSimulation: document.getElementById('physics-simulation'),

        // --- GLOBAL STATE VARIABLES ---
        itemsData: {},
        buildingsData: {},
        transportData: {},
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
            // Load all three data files in parallel
            const [itemsResponse, buildingsResponse, transportResponse] = await Promise.all([
                fetch(`${app.projectBaseUrl}db/items.json`),
                fetch(`${app.projectBaseUrl}db/buildings.json`),
                fetch(`${app.projectBaseUrl}db/transport.json`)
            ]);

            // Check if all requests were successful
            if (!itemsResponse.ok || !buildingsResponse.ok || !transportResponse.ok) {
                throw new Error('Failed to load data files.');
            }

            // Parse JSON data
            app.itemsData = await itemsResponse.json();
            app.buildingsData = await buildingsResponse.json();
            app.transportData = await transportResponse.json();

            // Initialize managers in the correct order
            // 1. Initialize DefaultRecipeManager first
            const defaultRecipeManager = new window.DefaultRecipeManager();
            window.defaultRecipeManager = defaultRecipeManager;

            // 2. Initialize WasteManager
            const wasteManager = new window.WasteManager();
            await wasteManager.loadWasteItems();
            window.wasteManager = wasteManager;

            // 3. Initialize TabsManager BEFORE setting up event listeners
            const tabsManager = new window.TabsManager();
            tabsManager.init();
            window.tabsManager = tabsManager;

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

        app.itemSelectorBtn.addEventListener('click', () => {
            app.recipeSelectorModal.classList.add('is-active');
            if (!app.recipeGrid.innerHTML) {
                renderRecipeCategories();
            }
        });

        window.addEventListener('beforeunload', (e) => {
            // Check if we're in the middle of a reset
            if (window.isResetting) {
                return;
            }
            
            if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
                window.tabsManager.saveCurrentTabData();
            }
        });
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
        app.resetBtn.addEventListener('click', clearApp);
        app.helpBtn.addEventListener('click', () => app.helpModal.classList.add('is-active'));
        app.modalClose.addEventListener('click', () => app.helpModal.classList.remove('is-active'));

        // Display options
        app.showRawMaterials.addEventListener('change', () => {
            if (app.productionGraph) {
                if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
                    window.tabsManager.saveCurrentTabData();
                }
        
                app.productionGraph.stopSimulation();
                resetGraph();
                app.productionGraph = new ProductionGraph(app.graphSvg, app.nodesContainer, app.allNeedsMap);
        
                if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
                    const currentTab = window.tabsManager.tabs[window.tabsManager.activeTabIndex];
                    if (currentTab && currentTab.nodePositions.size > 0) {
                        app.nodePositions = new Map(currentTab.nodePositions);
                        const restored = restoreNodePositions();
                    }
                }
        
                renderGraph();
                updateTotalPower();
                
                // Start simulation only if the checkbox is checked
                if (app.physicsSimulation.checked) {
                    app.productionGraph.startSimulation();
                }
            }
        });

        app.showPower.addEventListener('change', () => {
            if (app.productionGraph) {
                app.productionGraph.updatePowerDisplay();
                updateTotalPower();

                if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
                    window.tabsManager.saveCurrentTabData();
                }
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

        // Default recipes button
        const defaultRecipesBtn = document.getElementById('akef-default-recipes-btn');
        if (defaultRecipesBtn) {
            defaultRecipesBtn.addEventListener('click', () => {
                window.defaultRecipeManager.showModal();
            });
        }

        // Update recipe icons
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (window.productionApp && window.productionApp.currentTargetItem) {
                    updateItemSelectorIcon();
                }
            }, 10);
        });

        document.addEventListener('tabLoaded', () => {
            updateItemSelectorIcon();
        });

        // Listen for production calculations to finish
        document.addEventListener('productionCalculated', () => {
            // After production is calculated, save the current state to the active tab
            if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
                window.tabsManager.saveCurrentTabData();
                window.tabsManager.renderTabs();
            }

            updateItemSelectorIcon();
        });

        // Physics simulation control
        app.physicsSimulation.addEventListener('change', () => {
            if (app.productionGraph) {
                if (app.physicsSimulation.checked) {
                    app.productionGraph.startSimulation();
                } else {
                    app.productionGraph.stopSimulation();
                }

                if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
                    window.tabsManager.saveCurrentTabData();
                }
            }
        });
    }

    // --- HELPERS ---
    /**
     * Updates the item selector icon with the current target item's icon
     */
    function updateItemSelectorIcon() {
        const app = window.productionApp;

        if (!app.currentTargetItem) {
            // Remove icons if no item is selected
            const iconElement = app.itemSelectorBtn.querySelector('.item-selector-icon');
            if (iconElement) iconElement.remove();

            const recipeIconElement = app.itemSelectorBtn.querySelector('.item-recipe-icon');
            if (recipeIconElement) recipeIconElement.remove();

            return;
        }

        // Skip if the current target item is a waste disposal node
        if (app.currentTargetItem.id && app.currentTargetItem.id.startsWith('disposal_')) {
            return;
        }

        // Get item information
        const itemInfo = app.itemsData.items[app.currentTargetItem.id];
        if (!itemInfo || !itemInfo.img) return;

        // Create or update item icon
        let iconElement = app.itemSelectorBtn.querySelector('.item-selector-icon');
        if (!iconElement) {
            iconElement = document.createElement('img');
            iconElement.className = 'item-selector-icon';

            // Insert icon before list icon
            const listIcon = app.itemSelectorBtn.querySelector('i.fas.fa-list');
            if (listIcon) {
                listIcon.parentNode.insertBefore(iconElement, listIcon);
            } else {
                app.itemSelectorBtn.prepend(iconElement);
            }
        }

        // Update item icon properties
        iconElement.src = `${app.projectBaseUrl}images/${itemInfo.img}`;
        iconElement.alt = window.localization.getItemName(itemInfo);
        iconElement.title = window.localization.getItemName(itemInfo);

        // Handle recipe icon
        updateRecipeIcon(app, iconElement);
    }

    // Helper function to update the recipe icon
    function updateRecipeIcon(app, itemIconElement) {
        let recipeIconElement = app.itemSelectorBtn.querySelector('.item-recipe-icon');

        // Check if we have a selected recipe for this item
        if (app.selectedRecipesMap && app.selectedRecipesMap.has(app.currentTargetItem.id)) {
            const recipeIndex = app.selectedRecipesMap.get(app.currentTargetItem.id);
            const recipes = findRecipesForItem(app.currentTargetItem.id);

            if (recipes && recipes[recipeIndex]) {
                const recipe = recipes[recipeIndex];
                const building = app.buildingsData.buildings[recipe.buildingId];

                if (building && building.img) {
                    if (!recipeIconElement) {
                        recipeIconElement = document.createElement('img');
                        recipeIconElement.className = 'item-recipe-icon';
                        recipeIconElement.style.marginLeft = '5px';
                        itemIconElement.parentNode.insertBefore(recipeIconElement, itemIconElement.nextSibling);
                    }

                    recipeIconElement.src = `${app.projectBaseUrl}images/${building.img}`;
                    recipeIconElement.alt = window.localization.getBuildingName(building);
                    recipeIconElement.title = window.localization.getBuildingName(building);
                    return; // Exit early if we've successfully updated the recipe icon
                }
            }
        }

        // Remove recipe icon if we don't have a valid recipe
        if (recipeIconElement) {
            recipeIconElement.remove();
        }
    }

    // --- START THE APP ---
    async function startApp() {
        const initialLanguage = await getInitialLanguageFromURL();
        await initializeApp(initialLanguage);
    }

    startApp();
});