/**
 * Production Summary
 */
class ProductionSummaryManager {
    constructor() {
        this.modal = document.getElementById('production-summary-modal');
        this.container = document.getElementById('production-summary-container');
        this.openBtn = document.getElementById('production-summary-btn');
        this.closeBtn = this.modal.querySelector('.modal-close');

        this.setupEvents();
    }

    setupEvents() {
        this.openBtn.addEventListener('click', () => this.show());
        this.closeBtn.addEventListener('click', () => this.hide());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
    }

    show() {
        const app = window.productionApp;
        if (!app.allNeedsMap || app.allNeedsMap.size === 0) {
            alert(window.localization.t('app.no_production_data'));
            return;
        }
        this.render();
        this.modal.classList.add('is-active');
    }

    hide() {
        this.modal.classList.remove('is-active');
    }

    render() {
        const app = window.productionApp;
        this.container.innerHTML = '';

        // Analyze production data
        const analysis = this.analyzeProduction();

        // Render main production tree
        if (analysis.mainTree) {
            this.container.appendChild(this.renderSection(
                window.localization.t('app.production_chain'),
                this.renderTree(analysis.mainTree)
            ));
        }

        // Render shared items
        if (analysis.sharedItems.length > 0) {
            this.container.appendChild(this.renderSharedItems(analysis.sharedItems));
        }

        // Render waste disposal
        if (analysis.wasteItems.length > 0) {
            this.container.appendChild(this.renderWasteSection(analysis.wasteItems));
        }
    }

    analyzeProduction() {
        const app = window.productionApp;
        const itemUsage = new Map();

        // Count item usage
        app.allNeedsMap.forEach((data, id) => {
            itemUsage.set(id, { count: 0, data });
        });

        app.allNeedsMap.forEach((data, id) => {
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

        // Build main tree
        const targetId = app.currentTargetItem?.id;
        const mainTree = targetId ? this.buildTree(targetId, new Set()) : null;

        // Collect shared items
        const sharedItems = [];
        itemUsage.forEach((usage, id) => {
            if (usage.count > 1 && id !== targetId) {
                const item = app.itemsData.items[id];
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

        // Collect waste items
        const wasteItems = [];
        app.allNeedsMap.forEach((data, id) => {
            if (data.isWasteDisposal) {
                wasteItems.push(data);
            }
        });

        return { mainTree, sharedItems, wasteItems };
    }

    buildTree(itemId, visited) {
        const app = window.productionApp;
        if (visited.has(itemId)) return null;
        visited.add(itemId);

        const data = app.allNeedsMap.get(itemId);
        if (!data) return null;

        const item = app.itemsData.items[itemId];
        if (!item) return null;

        const node = {
            id: itemId,
            name: window.localization.getItemName(item),
            icon: item.img,
            rate: data.rate,
            isRaw: data.isRaw,
            isWaste: data.isWasteDisposal,
            children: []
        };

        // Add recipe info
        if (!data.isRaw && data.allRecipes?.length > 0) {
            const recipe = data.allRecipes[data.selectedRecipeIndex];
            const building = app.buildingsData.buildings[recipe.buildingId];

            if (building) {
                const machineCount = data.machineCount;
                const recipeTimeInMinutes = recipe.time / app.SECONDS_PER_MINUTE;

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

                // Add children
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

    renderTree(node, level = 0) {
        const tree = document.createElement('div');
        tree.className = 'summary-tree';

        this.renderTreeNode(tree, node, level, true);
        return tree;
    }

    renderTreeNode(container, node, level, isLast = false) {
        // Create main line with level class
        const line = document.createElement('div');
        line.className = `tree-line level-${level}`;

        // Add content (no more indent span needed)
        const content = document.createElement('span');
        content.className = 'tree-content';

        // Add toggle if has children
        let childrenContainer = null;
        if (node.children?.length > 0) {
            const toggle = document.createElement('span');
            toggle.className = 'tree-toggle expanded';
            toggle.addEventListener('click', () => this.toggleNode(toggle, childrenContainer));
            content.appendChild(toggle);
        }

        // Icon
        const icon = document.createElement('img');
        icon.src = `${window.productionApp.projectBaseUrl}images/${node.icon}`;
        icon.className = 'tree-icon';
        icon.alt = node.name;
        content.appendChild(icon);

        // Name
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = node.name;
        content.appendChild(name);

        // Rate
        const rate = document.createElement('span');
        rate.className = 'tree-rate';
        rate.textContent = `${node.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`;
        content.appendChild(rate);

        // Transport
        const transport = this.getTransport(node.id, node.rate);
        if (transport) content.appendChild(transport);

        // Machine info
        if (node.recipe?.building) {
            const machine = document.createElement('span');
            machine.className = 'tree-machine';

            const machineIcon = document.createElement('img');
            machineIcon.src = `${window.productionApp.projectBaseUrl}images/${node.recipe.building.icon}`;
            machineIcon.className = 'tree-machine-icon';
            machineIcon.alt = node.recipe.building.name;
            machine.appendChild(machineIcon);

            // Calculate actual machines needed for this node's production
            const actualMachines = this.calculateMachineCount(node);
            machine.appendChild(document.createTextNode(`${actualMachines.toFixed(2)}x ${node.recipe.building.name}`));
            content.appendChild(machine);
        }

        // Add crafting inline
        if (node.recipe && !node.isRaw) {
            const craftInline = this.renderCraftingInline(node.recipe);
            content.appendChild(craftInline);
        }

        line.appendChild(content);
        container.appendChild(line);

        // Add children container
        if (node.children?.length > 0) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';

            node.children.forEach((child, index) => {
                this.renderTreeNode(childrenContainer, child, level + 1, index === node.children.length - 1);
            });

            container.appendChild(childrenContainer);
        }
    }

    calculateMachineCount(node) {
        const app = window.productionApp;
        const data = app.allNeedsMap.get(node.id);
        if (!data) return 0;

        // For non-raw items, use calculated machine count
        if (!data.isRaw && data.allRecipes?.length > 0) {
            return data.machineCount;
        }

        // For raw materials, no machines needed
        return 0;
    }

    renderCraftingInline(recipe) {
        const craftInline = document.createElement('div');
        craftInline.className = 'tree-craft-inline';

        const flow = document.createElement('div');
        flow.className = 'tree-craft-flow';

        // Add ingredients
        recipe.ingredients.forEach(ing => {
            const item = document.createElement('span');
            item.className = 'tree-craft-item';

            const icon = document.createElement('img');
            icon.src = `${window.productionApp.projectBaseUrl}images/${window.productionApp.itemsData.items[ing.id].img}`;
            icon.className = 'tree-craft-icon';
            item.appendChild(icon);

            item.appendChild(document.createTextNode(`${ing.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`));
            flow.appendChild(item);
        });

        // Add arrow
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.textContent = '→';
        flow.appendChild(arrow);

        // Add products
        recipe.products.forEach(prod => {
            const item = document.createElement('span');
            item.className = 'tree-craft-item';

            const icon = document.createElement('img');
            icon.src = `${window.productionApp.projectBaseUrl}images/${window.productionApp.itemsData.items[prod.id].img}`;
            icon.className = 'tree-craft-icon';
            item.appendChild(icon);

            item.appendChild(document.createTextNode(`${prod.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`));
            flow.appendChild(item);
        });

        craftInline.appendChild(flow);
        return craftInline;
    }

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
            icon.src = `${window.productionApp.projectBaseUrl}images/${item.icon}`;
            icon.className = 'shared-icon';
            elem.appendChild(icon);

            const countText = `${item.name} (${item.count}x)`;
            elem.appendChild(document.createTextNode(countText));
            section.appendChild(elem);
        });
        
        return section;
    }

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

            // Create content container similar to regular nodes
            const content = document.createElement('span');
            content.className = 'tree-content';

            // Icon
            const icon = document.createElement('img');
            icon.src = `${window.productionApp.projectBaseUrl}images/${window.productionApp.itemsData.items[item.originalItemId].img}`;
            icon.className = 'tree-icon';
            icon.alt = window.localization.getItemName(window.productionApp.itemsData.items[item.originalItemId]);
            content.appendChild(icon);

            // Name
            const name = document.createElement('span');
            name.className = 'tree-name';
            name.textContent = window.localization.getItemName(window.productionApp.itemsData.items[item.originalItemId]);
            content.appendChild(name);

            // Rate
            const rate = document.createElement('span');
            rate.className = 'tree-rate';
            rate.textContent = `${item.rate.toFixed(1)} ${window.localization.t('app.per_minute')}`;
            content.appendChild(rate);

            // Transport
            const transport = this.getTransport(item.originalItemId, item.rate);
            if (transport) content.appendChild(transport);

            // Machine info - Check if waste item has building information
            if (item.allRecipes && item.allRecipes.length > 0) {
                const recipe = item.allRecipes[0]; // Waste disposal typically has only one recipe
                const building = window.productionApp.buildingsData.buildings[recipe.buildingId];

                if (building) {
                    const machine = document.createElement('span');
                    machine.className = 'tree-machine';

                    const machineIcon = document.createElement('img');
                    machineIcon.src = `${window.productionApp.projectBaseUrl}images/${building.img}`;
                    machineIcon.className = 'tree-machine-icon';
                    machineIcon.alt = window.localization.getBuildingName(building);
                    machine.appendChild(machineIcon);

                    // Use machineCount from waste item data
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

    toggleNode(toggle, childrenContainer) {
        const isExpanded = toggle.classList.contains('expanded');

        if (isExpanded) {
            toggle.classList.remove('expanded');
            toggle.classList.add('collapsed');
            childrenContainer.classList.add('collapsed');
        } else {
            toggle.classList.remove('collapsed');
            toggle.classList.add('expanded');
            childrenContainer.classList.remove('collapsed');
        }
    }

    getTransport(itemId, rate) {
        const app = window.productionApp;
        const item = app.itemsData.items[itemId];
        if (!item) return null;

        const type = item.transport_type || 'belt';
        const info = app.transportData[type];
        if (!info?.img) return null;

        const transport = document.createElement('span');
        transport.className = 'tree-transport';

        const transportIcon = document.createElement('img');
        transportIcon.src = `${app.projectBaseUrl}images/${info.img}`;
        transportIcon.className = 'tree-transport-icon';
        transportIcon.alt = 'transport';
        transport.appendChild(transportIcon);

        const transportText = document.createTextNode(`${(rate / info.speed).toFixed(1)}`);
        transport.appendChild(transportText);

        return transport;
    }
}

// Initialize
window.ProductionSummaryManager = ProductionSummaryManager;