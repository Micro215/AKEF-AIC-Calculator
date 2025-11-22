/**
 * Class representing the production graph
 */
class ProductionGraph {
    /**
     * Create a new production graph
     * @param {SVGElement} svg - SVG element for drawing edges
     * @param {HTMLElement} container - Container element for nodes
     * @param {Map} allNeedsMap - Map of all production needs
     */
    constructor(svg, container, allNeedsMap, wasteEdges = []) {
        const app = window.productionApp;
    
        this.svg = svg;
        this.container = container;
        this.nodes = new Map();
        this.edges = [];
        this.animationFrameId = null;
        this.isSimulating = false;
        this.settlingFrames = 0;
    
        // --- Create all nodes from the map ---
        // This includes production nodes, raw materials, AND disposal nodes
        const filteredData = Array.from(allNeedsMap.values()).filter(itemData => {
            if (itemData.isTarget) return true;
            if (itemData.isRaw && !app.showRawMaterials.checked) return false;
            return true;
        });
    
        filteredData.forEach(itemData => {
            const node = new ProductionNode(itemData, this.container, this);
            this.nodes.set(itemData.itemId, node);
        });
    
        // --- Create all edges ---
    
        // 1. Add the pre-calculated waste disposal edges
        this.edges.push(...wasteEdges);
    
        // 2. Create regular production edges
        allNeedsMap.forEach(itemData => {
            // Skip disposal nodes, raw materials, and items without recipes
            if (itemData.isWasteDisposal || itemData.isRaw || !itemData.allRecipes || itemData.allRecipes.length === 0) {
                return;
            }
    
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe && recipe.ingredients) {
                const recipeTimeInMinutes = recipe.time / app.SECONDS_PER_MINUTE;
                const product = recipe.products.find(p => p.item_id === itemData.itemId) || recipe.products[0];
                const machinesNeeded = itemData.machineCount || (itemData.rate / (product.amount / recipeTimeInMinutes));
                recipe.ingredients.forEach(ingredient => {
                    const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                    this.edges.push({ source: ingredient.item_id, target: itemData.itemId, amount: consumptionRate });
                });
            }
        });
    }

    /**
     * Apply layout to the graph
     * @param {string} type - Type of layout to apply
     */
    applyLayout(type) {
        // Check if nodes already have positions (preserved from previous graph)
        const hasPreservedPositions = Array.from(this.nodes.values()).some(node =>
            node.x !== 0 || node.y !== 0
        );

        // If nodes already have positions, don't reposition them
        if (hasPreservedPositions) {
            this.settlingFrames = 40;
        } else {
            // Group nodes by level for initial positioning
            const levels = new Map();
            this.nodes.forEach(node => {
                const level = node.data.level;
                if (!levels.has(level)) levels.set(level, []);
                levels.get(level).push(node);
            });

            // Sort levels
            const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
            const nodeWidth = 240;
            const levelHeight = 200; // More space to prevent initial overlap

            // Position nodes level by level
            sortedLevels.forEach((level, index) => {
                const nodes = levels.get(level);
                const totalWidth = nodes.length * nodeWidth;
                const svgWidth = this.svg.clientWidth || 800;
                let startX = (svgWidth - totalWidth) / 2;
                if (startX < 10) startX = 10;

                nodes.forEach(node => {
                    node.x = startX + Math.random() * 50 - 25; // Add some randomness
                    node.y = index * levelHeight + 100;
                    // Initialize velocity for the simulation
                    node.vx = 0;
                    node.vy = 0;
                    startX += nodeWidth;
                });
            });
        }

        // Start the continuous simulation
        this.startSimulation();
    }

    /**
     * Start the force simulation loop
     */
    startSimulation() {
        if (this.isSimulating) return;
        this.isSimulating = true;
        this.simulate();
    }

    /**
     * Stop the force simulation loop
     */
    stopSimulation() {
        this.isSimulating = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    /**
     * The main simulation loop
     */
    simulate() {
        // Exit if the simulation is not running
        if (!this.isSimulating) return;

        // Get an array of all nodes from the nodes map
        const nodes = Array.from(this.nodes.values());

        // --- Physics Parameters ---
        // Repulsion strength. Determines how strongly nodes push each other away when overlapping.
        let repulsionStrength = 0.1;
        // Damping. Slows down movement. A value closer to 1.0 makes movement more "slippery".
        let damping = 0.85;
        // Maximum velocity to prevent nodes from "flying away" and causing instability.
        let maxVelocity = 8;
        // Minimum distance between the *edges* of nodes. This is a key parameter for controlling density.
        const separationDistance = 35;

        // If tab changed
        if (this.settlingFrames > 0) {
            repulsionStrength = 0;
            damping = 0;
            maxVelocity = 0;
            this.settlingFrames--;
        }

        // Iterate through each node to calculate forces and update its position
        nodes.forEach(node => {
            // Skip calculation for nodes that are pinned in place
            if (node.isPinned) return;

            // Initialize force components for this node
            let fx = 0, fy = 0;

            // Get the dimensions and center of the current node
            const nodeRect = node.element.getBoundingClientRect();
            // Get the scaled dimensions of the node's element, accounting for canvas zoom/pan
            const nodeWidth = nodeRect.width / window.productionApp.canvasTransform.scale;
            const nodeHeight = nodeRect.height / window.productionApp.canvasTransform.scale;
            // Calculate the center of the node
            const nodeCenterX = node.x + nodeWidth / 2;
            const nodeCenterY = node.y + nodeHeight / 2;

            // Determine the boundaries (AABB - Axis-Aligned Bounding Box) of the current node
            const nodeLeft = node.x;
            const nodeRight = node.x + nodeWidth;
            const nodeTop = node.y;
            const nodeBottom = node.y + nodeHeight;

            // Check for interactions with all other nodes
            nodes.forEach(otherNode => {
                // Don't compare the node with itself
                if (node === otherNode) return;

                // Get dimensions and boundaries for the other node, similar to the current one
                const otherRect = otherNode.element.getBoundingClientRect();
                const otherWidth = otherRect.width / window.productionApp.canvasTransform.scale;
                const otherHeight = otherRect.height / window.productionApp.canvasTransform.scale;
                const otherCenterX = otherNode.x + otherWidth / 2;
                const otherCenterY = otherNode.y + otherHeight / 2;

                // Determine the boundaries of the other node
                const otherLeft = otherNode.x;
                const otherRight = otherNode.x + otherWidth;
                const otherTop = otherNode.y;
                const otherBottom = otherNode.y + otherHeight;

                // --- Calculate the minimum distance between two rectangles (AABB) ---
                let dx = 0, dy = 0;

                // Calculate the separation distance on the X axis
                if (nodeRight < otherLeft) { // Current node is to the left of the other node
                    dx = otherLeft - nodeRight;
                } else if (otherRight < nodeLeft) { // Current node is to the right of the other node
                    dx = nodeLeft - otherRight;
                }
                // If the nodes overlap on the X axis, dx remains 0

                // Calculate the separation distance on the Y axis
                if (nodeBottom < otherTop) { // Current node is above the other node
                    dy = otherTop - nodeBottom;
                } else if (otherBottom < nodeTop) { // Current node is below the other node
                    dy = nodeTop - otherBottom;
                }
                // If the nodes overlap on the Y axis, dy remains 0

                // If dx and dy are both 0, the nodes are overlapping. Apply a force to separate them.
                if (dx === 0 && dy === 0) {
                    // Direction from the other node to the current node
                    const dirX = nodeCenterX - otherCenterX;
                    const dirY = nodeCenterY - otherCenterY;
                    const dist = Math.sqrt(dirX * dirX + dirY * dirY);

                    if (dist > 0) {
                        // Separation force
                        const force = repulsionStrength * separationDistance;
                        fx += (dirX / dist) * force;
                        fy += (dirY / dist) * force;
                    }
                } else {
                    // If nodes are not overlapping but are too close to each other
                    const minDistance = Math.sqrt(dx * dx + dy * dy);

                    if (minDistance < separationDistance) {
                        // Direction from the other node to the current node
                        const dirX = nodeCenterX - otherCenterX;
                        const dirY = nodeCenterY - otherCenterY;
                        const dist = Math.sqrt(dirX * dirX + dirY * dirY);

                        if (dist > 0) {
                            // Repulsive force that smoothly increases as they get closer
                            const overlap = separationDistance - minDistance;
                            const force = repulsionStrength * overlap;
                            fx += (dirX / dist) * force;
                            fy += (dirY / dist) * force;
                        }
                    }
                }
            });

            // --- Update Node State ---

            // Update velocity by adding the new force and applying damping
            node.vx = (node.vx + fx) * damping;
            node.vy = (node.vy + fy) * damping;

            // Limit the maximum velocity for stability
            const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
            if (velocity > maxVelocity) {
                const scale = maxVelocity / velocity;
                node.vx *= scale;
                node.vy *= scale;
            }

            // Update the node's position based on its velocity
            node.x += node.vx;
            node.y += node.vy;
        });

        // Render and continue the loop
        this.render();
        if (this.isSimulating) {
            this.animationFrameId = requestAnimationFrame(() => this.simulate());
        }
    }

    /**
     * Update power display in nodes
     */
    updatePowerDisplay() {
        this.nodes.forEach(node => {
            node.updatePowerDisplay();
        });
    }

    /**
     * Render the graph
     */
    render() {
        const app = window.productionApp;

        // Clear SVG
        this.svg.innerHTML = '';

        // Render nodes
        this.nodes.forEach(node => node.render());

        // Apply canvas transform
        const transformString = `translate(${app.canvasTransform.x}px, ${app.canvasTransform.y}px) scale(${app.canvasTransform.scale})`;

        this.svg.style.transform = transformString;
        this.svg.style.transformOrigin = '0 0';

        this.container.style.transform = transformString;
        this.container.style.transformOrigin = '0 0';

        // Create arrow marker definition
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#999');
        marker.appendChild(polygon);
        defs.appendChild(marker);
        this.svg.appendChild(defs);

        // Get current scale for calculations
        const scale = app.canvasTransform.scale || 1;

        // Draw edges
        this.edges.forEach(edge => {
            const sourceNode = this.nodes.get(edge.source);
            const targetNode = this.nodes.get(edge.target);
            if (!sourceNode || !targetNode) return;
        
            // Get node dimensions and positions
            const sourceRect = sourceNode.element.getBoundingClientRect();
            const targetRect = targetNode.element.getBoundingClientRect();
        
            const sourceWidth = sourceRect.width / scale;
            const sourceHeight = sourceRect.height / scale;
            const targetWidth = targetRect.width / scale;
            const targetHeight = targetRect.height / scale;

            // The previous special case for waste disposal is removed.
            const sourceCenterX = sourceNode.x + (sourceWidth / 2);
            const sourceCenterY = sourceNode.y + (sourceHeight / 2);
            const targetCenterX = targetNode.x + (targetWidth / 2);
            const targetCenterY = targetNode.y + (targetHeight / 2);
        
            const connectionPoints = this.getConnectionPoints(
                sourceCenterX, sourceCenterY, sourceWidth, sourceHeight,
                targetCenterX, targetCenterY, targetWidth, targetHeight
            );
        
            const startX = connectionPoints.startX;
            const startY = connectionPoints.startY;
            const endX = connectionPoints.endX;
            const endY = connectionPoints.endY;
        
            // Create the SVG path element for the edge
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${startX} ${startY} L ${endX} ${endY}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'edge-path');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            this.svg.appendChild(path);
        });
    }

    /**
     * Calculate connection points between nodes
     * @param {number} sourceCenterX - Source node center X
     * @param {number} sourceCenterY - Source node center Y
     * @param {number} sourceWidth - Source node width
     * @param {number} sourceHeight - Source node height
     * @param {number} targetCenterX - Target node center X
     * @param {number} targetCenterY - Target node center Y
     * @param {number} targetWidth - Target node width
     * @param {number} targetHeight - Target node height
     * @returns {Object} Connection points
     */
    getConnectionPoints(sourceCenterX, sourceCenterY, sourceWidth, sourceHeight,
        targetCenterX, targetCenterY, targetWidth, targetHeight) {
        // Calculate direction
        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;

        const length = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / length;
        const dirY = dy / length;

        // Calculate source point
        const halfWidthSource = sourceWidth / 2;
        const halfHeightSource = sourceHeight / 2;

        let tSource = (dirX !== 0) ? Math.min(
            (halfWidthSource) / Math.abs(dirX),
            (halfHeightSource) / Math.abs(dirY)
        ) : (halfHeightSource) / Math.abs(dirY);

        const startX = sourceCenterX + dirX * tSource;
        const startY = sourceCenterY + dirY * tSource;

        // Calculate target point
        const halfWidthTarget = targetWidth / 2;
        const halfHeightTarget = targetHeight / 2;

        let tTarget = (dirX !== 0) ? Math.min(
            (halfWidthTarget) / Math.abs(dirX),
            (halfHeightTarget) / Math.abs(dirY)
        ) : (halfHeightTarget) / Math.abs(dirY);

        const endX = targetCenterX - dirX * tTarget;
        const endY = targetCenterY - dirY * tTarget;

        return { startX, startY, endX, endY };
    }
}

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
            // FIX: Added check for recipe and recipe.ingredients
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
                <img src="${window.productionApp.projectBaseUrl}images/${isWasteDisposal ? building.img : itemInfo.img}" class="node-icon" alt="${isWasteDisposal ? window.localization.getBuildingName(building) : window.localization.getItemName(itemInfo)}">
                <div class="node-title-container">
                    <div class="node-title">${isWasteDisposal ? window.localization.getBuildingName(building) : window.localization.getItemName(itemInfo)}</div>
                    ${!isWasteDisposal && localizedType ? `<div class="node-type">${localizedType}</div>` : ''}
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