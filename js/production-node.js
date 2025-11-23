/**
 * Class representing a production node
 */
class ProductionNode {
    /**
     * Create a new production node
     * @param {Object} data - Node data
     * @param {HTMLElement} container - Container element
     * @param {ProductionGraph} graph - Parent graph
     */
    constructor(data, container, graph) {
        const app = window.productionApp;

        this.data = data;
        this.container = container;
        this.graph = graph;
        this.element = null;
        this.x = 0;
        this.y = 0;
        this.vx = 0; // Velocity X
        this.vy = 0; // Velocity Y
        this.isPinned = false; // Is the node being dragged?
        this.create();
    }

    /**
     * Create the node element
     */
    create() {
        const app = window.productionApp;
        const isRaw = this.data.isRaw;
        const isTarget = this.data.isTarget;
        const isWasteDisposal = this.data.isWasteDisposal || false;

        let itemInfo;

        if (isWasteDisposal) {
            itemInfo = app.itemsData.items[this.data.originalItemId];
        } else {
            itemInfo = app.itemsData.items[this.data.itemId];
        }

        // Transport helper function
        const createFlowItemHtml = (item, rate) => {
            const imgSrc = item.img ? `${app.projectBaseUrl}images/${item.img}` : `${app.projectBaseUrl}images/default-item.png`;

            let transportType = item.transport_type || 'belt';
            let transportCount = 0;
            let transportImgSrc = '';

            if (app.transportData && app.transportData[transportType]) {
                const transportSpeed = app.transportData[transportType].speed;
                transportCount = rate / transportSpeed;
                const transportInfo = app.transportData[transportType];
                if (transportInfo && transportInfo.img) {
                    transportImgSrc = `${app.projectBaseUrl}images/${transportInfo.img}`;
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

        // Create node element
        const nodeEl = document.createElement('div');
        nodeEl.className = `node ${isRaw ? 'is-raw' : ''} ${isTarget ? 'is-target' : ''} ${isWasteDisposal ? 'is-waste-disposal' : ''}`;
        nodeEl.setAttribute('data-node-id', this.data.itemId);
        nodeEl.style.left = `${this.x}px`;
        nodeEl.style.top = `${this.y}px`;

        // Get recipe information
        const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
        const recipe = hasRecipe ? this.data.allRecipes[this.data.selectedRecipeIndex] : null;
        const building = recipe ? app.buildingsData.buildings[recipe.buildingId] : null;

        // Get localized item type for display
        const localizedType = window.localization.getItemTypeName(itemInfo.type);

        // Create the new vertical flow summary
        let flowSummaryHtml = '';

        if (isWasteDisposal) {
            // For waste disposal nodes, show the input waste item and the machine
            const recipe = this.data.allRecipes[this.data.selectedRecipeIndex];
            const building = app.buildingsData.buildings[recipe.buildingId];
            const wasteItemInfo = app.itemsData.items[this.data.originalItemId];

            const inputElement = createFlowItemHtml(wasteItemInfo, this.data.rate);

            flowSummaryHtml = `
                <div class="node-flow-container node-flow-container-waste">
                    <div class="flow-inputs">
                        ${inputElement}
                    </div>
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
        } else if (!isRaw && hasRecipe && recipe && recipe.ingredients) {
            const recipeTimeInMinutes = recipe.time / app.SECONDS_PER_MINUTE;
            const machinesNeeded = this.data.machineCount;

            // 1. Create ingredient items using the helper function
            const ingredientElements = recipe.ingredients.map(ing => {
                const item = app.itemsData.items[ing.item_id];
                const consumptionRate = (ing.amount / recipeTimeInMinutes) * machinesNeeded;
                return createFlowItemHtml(item, consumptionRate);
            }).join('');

            // 2. Create product item using the helper function
            const productElement = createFlowItemHtml(itemInfo, this.data.rate);

            // 3. Find and create waste byproducts
            let wasteOutputsHtml = '';
            if (recipe.products) {
                const primaryProduct = recipe.products.find(p => p.item_id === this.data.itemId) || recipe.products[0];

                const wasteElements = recipe.products
                    .filter(prod => prod.item_id !== this.data.itemId && window.wasteManager.isWasteItem(prod.item_id))
                    .map(wasteProd => {
                        // Calculate the rate of this specific waste byproduct
                        const wasteRate = this.data.rate * (wasteProd.amount / primaryProduct.amount);
                        if (wasteRate > 1e-6) { // Only show if there's a non-negligible rate
                            const wasteItemInfo = app.itemsData.items[wasteProd.item_id];
                            return createFlowItemHtml(wasteItemInfo, wasteRate);
                        }
                        return '';
                    })
                    .filter(html => html !== '') // Filter out empty strings
                    .join('');

                if (wasteElements) {
                    wasteOutputsHtml = `
                        <div class="flow-output-waste">
                            ${wasteElements}
                        </div>
                    `;
                }
            }

            // Assemble the full flow summary
            flowSummaryHtml = `
            <div class="node-flow-container">
                <div class="flow-inputs">
                    ${ingredientElements}
                </div>
                <div class="flow-arrow">→</div>
                <div class="flow-outputs-container">
                    <div class="flow-output">
                        ${productElement}
                    </div>
                    ${wasteOutputsHtml}
                </div>
            </div>
            `;
        } else {
            // For raw materials, or items without a valid recipe
            const productElement = createFlowItemHtml(itemInfo, this.data.rate);

            flowSummaryHtml = `
                <div class="node-flow-container node-flow-container-raw">
                    <div class="flow-output">
                        ${productElement}
                    </div>
                </div>
            `;
        }

        // Set node HTML
        nodeEl.innerHTML = `
            <div class="node-header">
                <img src="${window.productionApp.projectBaseUrl}images/${itemInfo.img}" class="node-icon" alt="${window.localization.getItemName(itemInfo)}">
                <div class="node-title-container">
                    <div class="node-title">${window.localization.getItemName(itemInfo)}</div>
                    ${`<div class="node-type">${localizedType}</div>`}
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
                    <img src="${window.productionApp.projectBaseUrl}images/${building.img}" class="machine-icon" alt="${window.localization.getBuildingName(building)}">
                    <div class="machine-info">
                        <div class="machine-name">${window.localization.getBuildingName(building)}</div>
                        <div class="machine-count">${this.data.machineCount.toFixed(2)}x</div>
                        ${app.showPower.checked ? `<div class="machine-power"><i class="fas fa-bolt"></i> ${(Math.ceil(this.data.machineCount) * building.power).toFixed(0)}</div>` : ''}
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
     * Update power display in the node
     */
    updatePowerDisplay() {
        const app = window.productionApp;
        if (!this.element) return;

        const machineInfo = this.element.querySelector('.machine-info');
        if (!machineInfo) return;

        // Check if power display already exists
        const powerDisplay = machineInfo.querySelector('.machine-power');

        if (app.showPower.checked && !powerDisplay) {
            // Add power display if it doesn't exist
            const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
            if (hasRecipe) {
                const recipe = this.data.allRecipes[this.data.selectedRecipeIndex];
                const building = app.buildingsData.buildings[recipe.buildingId];
                const powerElement = document.createElement('div');
                powerElement.className = 'machine-power';
                powerElement.innerHTML = `<i class="fas fa-bolt"></i> ${(Math.ceil(this.data.machineCount) * building.power).toFixed(0)}`;
                machineInfo.appendChild(powerElement);
            }
        } else if (!app.showPower.checked && powerDisplay) {
            // Remove power display if it exists
            powerDisplay.remove();
        }
    }

    /**
     * Set up node interactions
     */
    setupInteractions() {
        const app = window.productionApp;

        // Node dragging
        this.element.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            app.isDraggingNode = this;
            app.dragStart.mouseX = e.clientX;
            app.dragStart.mouseY = e.clientY;
            app.dragStart.nodeX = this.x;
            app.dragStart.nodeY = this.y;
            this.element.classList.add('is-dragging');
            this.isPinned = true; // Pin the node so it's not affected by forces
        });

        // Recipe selector
        const selector = this.element.querySelector('.recipe-selector');
        if (selector) {
            selector.addEventListener('click', (e) => {
                e.stopPropagation();

                if (isMobileDevice()) {
                    showMobileRecipeSelector(this.data.itemId);
                } else {
                    const activeDropdown = document.querySelector('.recipe-dropdown.is-active');
                    if (activeDropdown && activeDropdown.dataset.nodeId === this.data.itemId) {
                        activeDropdown.remove();
                        return;
                    }
                    this.showRecipeDropdown(e);
                }
            });
        }

        // Delete button
        const deleteBtn = this.element.querySelector('.node-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirmation(this.data.itemId);
            });
        }
    }

    /**
     * Show recipe dropdown
     * @param {Event} e - Click event
     */
    showRecipeDropdown(e) {
        const app = window.productionApp;

        // Remove any existing dropdowns
        document.querySelectorAll('.recipe-dropdown.is-active').forEach(d => d.remove());

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'recipe-dropdown';

        dropdown.dataset.nodeId = this.data.itemId;

        // Add recipe options
        this.data.allRecipes.forEach((recipe, index) => {
            const building = app.buildingsData.buildings[recipe.buildingId];

            const option = document.createElement('div');
            option.className = 'recipe-option';

            // Check if this recipe is the default for this item
            const isDefault = window.defaultRecipeManager &&
                window.defaultRecipeManager.defaultRecipes.get(this.data.itemId) === index;

            option.innerHTML = `
                <div class="recipe-option-header">
                    <img src="${window.productionApp.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                    <span>${window.localization.getBuildingName(building)}${isDefault ? ' (Default)' : ''}</span>
                </div>
                <div class="recipe-option-content">
                    ${this.renderIngredients(recipe.ingredients)}
                    <div class="recipe-arrow">→</div>
                    ${this.renderProducts(recipe.products)}
                </div>
            `;

            // Add click event to select recipe
            option.addEventListener('click', () => {
                // Update the selected recipe for this node in the app's state
                app.selectedRecipesMap.set(this.data.itemId, index);

                // Update the active tab's data immediately and synchronously
                if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
                    const currentTab = window.tabsManager.tabs[window.tabsManager.activeTabIndex];
                    if (currentTab) {
                        currentTab.selectedRecipes.set(this.data.itemId, index);
                        window.tabsManager.saveToStorage();
                    }
                }
                calculateProduction(true);
            });

            // add all
            dropdown.appendChild(option);
        });

        // Add dropdown to container
        app.graphContainer.appendChild(dropdown);

        // Position dropdown
        const rect = e.target.getBoundingClientRect();
        const containerRect = app.graphContainer.getBoundingClientRect();

        dropdown.style.left = `${rect.left - containerRect.left}px`;
        dropdown.style.top = `${rect.bottom - containerRect.top}px`;
        dropdown.classList.add('is-active');

        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 100);
    }

    /**
     * Render ingredients for recipe dropdown
     * @param {Array} ingredients - Array of ingredients
     * @returns {string} HTML string for ingredients
     */
    renderIngredients(ingredients) {
        if (!ingredients || !Array.isArray(ingredients)) return '';
        const app = window.productionApp;
        return ingredients.map(ing => {
            const item = app.itemsData.items[ing.item_id];
            const localizedType = window.localization.getItemTypeName(item.type);

            return `
                <div class="recipe-component">
                    <img src="${window.productionApp.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${ing.amount}">
                    ${localizedType ? `<div class="component-category">${localizedType}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Render products for recipe dropdown
     * @param {Array} products - Array of products
     * @returns {string} HTML string for products
     */
    renderProducts(products) {
        if (!products || !Array.isArray(products)) return '';
        const app = window.productionApp;
        return products.map(prod => {
            const item = app.itemsData.items[prod.item_id];
            const localizedType = window.localization.getItemTypeName(item.type);

            return `
                <div class="recipe-component">
                    <img src="${window.productionApp.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${prod.amount}">
                    ${localizedType ? `<div class="component-category">${localizedType}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Render the node at its current position
     */
    render() {
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
}