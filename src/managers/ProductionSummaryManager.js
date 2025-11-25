/**
 * Manages the production summary modal, which displays a detailed breakdown
 * of the entire production chain, including shared components and waste disposal.
 */
export class ProductionSummaryManager {
    constructor() {
        // Cache DOM elements for the modal and its content.
        this.modal = document.getElementById('production-summary-modal');
        this.container = document.getElementById('production-summary-container');
        this.openBtn = document.getElementById('production-summary-btn');
        this.closeBtn = this.modal.querySelector('.modal-close');
        this.setupEvents();
        console.debug("[managers.ProductionSummaryManager] Initialized.");
    }

    /**
     * Sets up event listeners for opening and closing the modal.
     */
    setupEvents() {
        this.openBtn.addEventListener('click', () => this.show());
        console.debug("[managers.ProductionSummaryManager] Event listener attached to open button.");
        this.closeBtn.addEventListener('click', () => this.hide());
        console.debug("[managers.ProductionSummaryManager] Event listener attached to close button.");
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
        console.debug("[managers.ProductionSummaryManager] Event listener attached to modal background for closing.");
    }

    /**
     * Displays the production summary modal.
     * Renders the content if production data is available.
     */
    show() {
        console.log("[managers.ProductionSummaryManager] Showing production summary.");
        // Check if there is any production data to display.
        if (!window.datas.allNeedsMap || window.datas.allNeedsMap.size === 0) {
            const message = window.localization.t('app.no_production_data');
            alert(message);
            console.warn("[managers.ProductionSummaryManager] No production data available to display. Alerting user.");
            return;
        }
        this.render();
        this.modal.classList.add('is-active');
    }

    /**
     * Hides the production summary modal.
     */
    hide() {
        console.debug("[managers.ProductionSummaryManager] Hiding production summary modal.");
        this.modal.classList.remove('is-active');
    }

    /**
     * Renders the content of the production summary.
     */
    render() {
        console.log("[managers.ProductionSummaryManager] Rendering production summary content.");
        this.container.innerHTML = '';
        // Analyze the production data to structure it for rendering.
        const analysis = this.analyzeProduction();
        console.debug("[managers.ProductionSummaryManager] Production analysis complete:", analysis);

        // Render the main production tree if it exists.
        if (analysis.mainTree) {
            this.container.appendChild(this.renderSection(
                window.localization.t('app.production_chain'),
                this.renderTree(analysis.mainTree)
            ));
        }

        // Render the section for shared components if any exist.
        if (analysis.sharedItems.length > 0) {
            this.container.appendChild(this.renderSharedItems(analysis.sharedItems));
        }

        // Render the section for waste items if any exist.
        if (analysis.wasteItems.length > 0) {
            this.container.appendChild(this.renderWasteSection(analysis.wasteItems));
        }
    }

    /**
     * Analyzes the production data to build a tree, find shared items, and identify waste.
     * @returns {Object} An object containing the main production tree, shared items, and waste items.
     */
    analyzeProduction() {
        // Create a map to track how many times each item is used as an ingredient across all recipes.
        const itemUsage = new Map();
        window.datas.allNeedsMap.forEach((data, id) => {
            itemUsage.set(id, { count: 0, data });
        });
        console.debug("[managers.ProductionSummaryManager.analyzeProduction] Initialized itemUsage map.", itemUsage);

        // Iterate through all selected recipes to count ingredient usage.
        window.datas.allNeedsMap.forEach((data, id) => {
            if (data.allRecipes?.length > 0) {
                const recipe = data.allRecipes[data.selectedRecipeIndex];
                if (recipe?.ingredients) {
                    recipe.ingredients.forEach(ing => {
                        const usage = itemUsage.get(ing.item_id);
                        if (usage) usage.count++;
                    });
                }
            }
        });
        console.debug("[managers.ProductionSummaryManager.analyzeProduction] Updated itemUsage counts.", itemUsage);

        const targetId = window.datas.currentTargetItem?.id;
        // Build the main production tree starting from the target item.
        const mainTree = targetId ? this.buildTree(targetId, new Set()) : null;
        console.debug("[managers.ProductionSummaryManager.analyzeProduction] Built main production tree.", mainTree);

        // Identify items that are used as ingredients in more than one recipe (shared components).
        const sharedItems = [];
        itemUsage.forEach((usage, id) => {
            if (usage.count > 1 && id !== targetId) {
                const item = window.datas.itemsData.items[id];
                if (item) {
                    sharedItems.push({
                        id,
                        name: window.localization.getItemName(item),
                        icon: item.img,
                        count: usage.count
                    });
                }
            }
        });
        console.debug("[managers.ProductionSummaryManager.analyzeProduction] Identified shared items.", sharedItems);

        // Collect all items that are managed by waste disposal recipes.
        const wasteItems = [];
        window.datas.allNeedsMap.forEach((data, id) => {
            if (data.isWasteDisposal) {
                wasteItems.push(data);
            }
        });
        console.debug("[managers.ProductionSummaryManager.analyzeProduction] Identified waste items.", wasteItems);

        return { mainTree, sharedItems, wasteItems };
    }

    /**
     * Recursively builds a tree structure representing the production chain for a given item.
     * @param {string} itemId - The ID of the item to build the tree for.
     * @param {Set} visited - A set of visited item IDs to prevent infinite loops.
     * @returns {Object|null} A tree node object or null if the item is not found or already visited.
     */
    buildTree(itemId, visited) {
        console.debug(`[managers.ProductionSummaryManager.buildTree] Building tree for item: ${itemId}`);
        // Prevent infinite loops by checking if the item has already been visited in the current path.
        if (visited.has(itemId)) {
            console.warn(`[managers.ProductionSummaryManager.buildTree] Circular dependency detected for item: ${itemId}. Skipping.`);
            return null;
        }
        visited.add(itemId);

        // Retrieve the production data for the current item ID.
        const data = window.datas.allNeedsMap.get(itemId);
        if (!data) return null;

        const item = window.datas.itemsData.items[itemId];
        if (!item) return null;

        // Create a node object representing the current item in the production chain.
        const node = {
            id: itemId,
            name: window.localization.getItemName(item),
            icon: item.img,
            rate: data.rate,
            isRaw: data.isRaw,
            isWaste: data.isWasteDisposal,
            children: []
        };

        // If the item is not a raw material, it has a recipe. Process the recipe details.
        if (!data.isRaw && data.allRecipes?.length > 0) {
            const recipe = data.allRecipes[data.selectedRecipeIndex];
            const building = window.datas.buildingsData.buildings[recipe.buildingId];

            if (building) {
                const machineCount = data.machineCount;
                const recipeTimeInMinutes = recipe.time / 60;
                node.recipe = {
                    building: {
                        name: window.localization.getBuildingName(building),
                        icon: building.img,
                        count: machineCount
                    },
                    ingredients: recipe.ingredients.map(ing => ({
                        id: ing.item_id,
                        amount: ing.amount,
                        rate: (ing.amount / recipeTimeInMinutes) * machineCount
                    })),
                    products: recipe.products.map(prod => ({
                        id: prod.item_id,
                        amount: prod.amount,
                        rate: (prod.amount / recipeTimeInMinutes) * machineCount
                    }))
                };

                // Recursively call buildTree for each ingredient to build the child nodes.
                recipe.ingredients.forEach(ing => {
                    const child = this.buildTree(ing.item_id, new Set(visited));
                    if (child) {
                        child.rate = (ing.amount / recipeTimeInMinutes) * machineCount;
                        node.children.push(child);
                    }
                });
            }
        }

        return node;
    }

    /**
     * Creates a section element with a header and content.
     * @param {string} title - The title for the section header.
     * @param {HTMLElement} content - The content element to append.
     * @returns {HTMLElement} The created section element.
     */
    renderSection(title, content) {
        const section = document.createElement('div');
        section.className = 'summary-section';
        const header = document.createElement('h3');
        header.className = 'summary-section-header';
        header.textContent = title;
        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    /**
     * Renders the entire production tree starting from the root node.
     * @param {Object} node - The root node of the tree.
     * @returns {HTMLElement} The rendered tree element.
     */
    renderTree(node) {
        const tree = document.createElement('div');
        tree.className = 'summary-tree';
        this.renderTreeNode(tree, node, 0, true);
        return tree;
    }

    /**
     * Renders a single node and its children in the production tree.
     * @param {HTMLElement} container - The container element to append the node to.
     * @param {Object} node - The node object to render.
     * @param {number} level - The current depth level in the tree (for indentation).
     * @param {boolean} isLast - Whether this node is the last child of its parent.
     */
    renderTreeNode(container, node, level, isLast = false) {
        console.debug(`[managers.ProductionSummaryManager.renderTreeNode] Rendering node: ${node.name} at level ${level}`);
        // Create the main visual line for the tree node.
        const line = document.createElement('div');
        line.className = `tree-line level-${level}`;
        const content = document.createElement('span');
        content.className = 'tree-content';

        let childrenContainer = null;
        // Add a toggle button if the node has children.
        if (node.children?.length > 0) {
            const toggle = document.createElement('span');
            toggle.className = 'tree-toggle expanded';
            toggle.addEventListener('click', () => this.toggleNode(toggle, childrenContainer));
            content.appendChild(toggle);
        }

        // Render the item's icon, name, and production rate.
        const icon = document.createElement('img');
        icon.src = `${window.projectBaseUrl}images/${node.icon}`;
        icon.className = 'tree-icon';
        icon.alt = node.name;
        content.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.name;
        content.appendChild(name);

        const rate = document.createElement('span');
        rate.className = 'tree-rate';
        rate.textContent = `${node.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`;
        content.appendChild(rate);

        // Calculate and render the required transport method (e.g., conveyor belt).
        const transport = this.getTransport(node.id, node.rate);
        if (transport) content.appendChild(transport);

        // Render the machine(s) and recipe details for non-raw items.
        if (node.recipe?.building) {
            const machine = document.createElement('span');
            machine.className = 'tree-machine';
            const machineIcon = document.createElement('img');
            machineIcon.src = `${window.projectBaseUrl}images/${node.recipe.building.icon}`;
            machineIcon.className = 'tree-machine-icon';
            machineIcon.alt = node.recipe.building.name;
            machine.appendChild(machineIcon);
            const actualMachines = this.calculateMachineCount(node);
            machine.appendChild(document.createTextNode(`${actualMachines.toFixed(2)}x ${node.recipe.building.name}`));
            content.appendChild(machine);
        }

        if (node.recipe && !node.isRaw) {
            const craftInline = this.renderCraftingInline(node.recipe);
            content.appendChild(craftInline);
        }

        line.appendChild(content);
        container.appendChild(line);

        // Recursively render all child nodes.
        if (node.children?.length > 0) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            node.children.forEach((child, index) => {
                this.renderTreeNode(childrenContainer, child, level + 1, index === node.children.length - 1);
            });
            container.appendChild(childrenContainer);
        }
    }

    /**
     * Calculates the number of machines required for a given node.
     * @param {Object} node - The node object.
     * @returns {number} The calculated machine count.
     */
    calculateMachineCount(node) {
        const data = window.datas.allNeedsMap.get(node.id);
        if (!data) return 0;
        if (!data.isRaw && data.allRecipes?.length > 0) {
            const count = data.machineCount;
            console.debug(`[managers.ProductionSummaryManager.calculateMachineCount] For item ${node.id}, machine count is ${count}`);
            return count;
        }
        return 0;
    }

    /**
     * Renders an inline representation of a recipe (ingredients -> products).
     * @param {Object} recipe - The recipe object to render.
     * @returns {HTMLElement} The rendered recipe element.
     */
    renderCraftingInline(recipe) {
        const craftInline = document.createElement('div');
        craftInline.className = 'tree-craft-inline';
        const flow = document.createElement('div');
        flow.className = 'tree-craft-flow';

        recipe.ingredients.forEach(ing => {
            const item = document.createElement('span');
            item.className = 'tree-craft-item';
            const icon = document.createElement('img');
            icon.src = `${window.projectBaseUrl}images/${window.datas.itemsData.items[ing.id].img}`;
            icon.className = 'tree-craft-icon';
            item.appendChild(icon);
            item.appendChild(document.createTextNode(`${ing.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`));
            flow.appendChild(item);
        });

        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.textContent = '→';
        flow.appendChild(arrow);

        recipe.products.forEach(prod => {
            const item = document.createElement('span');
            item.className = 'tree-craft-item';
            const icon = document.createElement('img');
            icon.src = `${window.projectBaseUrl}images/${window.datas.itemsData.items[prod.id].img}`;
            icon.className = 'tree-craft-icon';
            item.appendChild(icon);
            item.appendChild(document.createTextNode(`${prod.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`));
            flow.appendChild(item);
        });

        craftInline.appendChild(flow);
        return craftInline;
    }

    /**
     * Renders the section for items that are shared between multiple production lines.
     * @param {Array} items - An array of shared item objects.
     * @returns {HTMLElement} The rendered shared items section.
     */
    renderSharedItems(items) {
        const section = document.createElement('div');
        section.className = 'shared-items';
        const header = document.createElement('div');
        header.className = 'shared-items-header';
        header.textContent = window.localization.t('app.shared_items_needed');
        section.appendChild(header);

        items.forEach(item => {
            const elem = document.createElement('span');
            elem.className = 'shared-item';
            const icon = document.createElement('img');
            icon.src = `${window.projectBaseUrl}images/${item.icon}`;
            icon.className = 'shared-icon';
            elem.appendChild(icon);
            const countText = `${item.name} (${item.count}x)`;
            elem.appendChild(document.createTextNode(countText));
            section.appendChild(elem);
        });

        return section;
    }

    /**
     * Renders the section for items that are being disposed of as waste.
     * @param {Array} items - An array of waste item data objects.
     * @returns {HTMLElement} The rendered waste section.
     */
    renderWasteSection(items) {
        const section = document.createElement('div');
        section.className = 'waste-section';
        const header = document.createElement('div');
        header.className = 'waste-header';
        header.textContent = window.localization.t('app.waste_disposal');
        section.appendChild(header);

        items.forEach(item => {
            const wasteItem = document.createElement('div');
            wasteItem.className = 'waste-item';
            const content = document.createElement('span');
            content.className = 'tree-content';

            const icon = document.createElement('img');
            icon.src = `${window.projectBaseUrl}images/${window.datas.itemsData.items[item.originalItemId].img}`;
            icon.className = 'tree-icon';
            icon.alt = window.localization.getItemName(window.datas.itemsData.items[item.originalItemId]);
            content.appendChild(icon);

            const name = document.createElement('span');
            name.className = 'tree-name';
            name.textContent = window.localization.getItemName(window.datas.itemsData.items[item.originalItemId]);
            content.appendChild(name);

            const rate = document.createElement('span');
            rate.className = 'tree-rate';
            rate.textContent = `${item.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`;
            content.appendChild(rate);

            const transport = this.getTransport(item.originalItemId, item.rate);
            if (transport) content.appendChild(transport);

            if (item.allRecipes && item.allRecipes.length > 0) {
                const recipe = item.allRecipes[0];
                const building = window.datas.buildingsData.buildings[recipe.buildingId];

                if (building) {
                    const machine = document.createElement('span');
                    machine.className = 'tree-machine';
                    const machineIcon = document.createElement('img');
                    machineIcon.src = `${window.projectBaseUrl}images/${building.img}`;
                    machineIcon.className = 'tree-machine-icon';
                    machineIcon.alt = window.localization.getBuildingName(building);
                    machine.appendChild(machineIcon);
                    const machineCount = item.machineCount || 1;
                    machine.appendChild(document.createTextNode(`${machineCount.toFixed(2)}x ${window.localization.getBuildingName(building)}`));
                    content.appendChild(machine);
                }
            }

            wasteItem.appendChild(content);
            section.appendChild(wasteItem);
        });

        return section;
    }

    /**
     * Toggles the visual expansion/collapse state of a tree node and its children.
     * @param {HTMLElement} toggle - The toggle button element.
     * @param {HTMLElement} childrenContainer - The container element for the children.
     */
    toggleNode(toggle, childrenContainer) {
        const isExpanded = toggle.classList.contains('expanded');
        if (isExpanded) {
            toggle.classList.remove('expanded');
            toggle.classList.add('collapsed');
            childrenContainer.classList.add('collapsed');
            console.debug("[managers.ProductionSummaryManager.toggleNode] Collapsed node.");
        } else {
            toggle.classList.remove('collapsed');
            toggle.classList.add('expanded');
            childrenContainer.classList.remove('collapsed');
            console.debug("[managers.ProductionSummaryManager.toggleNode] Expanded node.");
        }
    }

    /**
     * Calculates and creates an element for the transport method required for an item's flow rate.
     * @param {string} itemId - The ID of the item.
     * @param {number} rate - The flow rate of the item (items per minute).
     * @returns {HTMLElement|null} The transport element or null if no transport is needed.
     */
    getTransport(itemId, rate) {
        const item = window.datas.itemsData.items[itemId];
        if (!item) return null;
        const type = item.transport_type || 'belt';
        const info = window.datas.transportData[type];
        if (!info?.img) return null;

        const transportCount = rate / info.speed;
        console.debug(`[managers.ProductionSummaryManager.getTransport] For item ${itemId}, transport count is ${transportCount.toFixed(1)} (${type}).`);

        const transport = document.createElement('span');
        transport.className = 'tree-transport';
        const transportIcon = document.createElement('img');
        transportIcon.src = `${window.projectBaseUrl}images/${info.img}`;
        transportIcon.className = 'tree-transport-icon';
        transportIcon.alt = 'transport';
        transport.appendChild(transportIcon);
        const transportText = document.createTextNode(`${transportCount.toFixed(1)}`);
        transport.appendChild(transportText);
        return transport;
    }
}