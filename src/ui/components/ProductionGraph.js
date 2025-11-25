import { ProductionNode } from "../components/ProductionNode.js"

/**
 * Represents and manages the visual production graph, including nodes and edges.
 * This class handles graph layout, physics simulation for node positioning, and rendering.
 */
export class ProductionGraph {
    /**
     * Creates a new production graph instance.
     * @param {SVGElement} svg - The SVG element used for drawing edges.
     * @param {HTMLElement} container - The container element for node DOM elements.
     * @param {Map<string, Object>} allNeedsMap - A map containing all production data for each item.
     * @param {Array<Object>} [wasteEdges=[]] - An array of edges representing waste disposal flows.
     */
    constructor(svg, container, allNeedsMap, wasteEdges = []) {
        this.svg = svg;
        this.container = container;
        this.nodes = new Map(); // A map of itemId -> ProductionNode
        this.edges = [];
        this.animationFrameId = null; // ID for the animation frame request
        this.isSimulating = false; // Flag to control the simulation loop
        this.settlingFrames = 0; // Counter for a brief settling animation after layout

        // Filter nodes based on UI settings (e.g., hide raw materials)
        const filteredData = Array.from(allNeedsMap.values()).filter(itemData => {
            // Always show the target item
            if (itemData.isTarget) return true;
            // Hide raw materials if the checkbox is unchecked
            if (itemData.isRaw && !window.elements.showRawMaterials.checked) return false;
            // Also hide waste disposal nodes if raw materials are hidden
            if (itemData.isWasteDisposal && !window.elements.showRawMaterials.checked) return false;
            return true;
        });

        // Create ProductionNode instances for each filtered item
        filteredData.forEach(itemData => {
            const node = new ProductionNode(itemData, this.container, this);
            this.nodes.set(itemData.itemId, node);
        });
        console.log(`[ui.components.ProductionGraph] Created ${this.nodes.size} nodes.`);

        // Add waste disposal edges if raw materials are visible
        if (window.elements.showRawMaterials.checked) {
            this.edges.push(...wasteEdges);
            console.debug(`[ui.components.ProductionGraph] Added ${wasteEdges.length} waste disposal edges.`);
        }

        // Create edges from recipes (ingredients -> product)
        allNeedsMap.forEach(itemData => {
            // Skip nodes that don't produce anything (raw, waste)
            if (itemData.isWasteDisposal || itemData.isRaw || !itemData.allRecipes || itemData.allRecipes.length === 0) {
                return;
            }
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe && recipe.ingredients) {
                const recipeTimeInMinutes = recipe.time / 60;
                // Find the primary product to calculate machine count if not available
                const product = recipe.products.find(p => p.item_id === itemData.itemId) || recipe.products[0];
                const machinesNeeded = itemData.machineCount || (itemData.rate / (product.amount / recipeTimeInMinutes));

                // For each ingredient, create an edge from the ingredient to the product
                recipe.ingredients.forEach(ingredient => {
                    // Calculate the consumption rate of the ingredient
                    const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                    this.edges.push({ source: ingredient.item_id, target: itemData.itemId, amount: consumptionRate });
                });
            }
        });
        console.log(`[ui.components.ProductionGraph] Created ${this.edges.length} production edges.`);
    }

    /**
     * Applies a layout algorithm to position the nodes.
     * @param {string} type - The type of layout to apply ('hierarchical' or 'force').
     */
    applyLayout(type) {
        console.log(`[ui.components.ProductionGraph] Applying layout: ${type}`);
        // Check if nodes have been manually positioned by the user
        const hasPreservedPositions = Array.from(this.nodes.values()).some(node => node.x !== 0 || node.y !== 0);

        if (hasPreservedPositions && type !== 'force') {
            // If positions are preserved, start a brief "settling" animation
            this.settlingFrames = 40;
            console.log("[ui.components.ProductionGraph] Preserved positions detected, starting settling animation.");
        } else {
            // Hierarchical layout: group nodes by their level in the production chain
            const levels = new Map();
            this.nodes.forEach(node => {
                const level = node.data.level;
                if (!levels.has(level)) levels.set(level, []);
                levels.get(level).push(node);
            });
            const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
            const nodeWidth = 240;
            const levelHeight = 200;

            // Position nodes level by level, centered horizontally
            sortedLevels.forEach((level, index) => {
                const nodes = levels.get(level);
                const totalWidth = nodes.length * nodeWidth;
                const svgWidth = this.svg.clientWidth || 800;
                let startX = (svgWidth - totalWidth) / 2;
                if (startX < 10) startX = 10;

                nodes.forEach((node, nodeIndex) => {
                    node.x = startX + (nodeIndex * nodeWidth);
                    node.y = index * levelHeight + 100;
                    node.vx = 0; // Reset velocity
                    node.vy = 0;
                });
            });
        }

        // Start the physics simulation if it's enabled in the UI
        if (window.elements.physicsSimulation.checked) {
            this.startSimulation();
        }
    }

    /**
     * Starts the force-directed simulation loop.
     */
    startSimulation() {
        if (this.isSimulating) return;
        console.log("[ui.components.ProductionGraph] Starting physics simulation.");
        this.isSimulating = true;
        this.simulate();
    }

    /**
     * Stops the force-directed simulation loop.
     */
    stopSimulation() {
        console.log("[ui.components.ProductionGraph] Stopping physics simulation.");
        this.isSimulating = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    /**
     * Checks if the physics simulation is currently active.
     * @returns {boolean} - True if the simulation is running.
     */
    get isSimulationActive() {
        return this.isSimulating;
    }

    /**
     * The main loop for the physics simulation.
     * Calculates repulsion forces between nodes to prevent overlap and updates their positions.
     */
    simulate() {
        if (!this.isSimulating) return;
        const nodes = Array.from(this.nodes.values());

        // Simulation parameters
        let repulsionStrength = 0.1; // How strongly nodes push each other away
        let damping = 0.85; // How quickly velocity decreases (friction)
        let maxVelocity = 8; // Maximum speed a node can move
        const separationDistance = 35; // The minimum distance between nodes

        // During "settling", turn off forces to let nodes stop smoothly
        if (this.settlingFrames > 0) {
            repulsionStrength = 0;
            damping = 0;
            maxVelocity = 0;
            this.settlingFrames--;
            if (this.settlingFrames === 0) {
                console.log("[ui.components.ProductionGraph] Settling animation finished.");
            }
        }

        // Calculate forces for each node
        nodes.forEach(node => {
            if (node.isPinned) return; // Skip pinned nodes (e.g., being dragged)
            let fx = 0, fy = 0; // Accumulated forces

            // Get node dimensions for accurate collision/force calculation
            const nodeRect = node.element.getBoundingClientRect();
            const nodeWidth = nodeRect.width / window.states.canvasTransform.scale;
            const nodeHeight = nodeRect.height / window.states.canvasTransform.scale;
            const nodeCenterX = node.x + nodeWidth / 2;
            const nodeCenterY = node.y + nodeHeight / 2;
            const nodeLeft = node.x;
            const nodeRight = node.x + nodeWidth;
            const nodeTop = node.y;
            const nodeBottom = node.y + nodeHeight;

            // Calculate repulsion from every other node
            nodes.forEach(otherNode => {
                if (node === otherNode) return;
                const otherRect = otherNode.element.getBoundingClientRect();
                const otherWidth = otherRect.width / window.states.canvasTransform.scale;
                const otherHeight = otherRect.height / window.states.canvasTransform.scale;
                const otherCenterX = otherNode.x + otherWidth / 2;
                const otherCenterY = otherNode.y + otherHeight / 2;
                const otherLeft = otherNode.x;
                const otherRight = otherNode.x + otherWidth;
                const otherTop = otherNode.y;
                const otherBottom = otherNode.y + otherHeight;

                let dx = 0, dy = 0;

                // Simple AABB check to find the closest edge
                if (nodeRight < otherLeft) { // Node is to the left
                    dx = otherLeft - nodeRight;
                } else if (otherRight < nodeLeft) { // Node is to the right
                    dx = nodeLeft - otherRight;
                }

                if (nodeBottom < otherTop) { // Node is above
                    dy = otherTop - nodeBottom;
                } else if (otherBottom < nodeTop) { // Node is below
                    dy = nodeTop - otherBottom;
                }

                if (dx === 0 && dy === 0) { // Nodes are overlapping
                    const dirX = nodeCenterX - otherCenterX;
                    const dirY = nodeCenterY - otherCenterY;
                    const dist = Math.sqrt(dirX * dirX + dirY * dirY);
                    if (dist > 0) {
                        const force = repulsionStrength * separationDistance;
                        fx += (dirX / dist) * force;
                        fy += (dirY / dist) * force;
                    }
                } else { // Nodes are separate, apply repulsion if too close
                    const minDistance = Math.sqrt(dx * dx + dy * dy);
                    if (minDistance < separationDistance) {
                        const dirX = nodeCenterX - otherCenterX;
                        const dirY = nodeCenterY - otherCenterY;
                        const dist = Math.sqrt(dirX * dirX + dirY * dirY);
                        if (dist > 0) {
                            const overlap = separationDistance - minDistance;
                            const force = repulsionStrength * overlap;
                            fx += (dirX / dist) * force;
                            fy += (dirY / dist) * force;
                        }
                    }
                }
            });

            // Update velocity based on accumulated force
            node.vx = (node.vx + fx) * damping;
            node.vy = (node.vy + fy) * damping;
            // Clamp velocity to max speed
            const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
            if (velocity > maxVelocity) {
                const scale = maxVelocity / velocity;
                node.vx *= scale;
                node.vy *= scale;
            }
            // Update position
            node.x += node.vx;
            node.y += node.vy;
        });

        // Re-render the graph and request the next frame
        this.render();
        if (this.isSimulating) {
            this.animationFrameId = requestAnimationFrame(() => this.simulate());
        }
    }

    /**
     * Updates the power consumption display for all nodes in the graph.
     */
    updatePowerDisplay() {
        this.nodes.forEach(node => {
            node.updatePowerDisplay();
        });
    }

    /**
     * Renders the entire graph: clears the SVG, draws nodes, and draws edges.
     */
    render() {
        // Clear previous SVG content
        this.svg.innerHTML = '';

        // Re-render all nodes (their DOM elements are persistent)
        this.nodes.forEach(node => node.render());

        // Apply the current canvas transform (pan and zoom) to SVG and container
        const transformString = `translate(${window.states.canvasTransform.x}px, ${window.states.canvasTransform.y}px) scale(${window.states.canvasTransform.scale})`;
        this.svg.style.transform = transformString;
        this.svg.style.transformOrigin = '0 0';
        this.container.style.transform = transformString;
        this.container.style.transformOrigin = '0 0';

        // Define an arrowhead marker for the edges
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

        // Draw each edge as a path
        this.edges.forEach(edge => {
            const sourceNode = this.nodes.get(edge.source);
            const targetNode = this.nodes.get(edge.target);
            if (!sourceNode || !targetNode) return;

            // Get node dimensions, adjusted for scale and drag state
            const scale = window.states.canvasTransform.scale || 1;
            const sourceRect = sourceNode.element.getBoundingClientRect();
            const targetRect = targetNode.element.getBoundingClientRect();
            const DRAG_SCALE = 1.05; // Nodes are slightly scaled up when dragged for better visibility

            const isSourceDragging = sourceNode.element.classList.contains('is-dragging');
            const sourceDragScale = isSourceDragging && !this.isSimulating ? DRAG_SCALE : 1;
            const sourceWidth = sourceRect.width / scale / sourceDragScale;
            const sourceHeight = sourceRect.height / scale / sourceDragScale;

            const isTargetDragging = targetNode.element.classList.contains('is-dragging');
            const targetDragScale = isTargetDragging ? DRAG_SCALE : 1;
            const targetWidth = targetRect.width / scale / targetDragScale;
            const targetHeight = targetRect.height / scale / targetDragScale;

            const sourceCenterX = sourceNode.x + sourceWidth / 2;
            const sourceCenterY = sourceNode.y + sourceHeight / 2;
            const targetCenterX = targetNode.x + targetWidth / 2;
            const targetCenterY = targetNode.y + targetHeight / 2;

            // Calculate the exact points where the edge should touch the node boundaries
            const connectionPoints = this.getConnectionPoints(
                sourceCenterX, sourceCenterY, sourceWidth, sourceHeight,
                targetCenterX, targetCenterY, targetWidth, targetHeight
            );

            // Create the SVG path for the edge
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${connectionPoints.startX} ${connectionPoints.startY} L ${connectionPoints.endX} ${connectionPoints.endY}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'edge-path');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            this.svg.appendChild(path);
        });
    }

    /**
     * Calculates the optimal start and end points for an edge between two rectangular nodes.
     * This ensures the edge connects to the closest edge of the node's bounding box.
     */
    getConnectionPoints(sourceCenterX, sourceCenterY, sourceWidth, sourceHeight,
        targetCenterX, targetCenterY, targetWidth, targetHeight) {
        // Vector from source to target
        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / length;
        const dirY = dy / length;

        // Calculate intersection point with source node's boundary
        const halfWidthSource = sourceWidth / 2;
        const halfHeightSource = sourceHeight / 2;
        let tSource = (dirX !== 0) ? Math.min(
            (halfWidthSource) / Math.abs(dirX),
            (halfHeightSource) / Math.abs(dirY)
        ) : (halfHeightSource) / Math.abs(dirY);
        const startX = sourceCenterX + dirX * tSource;
        const startY = sourceCenterY + dirY * tSource;

        // Calculate intersection point with target node's boundary
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