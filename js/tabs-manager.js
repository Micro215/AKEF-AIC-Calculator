/**
 * Manage production chain tabs
 */
class TabsManager {
    constructor() {
        this.tabs = [];
        this.activeTabIndex = 0;
        this.tabsList = null;
        this.addTabBtn = null;
        this.isSaving = false; // Flag to prevent re-entrancy
        this.initialized = false;
    }

    /**
     * Initialize the tabs manager after DOM is ready
     */
    init() {
        this.tabsList = document.getElementById('tabs-list');
        this.addTabBtn = document.getElementById('add-tab-btn');

        if (!this.tabsList || !this.addTabBtn) {
            console.error('Required DOM elements for tabs manager not found');
            return false;
        }

        this.setupEventListeners();
        this.loadFromStorage();

        // Create initial tab if none exist
        if (this.tabs.length === 0) {
            this.addTab();
        } else {
            this.renderTabs();
            setTimeout(() => {
                if (this.tabs.length > 0) {
                    this.switchToTab(this.activeTabIndex);
                }
            }, 100);
        }

        // Ensure the manager is properly assigned to window
        window.tabsManager = this;
        this.initialized = true;

        return true;
    }

    /**
     * Setup event listeners for tab management
     */
    setupEventListeners() {
        this.addTabBtn.addEventListener('click', () => this.addTab());
    }

    /**
     * Add a new tab
     * @param {Object} tabData - Optional tab data to load
     * @returns {number} Index of the new tab
     */
    addTab(tabData = null) {
        if (this.isSaving) return; // Prevent re-entrancy

        const tabIndex = this.tabs.length;

        // Create new tab
        const newTab = {
            id: Date.now().toString(),
            name: tabData ? tabData.name : `Production ${tabIndex + 1}`,
            targetItem: tabData ? tabData.targetItem : null, // Ensure null for empty tabs
            targetRate: tabData ? tabData.targetRate : 10,
            selectedRecipes: tabData ? new Map(Object.entries(tabData.selectedRecipes)) : new Map(),
            nodePositions: tabData ? new Map(Object.entries(tabData.nodePositions)) : new Map(),
            canvasTransform: tabData ? tabData.canvasTransform : { x: 0, y: 0, scale: 1 }
        };

        this.tabs.push(newTab);
        this.renderTabs();

        // Switch to new tab
        setTimeout(() => {
            this.switchToTab(tabIndex);
        }, 50);

        this.saveToStorage();

        return tabIndex;
    }

    /**
     * Remove a tab
     * @param {number} tabIndex - Index of the tab to remove
     */
    removeTab(tabIndex) {
        if (this.tabs.length <= 1 || this.isSaving) {
            return;
        }

        // Save current tab data before removing
        this.saveCurrentTabData();

        // Remove the tab
        this.tabs.splice(tabIndex, 1);

        // Adjust active tab index if needed
        if (this.activeTabIndex >= this.tabs.length) {
            this.activeTabIndex = this.tabs.length - 1;
        } else if (this.activeTabIndex > tabIndex) {
            this.activeTabIndex--;
        }

        // Re-render tabs and switch to the correct active tab
        this.renderTabs();
        this.switchToTab(this.activeTabIndex);
        this.saveToStorage();
    }

    /**
     * Switch to a specific tab
     * @param {number} tabIndex - Index of the tab to switch to
     */
    switchToTab(tabIndex) {
        if (tabIndex < 0 || tabIndex >= this.tabs.length || this.isSaving) {
            return;
        }

        // Save current tab data before switching
        if (this.activeTabIndex !== undefined && this.activeTabIndex < this.tabs.length && this.activeTabIndex !== tabIndex) {
            this.saveCurrentTabData();
        }

        this.activeTabIndex = tabIndex;

        // Update UI
        document.querySelectorAll('.tab').forEach((tab, index) => {
            if (index === tabIndex) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Load tab data
        this.loadTabData(tabIndex);

        // Trigger event to update item selector icon
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('tabLoaded', {
                detail: { tabIndex: tabIndex }
            }));
        }, 100);
    }

    /**
     * Save the current tab's data
     */
    saveCurrentTabData() {
        if (this.isSaving) return; // Prevent re-entrancy

        const app = window.productionApp;
        const currentTab = this.tabs[this.activeTabIndex];

        if (!currentTab) return;

        // Save basic tab data
        currentTab.targetItem = app.currentTargetItem;
        currentTab.targetRate = parseFloat(app.amountInput.value) || 10;

        // Save selected recipes
        currentTab.selectedRecipes = new Map(app.selectedRecipesMap);

        // Save canvas transform (zoom and pan)
        currentTab.canvasTransform = {
            x: app.canvasTransform.x,
            y: app.canvasTransform.y,
            scale: app.canvasTransform.scale
        };

        currentTab.nodePositions.clear();

        // Check if a production graph exists and has nodes
        if (app.productionGraph && app.productionGraph.nodes) {
            app.productionGraph.nodes.forEach((node, itemId) => {
                if (node && typeof node.x === 'number' && typeof node.y === 'number') {
                    currentTab.nodePositions.set(itemId, {
                        x: node.x,
                        y: node.y
                    });
                }
            });
        }
        // Save to localStorage immediately
        this.saveToStorage();
    }

    /**
     * Load data for a specific tab
     * @param {number} tabIndex - Index of the tab to load
     */
    loadTabData(tabIndex) {
        const app = window.productionApp;
        const tab = this.tabs[tabIndex];

        if (!tab) return;

        // Create copies of data BEFORE any operations
        const positionsToRestore = new Map(tab.nodePositions);
        const recipesToRestore = new Map(tab.selectedRecipes);

        // Reset the app
        resetApp();

        // Restore canvas transform (zoom and pan) after reset
        if (tab.canvasTransform) {
            app.canvasTransform = {
                x: tab.canvasTransform.x,
                y: tab.canvasTransform.y,
                scale: tab.canvasTransform.scale
            };
        }

        // Load tab data
        if (tab.targetItem) {
            app.currentTargetItem = tab.targetItem;
            app.selectedItemName.textContent = window.localization.getItemName(tab.targetItem);
        }

        app.amountInput.value = tab.targetRate;

        // Load selected recipes
        app.selectedRecipesMap = recipesToRestore;

        // Apply default recipes only for items that don't have saved recipes
        if (window.defaultRecipeManager) {
            window.defaultRecipeManager.applyDefaultsToProduction();
        }

        // Update item selector icon after loading tab
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('tabLoaded', {
                detail: { tabIndex: tabIndex }
            }));
        }, 100);

        // Recalculate if there's a target item
        if (tab.targetItem) {
            // Use a small delay to ensure DOM is ready
            setTimeout(() => {
                calculateProduction(true, positionsToRestore);
            }, 50);
        }
    }

    /**
     * Rename a tab
     * @param {number} tabIndex - Index of the tab to rename
     * @param {string} newName - New name for the tab
     */
    renameTab(tabIndex, newName) {
        if (tabIndex < 0 || tabIndex >= this.tabs.length || this.isSaving) {
            return;
        }

        this.tabs[tabIndex].name = newName;
        this.saveToStorage();
    }

    /**
     * Start editing tab name
     * @param {number} tabIndex - Index of the tab to edit
     */
    startEditingTabName(tabIndex) {
        const tabElement = document.querySelector(`.tab[data-tab-index="${tabIndex}"]`);
        if (!tabElement) return;

        const tabNameElement = tabElement.querySelector('.tab-name');

        if (tabNameElement) {
            tabNameElement.focus();
            tabNameElement.select();
        }
    }

    /**
     * Render the tabs in the UI
     */
    renderTabs() {
        this.tabsList.innerHTML = '';

        this.tabs.forEach((tab, index) => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${index === this.activeTabIndex ? 'active' : ''}`;
            tabElement.setAttribute('data-tab-index', index);

            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';

            // Use span to display the tab name
            const tabNameDisplay = document.createElement('span');
            tabNameDisplay.className = 'tab-name-display';
            tabNameDisplay.setAttribute('title', tab.name); // Tooltip with full name

            // Add item icon if available
            if (tab.targetItem && window.productionApp && window.productionApp.itemsData) {
                const itemInfo = window.productionApp.itemsData.items[tab.targetItem.id];

                if (itemInfo && itemInfo.img) {
                    const itemIcon = document.createElement('img');
                    itemIcon.className = 'tab-item-icon';
                    itemIcon.src = `${window.productionApp.projectBaseUrl}images/${itemInfo.img}`;
                    itemIcon.alt = window.productionApp.localization ?
                        window.productionApp.localization.getItemName(itemInfo) : itemInfo.name;
                    itemIcon.setAttribute('title', window.productionApp.localization ?
                        window.productionApp.localization.getItemName(itemInfo) : itemInfo.name);
                    tabNameDisplay.appendChild(itemIcon);

                    // Add recipe icon if available
                    if (tab.selectedRecipes && tab.selectedRecipes.has(tab.targetItem.id)) {
                        const recipeIndex = tab.selectedRecipes.get(tab.targetItem.id);
                        const recipes = this.findRecipesForItem(tab.targetItem.id);

                        if (recipes && recipes[recipeIndex]) {
                            const recipe = recipes[recipeIndex];
                            const building = window.productionApp.buildingsData.buildings[recipe.buildingId];

                            if (building && building.img) {
                                const recipeIcon = document.createElement('img');
                                recipeIcon.className = 'tab-recipe-icon';
                                recipeIcon.src = `${window.productionApp.projectBaseUrl}images/${building.img}`;
                                recipeIcon.alt = window.productionApp.localization ?
                                    window.productionApp.localization.getBuildingName(building) : building.name;
                                recipeIcon.setAttribute('title', window.productionApp.localization ?
                                    window.productionApp.localization.getBuildingName(building) : building.name);
                                tabNameDisplay.appendChild(recipeIcon);
                            }
                        }
                    }
                }
            }

            // Create input for editing, but initially hidden
            const tabNameInput = document.createElement('input');
            tabNameInput.type = 'text';
            tabNameInput.value = tab.name;
            tabNameInput.className = 'tab-name-input';
            tabNameInput.style.display = 'none'; // Initially hidden

            // Add text for tab name
            const nameText = document.createElement('span');
            nameText.className = 'tab-name-text';
            nameText.textContent = tab.name;
            tabNameDisplay.appendChild(nameText);

            // Double-click or edit button to enable editing mode
            const enableEditing = () => {
                tabNameDisplay.style.display = 'none';
                tabNameInput.style.display = 'block';
                tabNameInput.focus();
                // Set cursor to beginning of text
                tabNameInput.setSelectionRange(0, 0);
            };

            // Function to save and return to display
            const saveAndExitEditing = () => {
                const newName = tabNameInput.value.trim();
                if (newName && newName !== tab.name) {
                    this.renameTab(index, newName);
                    tab.name = newName;
                }
                // Update text after saving
                nameText.textContent = tab.name;
                tabNameDisplay.style.display = 'block';
                tabNameInput.style.display = 'none';
            };

            // Event handlers for span
            let clickTimeout = null;

            tabElement.addEventListener('click', (e) => {
                const isEditing = tabNameInput.style.display !== 'none';
                const isControlClick = e.target.closest('.tab-close, .tab-edit-icon, .tab-name-input');

                if (isEditing || isControlClick) {
                    return;
                }

                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    return;
                }

                clickTimeout = setTimeout(() => {
                    this.switchToTab(parseInt(tabElement.getAttribute('data-tab-index')));
                    clickTimeout = null;
                }, 200);
            });

            tabNameDisplay.addEventListener('dblclick', (e) => {
                e.preventDefault();
                enableEditing();
            });

            // Event handlers for input
            tabNameInput.addEventListener('blur', () => {
                saveAndExitEditing();
            });

            tabNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAndExitEditing();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    tabNameInput.value = tab.name; // Restore original value
                    saveAndExitEditing();
                }
            });

            // Edit button
            const editIcon = document.createElement('button');
            editIcon.className = 'tab-edit-icon';
            editIcon.innerHTML = '<i class="fas fa-edit"></i>';
            editIcon.setAttribute('title', 'Rename tab');
            editIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                enableEditing();
            });

            tabContent.appendChild(tabNameDisplay);
            tabContent.appendChild(tabNameInput);
            tabContent.appendChild(editIcon);

            // Close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.setAttribute('title', 'Close tab');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tabIndex = parseInt(e.target.closest('.tab').getAttribute('data-tab-index'));
                this.removeTab(tabIndex);
            });

            tabElement.appendChild(tabContent);

            if (this.tabs.length > 1) {
                tabElement.appendChild(closeBtn);
            }

            this.tabsList.appendChild(tabElement);
        });
    }

    // Helper function to find recipes for an item
    findRecipesForItem(itemId) {
        if (!window.productionApp || !window.productionApp.itemsData) return null;

        const itemData = window.productionApp.itemsData.items[itemId];
        if (!itemData || !itemData.recipes) return null;

        return itemData.recipes.map(recipeId => window.productionApp.itemsData.recipes[recipeId]).filter(r => r);
    }

    /**
     * Save tabs data to localStorage
     */
    saveToStorage() {
        const tabsData = this.tabs.map(tab => ({
            id: tab.id,
            name: tab.name,
            targetItem: tab.targetItem,
            targetRate: tab.targetRate,
            selectedRecipes: Object.fromEntries(tab.selectedRecipes),
            nodePositions: Object.fromEntries(tab.nodePositions),
            canvasTransform: tab.canvasTransform || { x: 0, y: 0, scale: 1 }
        }));

        localStorage.setItem('akef-tabs', JSON.stringify(tabsData));
        localStorage.setItem('akef-active-tab', this.activeTabIndex.toString());
    }

    /**
     * Load tabs data from localStorage
     */
    loadFromStorage() {
        try {
            const savedTabs = localStorage.getItem('akef-tabs');
            const savedActiveTab = localStorage.getItem('akef-active-tab');

            if (savedTabs) {
                const tabsData = JSON.parse(savedTabs);
                this.tabs = tabsData.map(tab => ({
                    id: tab.id,
                    name: tab.name,
                    targetItem: tab.targetItem,
                    targetRate: tab.targetRate,
                    selectedRecipes: new Map(Object.entries(tab.selectedRecipes || {})),
                    nodePositions: new Map(Object.entries(tab.nodePositions || {})),
                    canvasTransform: tab.canvasTransform || { x: 0, y: 0, scale: 1 }
                }));

                if (savedActiveTab !== null) {
                    this.activeTabIndex = parseInt(savedActiveTab);
                }
            }
        } catch (error) {
            console.error('Error loading tabs:', error);
        }
    }
}

// Export the class
window.TabsManager = TabsManager;