import { CONSTANTS } from "../config/Constants.js"
import { StorageService } from "../services/StorageService.js";

import { calculateProduction } from "../services/ProductionCalculator.js";

import { resetApp } from "../utils/AppUtils.js";

/**
 * Manages the production chain tabs, including creation, deletion, switching,
 * state persistence, and drag-and-drop reordering.
 */
export class TabsManager {
    constructor() {
        // Array to hold all tab data objects.
        this.tabs = [];
        // Index of the currently active tab.
        this.activeTabIndex = 0;
        // DOM element for the list of tabs.
        this.tabsList = null;
        // DOM element for the "add new tab" button.
        this.addTabBtn = null;
        // Flag to prevent re-entrancy in asynchronous operations like saving.
        this.isSaving = false;
        // Flag to check if the manager has been fully initialized.
        this.initialized = false;
    }

    /**
     * Initialize the tabs manager after DOM is ready.
     * Sets up event listeners, loads saved tabs from storage, and creates an initial tab if needed.
     * @returns {boolean} - True if initialization was successful, false otherwise.
     */
    init() {
        console.debug("[managers.TabsManager] Initializing...");
        this.tabsList = document.getElementById('tabs-list');
        this.addTabBtn = document.getElementById('add-tab-btn');

        if (!this.tabsList || !this.addTabBtn) {
            console.error('[managers.TabsManager] Required DOM elements for tabs manager not found.');
            return false;
        }

        this.setupEventListeners();
        this.loadFromStorage();

        // Create initial tab if none exist
        if (this.tabs.length === 0) {
            console.log("[managers.TabsManager] No tabs found in storage. Creating a new one.");
            this.addTab();
        } else {
            this.renderTabs();
            setTimeout(() => {
                if (this.tabs.length > 0) {
                    this.switchToTab(this.activeTabIndex);
                }
            }, 100);
        }

        // Ensure the manager is properly assigned to window for global access
        window.tabsManager = this;
        this.initialized = true;
        console.log("[managers.TabsManager] Initialization complete.");
        return true;
    }

    /**
     * Setup event listeners for tab management.
     */
    setupEventListeners() {
        this.addTabBtn.addEventListener('click', () => this.addTab());
        console.debug("[managers.TabsManager] Event listener attached to 'add tab' button.");

        // Add drag and drop functionality to tabs
        this.setupTabDragging();
    }

    /**
     * Add a new tab to the interface.
     * @param {Object} [tabData=null] - Optional tab data to load into the new tab.
     * @returns {number} - The index of the newly created tab.
     */
    addTab(tabData = null) {
        if (this.isSaving) {
            console.warn("[managers.TabsManager] Attempted to add tab while saving. Operation aborted.");
            return; // Prevent re-entrancy
        }

        const tabIndex = this.tabs.length;
        console.log(`[managers.TabsManager] Adding new tab at index ${tabIndex}.`);

        // Create new tab with default or provided data
        const newTab = {
            id: Date.now().toString(),
            name: tabData ? tabData.name : window.localization.t("app.production"),
            targetItem: tabData ? tabData.targetItem : null,
            targetRate: tabData ? tabData.targetRate : 10,
            selectedRecipes: tabData ? new Map(Object.entries(tabData.selectedRecipes)) : new Map(),
            nodePositions: tabData ? new Map(Object.entries(tabData.nodePositions)) : new Map(),
            canvasTransform: tabData ? tabData.canvasTransform : { x: 0, y: 0, scale: 1 }
        };

        this.tabs.push(newTab);
        this.renderTabs();

        // Switch to the new tab after a short delay to allow rendering
        setTimeout(() => {
            this.switchToTab(tabIndex);
        }, 50);

        this.saveToStorage();
        return tabIndex;
    }

    /**
     * Remove a tab from the interface.
     * @param {number} tabIndex - The index of the tab to remove.
     */
    removeTab(tabIndex) {
        if (this.tabs.length <= 1) {
            console.warn("[managers.TabsManager] Cannot remove the last tab.");
            return;
        }
        if (this.isSaving) return;

        console.log(`[managers.TabsManager] Removing tab at index ${tabIndex}.`);
        // Save current tab data before removing
        this.saveCurrentTabData();

        // Remove the tab from the array
        this.tabs.splice(tabIndex, 1);

        // Adjust active tab index if it was affected by the removal
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
     * Switch to a specific tab, saving the current one's state and loading the new one's.
     * @param {number} tabIndex - The index of the tab to switch to.
     */
    switchToTab(tabIndex) {
        if (tabIndex < 0 || tabIndex >= this.tabs.length || this.isSaving) {
            console.warn(`[managers.TabsManager] Invalid tab index ${tabIndex} or operation in progress.`);
            return;
        }

        // Save current tab data before switching, if it's a different tab
        if (this.activeTabIndex !== undefined && this.activeTabIndex < this.tabs.length && this.activeTabIndex !== tabIndex) {
            this.saveCurrentTabData();
        }

        console.log(`[managers.TabsManager] Switching to tab at index ${tabIndex}.`);
        this.activeTabIndex = tabIndex;

        // Update UI to reflect the active tab
        document.querySelectorAll('.tab').forEach((tab, index) => {
            if (index === tabIndex) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Load the new tab's data
        this.loadTabData(tabIndex);

        // Trigger an event to update other parts of the UI (e.g., item selector icon)
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('tabLoaded', {
                detail: { tabIndex: tabIndex }
            }));
        }, 100);
    }

    /**
     * Save the current application state into the active tab object.
     */
    saveCurrentTabData() {
        if (this.isSaving) return; // Prevent re-entrancy

        const states = window.states;
        const datas = window.datas;
        const elements = window.elements;
        const currentTab = this.tabs[this.activeTabIndex];

        if (!currentTab) {
            console.error("[managers.TabsManager] No active tab to save data to.");
            return;
        }

        console.debug(`[managers.TabsManager] Saving data for tab at index ${this.activeTabIndex}.`);

        // Save basic tab data like target item and production rate
        currentTab.targetItem = datas.currentTargetItem;
        currentTab.targetRate = parseFloat(elements.amountInput.value) || 10;

        // Save the map of selected recipes for each item
        currentTab.selectedRecipes = new Map(datas.selectedRecipesMap);

        // Save the canvas transformation (zoom and pan)
        currentTab.canvasTransform = {
            x: states.canvasTransform.x,
            y: states.canvasTransform.y,
            scale: states.canvasTransform.scale
        };

        // Save the positions of all nodes in the production graph
        currentTab.nodePositions.clear();
        if (datas.productionGraph && datas.productionGraph.nodes) {
            datas.productionGraph.nodes.forEach((node, itemId) => {
                if (node && typeof node.x === 'number' && typeof node.y === 'number') {
                    currentTab.nodePositions.set(itemId, { x: node.x, y: node.y });
                }
            });
        }

        // Save to localStorage immediately to ensure persistence
        this.saveToStorage();
    }

    /**
     * Load a specific tab's data and restore the application state.
     * @param {number} tabIndex - The index of the tab to load.
     */
    loadTabData(tabIndex) {
        const states = window.states;
        const datas = window.datas;
        const elements = window.elements;
        const tab = this.tabs[tabIndex];

        if (!tab) {
            console.error(`[managers.TabsManager] No tab data found at index ${tabIndex}.`);
            return;
        }

        console.debug(`[managers.TabsManager] Loading data for tab at index ${tabIndex}.`);

        // Create copies of data to be restored BEFORE any reset operations
        const positionsToRestore = new Map(tab.nodePositions);
        const recipesToRestore = new Map(tab.selectedRecipes);

        // Reset the entire application to a clean state
        resetApp();

        // Restore canvas transform (zoom and pan) after reset
        if (tab.canvasTransform) {
            states.canvasTransform = {
                x: tab.canvasTransform.x,
                y: tab.canvasTransform.y,
                scale: tab.canvasTransform.scale
            };
        }

        // Load basic tab data
        if (tab.targetItem) {
            datas.currentTargetItem = tab.targetItem;
            elements.selectedItemName.textContent = window.localization.getItemName(tab.targetItem);
        }
        elements.amountInput.value = tab.targetRate;

        // Restore the map of selected recipes
        datas.selectedRecipesMap = recipesToRestore;

        // Apply default recipes for items that don't have a saved recipe in this tab
        if (window.defaultRecipeManager) {
            window.defaultRecipeManager.applyDefaultsToProduction();
        }

        // Update the item selector icon after loading the tab's target item
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('tabLoaded', {
                detail: { tabIndex: tabIndex }
            }));
        }, 100);

        // Recalculate the production graph if the tab has a target item
        if (tab.targetItem) {
            // Use a small delay to ensure the DOM is ready for rendering
            setTimeout(() => {
                calculateProduction(true, positionsToRestore);
            }, 50);
        }
    }

    /**
     * Rename a specific tab.
     * @param {number} tabIndex - The index of the tab to rename.
     * @param {string} newName - The new name for the tab.
     */
    renameTab(tabIndex, newName) {
        if (tabIndex < 0 || tabIndex >= this.tabs.length || this.isSaving) {
            return;
        }
        console.log(`[managers.TabsManager] Renaming tab at index ${tabIndex} to "${newName}".`);
        this.tabs[tabIndex].name = newName;
        this.saveToStorage();
    }

    /**
     * Sets up the UI for editing a tab's name.
     * @param {number} tabIndex - The index of the tab to edit.
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
     * Sets up drag-and-drop functionality for reordering tabs.
     */
    setupTabDragging() {
        let draggedTab = null;
        let draggedIndex = null;
    
        this.tabsList.addEventListener('dragstart', (e) => {
            const tabElement = e.target.closest('.tab');
            if (!tabElement) return;
    
            // Prevent dragging if the tab name is being edited
            const nameInputElement = tabElement.querySelector('.tab-name-input');
            if (nameInputElement && nameInputElement.style.display !== 'none') {
                e.preventDefault();
                return;
            }
    
            draggedTab = tabElement;
            draggedIndex = parseInt(draggedTab.getAttribute('data-tab-index'));
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', draggedTab.innerHTML);
        });
    
        this.tabsList.addEventListener('dragover', (e) => {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
    
            const afterElement = getDragAfterElement(this.tabsList, e.clientX);
            if (afterElement == null) {
                this.tabsList.appendChild(draggedTab);
            } else {
                this.tabsList.insertBefore(draggedTab, afterElement);
            }
    
            return false;
        });
    
        this.tabsList.addEventListener('drop', (e) => {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
    
            // Get all tab elements in their current order in the DOM
            const allTabs = [...this.tabsList.querySelectorAll('.tab')];
            const newIndex = allTabs.indexOf(draggedTab);
            
            // Only reorder if the position has actually changed
            if (newIndex !== draggedIndex) {
                // Reorder the tabs array based on the new position in the DOM
                const [removed] = this.tabs.splice(draggedIndex, 1);
                this.tabs.splice(newIndex, 0, removed);
    
                // Update the active tab index if it was affected by the reordering
                if (this.activeTabIndex === draggedIndex) {
                    this.activeTabIndex = newIndex;
                } else if (draggedIndex < this.activeTabIndex && newIndex >= this.activeTabIndex) {
                    this.activeTabIndex--;
                } else if (draggedIndex > this.activeTabIndex && newIndex <= this.activeTabIndex) {
                    this.activeTabIndex++;
                }
    
                // Re-render the tabs to update their indices and order
                this.renderTabs();
                this.saveToStorage();
                console.log(`[managers.TabsManager] Tab reordered from index ${draggedIndex} to ${newIndex}.`);
            }
    
            return false;
        });
    
        /**
         * Helper function to determine the position to insert a dragged element.
         * @param {HTMLElement} container - The container element.
         * @param {number} x - The mouse's x-coordinate.
         * @returns {HTMLElement|null} - The element after which the dragged element should be inserted.
         */
        function getDragAfterElement(container, x) {
            const draggableElements = [...container.querySelectorAll('.tab:not(.dragging)')];
    
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = x - box.left - box.width / 2;
    
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    /**
     * Renders all tabs in the UI based on the current `this.tabs` array.
     */
    renderTabs() {
        this.tabsList.innerHTML = '';
        console.debug("[managers.TabsManager] Rendering tabs in the UI.");

        this.tabs.forEach((tab, index) => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${index === this.activeTabIndex ? 'active' : ''}`;
            tabElement.setAttribute('data-tab-index', index);
            tabElement.draggable = true;

            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';

            // Span to display the tab name and icons
            const tabNameDisplay = document.createElement('span');
            tabNameDisplay.className = 'tab-name-display';
            tabNameDisplay.setAttribute('title', tab.name);

            // Add item icon if the tab has a target item
            if (tab.targetItem && window.datas && window.datas.itemsData) {
                const itemInfo = window.datas.itemsData[tab.targetItem.id];
                if (itemInfo && itemInfo.img) {
                    const itemIcon = document.createElement('img');
                    itemIcon.className = 'tab-item-icon';
                    itemIcon.src = `${window.projectBaseUrl}images/${itemInfo.img}`;
                    itemIcon.alt = window.localization.getItemName(itemInfo);
                    itemIcon.setAttribute('title', window.localization.getItemName(itemInfo));
                    tabNameDisplay.appendChild(itemIcon);

                    // Add recipe icon if a recipe is selected for the target item
                    if (tab.selectedRecipes && tab.selectedRecipes.has(tab.targetItem.id)) {
                        const recipeIndex = tab.selectedRecipes.get(tab.targetItem.id);
                        const recipes = this.findRecipesForItem(tab.targetItem.id);
                        if (recipes && recipes[recipeIndex]) {
                            const recipe = recipes[recipeIndex];
                            const building = window.datas.buildingsData[recipe.buildingId];
                            if (building && building.img) {
                                const recipeIcon = document.createElement('img');
                                recipeIcon.className = 'tab-recipe-icon';
                                recipeIcon.src = `${window.projectBaseUrl}images/${building.img}`;
                                recipeIcon.alt = window.localization.getItemName(building);
                                recipeIcon.setAttribute('title', window.localization.getItemName(building));
                                tabNameDisplay.appendChild(recipeIcon);
                            }
                        }
                    }
                }
            }

            // Input field for editing the tab name, initially hidden
            const tabNameInput = document.createElement('input');
            tabNameInput.type = 'text';
            tabNameInput.value = tab.name;
            tabNameInput.className = 'tab-name-input';
            tabNameInput.style.display = 'none';

            const nameText = document.createElement('span');
            nameText.className = 'tab-name-text';
            nameText.textContent = tab.name;
            tabNameDisplay.appendChild(nameText);

            // Functions to handle entering and exiting edit mode
            const enableEditing = () => {
                tabElement.draggable = false;
                tabNameDisplay.style.display = 'none';
                tabNameInput.style.display = 'block';
                tabNameInput.focus();
                tabNameInput.setSelectionRange(0, 0);
            };

            const saveAndExitEditing = () => {
                const newName = tabNameInput.value.trim();
                if (newName && newName !== tab.name) {
                    this.renameTab(index, newName);
                    tab.name = newName;
                }
                nameText.textContent = tab.name;
                tabNameDisplay.style.display = 'block';
                tabNameInput.style.display = 'none';
                tabElement.draggable = true;
            };

            // Event listeners for tab interaction
            let clickTimeout = null;
            tabElement.addEventListener('click', (e) => {
                const isEditing = tabNameInput.style.display !== 'none';
                const isControlClick = e.target.closest('.tab-close, .tab-edit-icon, .tab-name-input');
                if (isEditing || isControlClick) return;

                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    return;
                }
                clickTimeout = setTimeout(() => {
                    this.switchToTab(parseInt(tabElement.getAttribute('data-tab-index')));
                    clickTimeout = null;
                }, 250);
            });

            tabNameDisplay.addEventListener('dblclick', (e) => {
                e.preventDefault();
                enableEditing();
            });

            tabNameInput.addEventListener('blur', saveAndExitEditing);
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

            // Close button (only shown if there is more than one tab)
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

    /**
     * Helper function to find all recipes for a given item.
     * @param {string} itemId - The ID of the item.
     * @returns {Array|null} - An array of recipe objects or null if not found.
     */
    findRecipesForItem(itemId) {
        if (!window.datas || !window.datas.itemsData) return null;
        const itemData = window.datas.itemsData[itemId];
        if (!itemData || !itemData.recipes) return null;
        return itemData.recipes.map(recipeId => window.datas.itemsData.recipes[recipeId]).filter(r => r);
    }

    /**
     * Saves the tabs data and active tab index to localStorage.
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

        StorageService.set(CONSTANTS.STORAGE_KEYS.TABS, JSON.stringify(tabsData));
        StorageService.set(CONSTANTS.STORAGE_KEYS.ACTIVE_TAB, this.activeTabIndex.toString());
        console.debug("[managers.TabsManager] Saved tabs and active index to storage.");
    }

    /**
     * Loads tabs data and active tab index from localStorage.
     */
    loadFromStorage() {
        try {
            const savedTabs = StorageService.get(CONSTANTS.STORAGE_KEYS.TABS);
            const savedActiveTab = StorageService.get(CONSTANTS.STORAGE_KEYS.ACTIVE_TAB);

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
                console.log("[managers.TabsManager] Loaded tabs from storage.");
            } else {
                console.debug("[managers.TabsManager] No saved tabs found in storage.");
            }
        } catch (error) {
            console.error('[managers.TabsManager] Error loading tabs from storage:', error);
        }
    }
}