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
        if (window.productionApp.physicsSimulation.checked) {
            this.startSimulation();
        }
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
     * Check if the physics simulation is currently running.
     * @returns {boolean} True if simulation is active, false otherwise.
     */
    get isSimulationActive() {
        return this.isSimulating;
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

        // Draw edges
        this.edges.forEach(edge => {
            const sourceNode = this.nodes.get(edge.source);
            const targetNode = this.nodes.get(edge.target);
            if (!sourceNode || !targetNode) return;

            // Get the current scale
            const scale = app.canvasTransform.scale || 1;

            // Get the true, unscaled dimensions of the nodes.
            const sourceRect = sourceNode.element.getBoundingClientRect();
            const targetRect = targetNode.element.getBoundingClientRect();

            // Check if the node is currently being dragged to get its scale factor.
            const DRAG_SCALE = 1.05; // This must match the CSS value

            const isSourceDragging = sourceNode.element.classList.contains('is-dragging');
            const sourceDragScale = isSourceDragging ? DRAG_SCALE : 1;
            const sourceWidth = sourceRect.width / scale / sourceDragScale;
            const sourceHeight = sourceRect.height / scale / sourceDragScale;

            const isTargetDragging = targetNode.element.classList.contains('is-dragging');
            const targetDragScale = isTargetDragging ? DRAG_SCALE : 1;
            const targetWidth = targetRect.width / scale / targetDragScale;
            const targetHeight = targetRect.height / scale / targetDragScale;

            // Use logical positions (node.x, node.y) which are the source of truth.
            const sourceCenterX = sourceNode.x + sourceWidth / 2;
            const sourceCenterY = sourceNode.y + sourceHeight / 2;
            const targetCenterX = targetNode.x + targetWidth / 2;
            const targetCenterY = targetNode.y + targetHeight / 2;

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