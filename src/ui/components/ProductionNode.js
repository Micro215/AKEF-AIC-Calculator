import { isMobileDevice, showDeleteConfirmation } from "../../utils/AppUtils.js";
import { calculateProduction } from "../../services/ProductionCalculator.js";
import { showMobileRecipeSelector } from "../views/RecipeSelector.js";

/**
 * Represents a single node in the production graph.
 * This class handles the creation, rendering, and user interactions for a node,
 * which can represent a raw material, a production building, or a waste disposal facility.
 */
export class ProductionNode {
    /**
     * Initializes a new ProductionNode instance.
     * @param {Object} data - The data object for the node, containing production details.
     * @param {HTMLElement} container - The DOM element that will contain this node.
     * @param {ProductionGraph} graph - The parent ProductionGraph instance this node belongs to.
     */
    constructor(data, container, graph) {
        this.data = data;
        this.container = container;
        this.graph = graph;
        this.element = null; // Will hold the DOM element for the node
        this.x = 0; // Node's X coordinate
        this.y = 0; // Node's Y coordinate
        this.vx = 0; // Node's velocity on the X-axis (for physics simulation)
        this.vy = 0; // Node's velocity on the Y-axis (for physics simulation)
        this.isPinned = false; // Flag to indicate if the node is being dragged (pinned in place)
        this.create();
    }

    /**
     * Creates the DOM element for the node and populates it with data.
     * This is a complex method that handles different node types (raw, target, waste).
     */
    create() {
        const isRaw = this.data.isRaw;
        const isTarget = this.data.isTarget;
        const isWasteDisposal = this.data.isWasteDisposal || false;
        console.debug(`[ui.components.ProductionNode.create] Creating node for item: ${this.data.itemId}, isRaw: ${isRaw}, isTarget: ${isTarget}, isWaste: ${isWasteDisposal}`);

        // Determine the item information, handling the special case for waste disposal nodes
        let itemInfo;
        if (isWasteDisposal) {
            itemInfo = window.datas.itemsData.items[this.data.originalItemId];
        } else {
            itemInfo = window.datas.itemsData.items[this.data.itemId];
        }

        /**
         * Helper function to generate HTML for an item flow (input/output).
         * @param {Object} item - The item data object.
         * @param {number} rate - The flow rate of the item.
         * @returns {string} The generated HTML string.
         */
        const createFlowItemHtml = (item, rate) => {
            const imgSrc = item.img ? `${window.projectBaseUrl}images/${item.img}` : `${window.projectBaseUrl}images/default-item.png`;
            let transportType = item.transport_type || 'belt';
            let transportCount = 0;
            let transportImgSrc = '';

            // Calculate transport requirements if data is available
            if (window.datas.transportData && window.datas.transportData[transportType]) {
                const transportSpeed = window.datas.transportData[transportType].speed;
                transportCount = rate / transportSpeed;
                const transportInfo = window.datas.transportData[transportType];
                if (transportInfo && transportInfo.img) {
                    transportImgSrc = `${window.projectBaseUrl}images/${transportInfo.img}`;
                }
            }

            return `
                <div class="flow-item">
                    <div class="flow-item-main">
                        <img src="${imgSrc}" alt="${window.localization.getItemName(item)}" class="flow-item-icon">
                        <span class="flow-item-rate">${rate.toFixed(1)}</span>
                    </div>
                    ${transportImgSrc ? `
                        <div class="flow-item-transport">
                            <img src="${transportImgSrc}" alt="transport" class="transport-icon">
                            <span class="flow-item-transport-rate">${transportCount.toFixed(1)}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        };

        // Create the main node element
        const nodeEl = document.createElement('div');
        nodeEl.className = `node ${isRaw ? 'is-raw' : ''} ${isTarget ? 'is-target' : ''} ${isWasteDisposal ? 'is-waste-disposal' : ''}`;
        nodeEl.setAttribute('data-node-id', this.data.itemId);
        nodeEl.style.left = `${this.x}px`;
        nodeEl.style.top = `${this.y}px`;

        // Check if the node has a recipe (i.e., is a production building)
        const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
        const recipe = hasRecipe ? this.data.allRecipes[this.data.selectedRecipeIndex] : null;
        const building = recipe ? window.datas.buildingsData.buildings[recipe.buildingId] : null;
        const localizedType = window.localization.getItemTypeName(itemInfo.type);

        let flowSummaryHtml = '';

        // --- Special Case: Waste Disposal Node ---
        if (isWasteDisposal) {
            const recipe = this.data.allRecipes[this.data.selectedRecipeIndex];
            const building = window.datas.buildingsData.buildings[recipe.buildingId];
            const wasteItemInfo = window.datas.itemsData.items[this.data.originalItemId];
            const inputElement = createFlowItemHtml(wasteItemInfo, this.data.rate);

            flowSummaryHtml = `
                <div class="node-flow-container node-flow-container-waste">
                    <div class="flow-inputs">${inputElement}</div>
                    <div class="flow-arrow">→</div>
                    <div class="flow-output">
                        <div class="flow-item">
                            <div class="flow-item-main">
                                <i class="fas fa-trash flow-item-icon"></i>
                                <span class="flow-item-rate">${window.localization.t('app.waste_disposal')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        // --- Standard Production Node ---
        else if (!isRaw && hasRecipe && recipe && recipe.ingredients) {
            const recipeTimeInMinutes = recipe.time / 60;
            const machinesNeeded = this.data.machineCount;

            // Generate HTML for all ingredients
            const ingredientElements = recipe.ingredients.map(ing => {
                const item = window.datas.itemsData.items[ing.item_id];
                const consumptionRate = (ing.amount / recipeTimeInMinutes) * machinesNeeded;
                return createFlowItemHtml(item, consumptionRate);
            }).join('');

            // Generate HTML for the primary product
            const productElement = createFlowItemHtml(itemInfo, this.data.rate);

            let wasteOutputsHtml = '';
            // Generate HTML for any waste byproducts
            if (recipe.products) {
                const primaryProduct = recipe.products.find(p => p.item_id === this.data.itemId) || recipe.products[0];
                const wasteElements = recipe.products
                    .filter(prod => prod.item_id !== this.data.itemId && window.wasteManager.isWasteItem(prod.item_id))
                    .map(wasteProd => {
                        const wasteRate = this.data.rate * (wasteProd.amount / primaryProduct.amount);
                        if (wasteRate > 1e-6) {
                            const wasteItemInfo = window.datas.itemsData.items[wasteProd.item_id];
                            return createFlowItemHtml(wasteItemInfo, wasteRate);
                        }
                        return '';
                    })
                    .filter(html => html !== '')
                    .join('');
                if (wasteElements) {
                    wasteOutputsHtml = `<div class="flow-output-waste">${wasteElements}</div>`;
                }
            }

            flowSummaryHtml = `
            <div class="node-flow-container">
                <div class="flow-inputs">${ingredientElements}</div>
                <div class="flow-arrow">→</div>
                <div class="flow-outputs-container">
                    <div class="flow-output">${productElement}</div>
                    ${wasteOutputsHtml}
                </div>
            </div>
            `;
        }
        // --- Raw Material Node ---
        else {
            const productElement = createFlowItemHtml(itemInfo, this.data.rate);
            flowSummaryHtml = `
                <div class="node-flow-container node-flow-container-raw">
                    <div class="flow-output">${productElement}</div>
                </div>
            `;
        }

        // Assemble the complete HTML for the node
        nodeEl.innerHTML = `
            <div class="node-header">
                <img src="${window.projectBaseUrl}images/${itemInfo.img}" class="node-icon" alt="${window.localization.getItemName(itemInfo)}">
                <div class="node-title-container">
                    <div class="node-title">${window.localization.getItemName(itemInfo)}</div>
                    <div class="node-type">${localizedType}</div>
                </div>
                ${!isWasteDisposal ? `
                    <button class="node-delete-btn" data-node-id="${this.data.itemId}" title="Delete node and all dependencies">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            </div>
            ${flowSummaryHtml}
            <div class="node-body">
            ${hasRecipe ? `
                <div class="node-machine">
                    <img src="${window.projectBaseUrl}images/${building.img}" class="machine-icon" alt="${window.localization.getBuildingName(building)}">
                    <div class="machine-info">
                        <div class="machine-name">${window.localization.getBuildingName(building)}</div>
                        <div class="machine-count">${this.data.machineCount.toFixed(2)}x</div>
                        ${window.elements.showPower.checked ? `<div class="machine-power"><i class="fas fa-bolt"></i> ${(Math.ceil(this.data.machineCount) * building.power).toFixed(0)}</div>` : ''}
                    </div>
                </div>
                ${this.data.allRecipes.length > 1 ? `
                    <div class="recipe-selector" data-node-id="${this.data.itemId}">
                        <span>${window.localization.t('buttons.recipe')}: ${this.data.selectedRecipeIndex + 1} / ${this.data.allRecipes.length}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                ` : ''}
            ` : ''}
    </div>
        `;

        this.element = nodeEl;
        this.container.appendChild(nodeEl);
        this.setupInteractions();
    }

    /**
     * Updates the power consumption display within the node based on the global 'showPower' setting.
     */
    updatePowerDisplay() {
        if (!this.element) return;
        const machineInfo = this.element.querySelector('.machine-info');
        if (!machineInfo) return;
        const powerDisplay = machineInfo.querySelector('.machine-power');

        if (window.elements.showPower.checked && !powerDisplay) {
            const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
            if (hasRecipe) {
                const recipe = this.data.allRecipes[this.data.selectedRecipeIndex];
                const building = window.datas.buildingsData.buildings[recipe.buildingId];
                const powerElement = document.createElement('div');
                powerElement.className = 'machine-power';
                powerElement.innerHTML = `<i class="fas fa-bolt"></i> ${(Math.ceil(this.data.machineCount) * building.power).toFixed(0)}`;
                machineInfo.appendChild(powerElement);
            }
        } else if (!window.elements.showPower.checked && powerDisplay) {
            powerDisplay.remove();
        }
        console.debug(`[ui.components.ProductionNode.updatePowerDisplay] Power display updated for node ${this.data.itemId}. Visible: ${window.elements.showPower.checked}`);
    }

    /**
     * Sets up all event listeners for user interactions with the node.
     */
    setupInteractions() {
        // --- Dragging functionality ---
        this.element.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            window.datas.draggingNode = this;
            window.states.dragStart.mouseX = e.clientX;
            window.states.dragStart.mouseY = e.clientY;
            window.states.dragStart.nodeX = this.x;
            window.states.dragStart.nodeY = this.y;
            this.element.classList.add('is-dragging');
            this.isPinned = true;
        });

        // --- Recipe selector functionality ---
        const selector = this.element.querySelector('.recipe-selector');
        if (selector) {
            selector.addEventListener('click', (e) => {
                e.stopPropagation();
                // Show a mobile-friendly view if on a mobile device
                if (isMobileDevice()) {
                    showMobileRecipeSelector(this.data.itemId);
                } else {
                    // Close any other open dropdowns before opening a new one
                    const activeDropdown = document.querySelector('.recipe-dropdown.is-active');
                    if (activeDropdown && activeDropdown.dataset.nodeId === this.data.itemId) {
                        activeDropdown.remove();
                        return;
                    }
                    this.showRecipeDropdown(e);
                }
            });
        }

        // --- Delete button functionality ---
        const deleteBtn = this.element.querySelector('.node-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Call a global utility function to show a confirmation dialog
                showDeleteConfirmation(this.data.itemId);
            });
        }
        console.debug(`[ui.components.ProductionNode.setupInteractions] Interactions set up for node ${this.data.itemId}`);
    }

    /**
     * Creates and displays the dropdown for selecting a different recipe.
     * @param {Event} e - The click event that triggered the dropdown.
     */
    showRecipeDropdown(e) {
        // Close any other open dropdowns to avoid UI clutter
        window.functions.closeAllDropdowns();

        const dropdown = document.createElement('div');
        dropdown.className = 'recipe-dropdown';
        dropdown.dataset.nodeId = this.data.itemId;

        // Populate the dropdown with all available recipes for this node's item
        this.data.allRecipes.forEach((recipe, index) => {
            const building = window.datas.buildingsData.buildings[recipe.buildingId];
            const option = document.createElement('div');
            option.className = 'recipe-option';

            // Check if this recipe is the user's default for this item
            const isDefault = window.defaultRecipeManager &&
                window.defaultRecipeManager.defaultRecipes.get(this.data.itemId) === index;

            option.innerHTML = `
                <div class="recipe-option-header">
                    <img src="${window.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                    <span>${window.localization.getBuildingName(building)}${isDefault ? ' (Default)' : ''}</span>
                </div>
                <div class="recipe-option-content">
                    ${this.renderIngredients(recipe.ingredients)}
                    <div class="recipe-arrow">→</div>
                    ${this.renderProducts(recipe.products)}
                </div>
            `;

            // Add a click listener to select the recipe
            option.addEventListener('click', () => {
                // Update the selected recipe in the global map
                window.datas.selectedRecipesMap.set(this.data.itemId, index);
                // Also update the recipe for the current tab if tabs are active
                if (window.tabs && window.tabs.activeTabIndex !== undefined) {
                    const currentTab = window.tabs.tabs[window.tabs.activeTabIndex];
                    if (currentTab) {
                        currentTab.selectedRecipes.set(this.data.itemId, index);
                        window.tabs.saveToStorage();
                    }
                }
                // Recalculate the entire production graph with the new recipe
                calculateProduction(true);
            });
            dropdown.appendChild(option);
        });

        // Add the dropdown to the graph container and position it
        window.elements.graphContainer.appendChild(dropdown);

        const rect = e.target.getBoundingClientRect();
        const containerRect = window.elements.graphContainer.getBoundingClientRect();

        dropdown.style.left = `${rect.left - containerRect.left}px`;
        dropdown.style.top = `${rect.bottom - containerRect.top}px`;
        dropdown.classList.add('is-active');

        // Set up a listener to close the dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 100);
        console.debug(`[ui.components.ProductionNode.showRecipeDropdown] Dropdown shown for node ${this.data.itemId}`);
    }

    /**
     * Helper function to generate HTML for a list of ingredients.
     * @param {Array} ingredients - Array of ingredient objects.
     * @returns {string} The generated HTML string.
     */
    renderIngredients(ingredients) {
        if (!ingredients || !Array.isArray(ingredients)) return '';
        return ingredients.map(ing => {
            const item = window.datas.itemsData.items[ing.item_id];
            const localizedType = window.localization.getItemTypeName(item.type);
            return `
                <div class="recipe-component">
                    <img src="${window.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${ing.amount}">
                    ${localizedType ? `<div class="component-category">${localizedType}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Helper function to generate HTML for a list of products.
     * @param {Array} products - Array of product objects.
     * @returns {string} The generated HTML string.
     */
    renderProducts(products) {
        if (!products || !Array.isArray(products)) return '';
        return products.map(prod => {
            const item = window.datas.itemsData.items[prod.item_id];
            const localizedType = window.localization.getItemTypeName(item.type);
            return `
                <div class="recipe-component">
                    <img src="${window.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${prod.amount}">
                    ${localizedType ? `<div class="component-category">${localizedType}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Renders the node at its current (x, y) coordinates.
     * This is called during dragging and physics simulation.
     */
    render() {
        if (!this.element) return;
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
}