document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT REFERENCES ---
    const itemSelectorBtn = document.getElementById('item-selector-btn');
    const selectedItemName = document.getElementById('selected-item-name');
    const recipeSelectorModal = document.getElementById('recipe-selector-modal');
    const recipeSearchInput = document.getElementById('recipe-search-input');
    const categoryTabs = document.querySelector('.category-tabs');
    const recipeGrid = document.getElementById('all-recipes');
    const amountInput = document.getElementById('amount-input');
    const calculateBtn = document.getElementById('calculate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const modalClose = helpModal.querySelector('.modal-close');

    const showRawMaterials = document.getElementById('show-raw-materials');
    const showPower = document.getElementById('show-power');

    const graphContainer = document.getElementById('graph-container');
    const graphSvg = document.getElementById('graph-svg');
    const nodesContainer = document.getElementById('nodes-container');
    const loadingMessage = document.getElementById('loading-message');
    const noRecipeMessage = document.getElementById('no-recipe-message');
    const totalPowerEl = document.getElementById('total-power');

    // --- GLOBAL STATE VARIABLES ---
    let itemsData = {};
    let buildingsData = {};
    let productionGraph = null;
    let selectedRecipesMap = new Map();
    let allNeedsMap = new Map();
    let currentTargetItem = null;

    // Interaction state variables
    let isDraggingNode = null;
    let isPanningCanvas = false;
    let panStart = { x: 0, y: 0 };
    let canvasTransform = { x: 0, y: 0, scale: 1 };
    const SECONDS_PER_MINUTE = 60;

    // Recipe selector state
    let currentCategory = 'all';
    let allCategories = new Set();

    // Node deletion state
    let nodePendingDeletion = null;

    // --- INITIALIZATION ---
    /**
     * Initialize the application by loading data and setting up event listeners
     */
    async function initializeApp() {
        // Disable controls during data load
        itemSelectorBtn.disabled = true;
        calculateBtn.disabled = true;
        selectedItemName.textContent = 'Loading data...';

        try {
            // Load both data files in parallel
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch('db/items.json'),
                fetch('db/buildings.json')
            ]);

            // Check if both requests were successful
            if (!itemsResponse.ok || !buildingsResponse.ok) {
                throw new Error('Failed to load data files.');
            }

            // Parse JSON data
            itemsData = await itemsResponse.json();
            buildingsData = await buildingsResponse.json();

            // Set up event listeners after data is loaded
            setupEventListeners();

            // Re-enable controls after successful load
            itemSelectorBtn.disabled = false;
            calculateBtn.disabled = false;
            selectedItemName.textContent = 'Choose a recipe...';

        } catch (error) {
            console.error("Initialization failed:", error);
            selectedItemName.textContent = 'Error: Could not load data';
            itemSelectorBtn.disabled = true; // Keep button disabled on error
        }
    }

    // --- EVENT LISTENERS SETUP ---
    /**
     * Show delete confirmation modal
     * @param {string} itemId - ID of the item to delete
     */
    function showDeleteConfirmation(itemId) {
        const deleteModal = document.getElementById('delete-confirmation-modal');
        const deleteItemName = document.getElementById('delete-item-name');

        const item = itemsData.items[itemId];
        if (item) {
            deleteItemName.textContent = item.name;
            nodePendingDeletion = itemId;
            deleteModal.classList.add('is-active');
        }
    }

    /**
     * Hide delete confirmation modal
     */
    function hideDeleteConfirmation() {
        const deleteModal = document.getElementById('delete-confirmation-modal');
        deleteModal.classList.remove('is-active');
        nodePendingDeletion = null;
    }

    /**
     * Set up all event listeners for the application
     */
    function setupEventListeners() {
        // Recipe selector modal
        itemSelectorBtn.addEventListener('click', () => {
            recipeSelectorModal.classList.add('is-active');
            if (!recipeGrid.innerHTML) {
                renderRecipeCategories();
            }
        });

        recipeSearchInput.addEventListener('input', handleRecipeSearch);

        const modalCloseBtn = recipeSelectorModal.querySelector('.modal-close');
        modalCloseBtn.addEventListener('click', () => {
            recipeSelectorModal.classList.remove('is-active');
        });

        // Main controls
        calculateBtn.addEventListener('click', calculateProduction);
        resetBtn.addEventListener('click', resetApp);
        helpBtn.addEventListener('click', () => helpModal.classList.add('is-active'));
        modalClose.addEventListener('click', () => helpModal.classList.remove('is-active'));

        // Display options
        showRawMaterials.addEventListener('change', () => { if (productionGraph) renderGraph(); });
        showPower.addEventListener('change', () => { if (productionGraph) renderGraph(); });

        // Graph interaction
        graphContainer.addEventListener('mousedown', handleCanvasMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        graphContainer.addEventListener('wheel', handleWheel, { passive: false });

        // Delete confirmation modal
        const deleteModal = document.getElementById('delete-confirmation-modal');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const deleteModalCloseBtn = deleteModal.querySelector('.modal-close');

        confirmDeleteBtn.addEventListener('click', () => {
            if (nodePendingDeletion) {
                deleteNodeAndDependents(nodePendingDeletion);
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
    }

    // --- RECIPE SELECTION ---
    /**
     * Render recipe categories and set up category tabs
     */
    function renderRecipeCategories() {
        // Clear and rebuild categories
        allCategories.clear();
        getAllItems().forEach(item => {
            if (item.type) {
                allCategories.add(item.type);
            }
        });

        // Create "All" tab
        categoryTabs.innerHTML = '<button class="category-tab active" data-category="all">All</button>';

        // Create category tabs
        allCategories.forEach(category => {
            const tab = document.createElement('button');
            tab.className = 'category-tab';
            tab.setAttribute('data-category', category);
            // Format category name for display
            tab.textContent = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            categoryTabs.appendChild(tab);
        });

        // Add click event to tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentCategory = tab.getAttribute('data-category');
                renderRecipeGrid();
            });
        });

        // Initial render of recipe grid
        renderRecipeGrid();
    }

    /**
     * Handle recipe search input
     */
    function handleRecipeSearch() {
        renderRecipeGrid();
    }

    /**
     * Render the recipe grid based on current filters
     */
    function renderRecipeGrid() {
        const allItems = getAllItems();
        let filteredItems = allItems;

        // Filter by category
        if (currentCategory !== 'all') {
            filteredItems = filteredItems.filter(item => item.type === currentCategory);
        }

        // Filter by search query
        const searchQuery = recipeSearchInput.value.toLowerCase().trim();
        if (searchQuery) {
            filteredItems = filteredItems.filter(item =>
                item.name && item.name.toLowerCase().includes(searchQuery)
            );
        }

        // Clear the grid
        recipeGrid.innerHTML = '';

        // Show message if no results
        if (filteredItems.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-recipes-message';
            noResults.textContent = 'No recipes found';
            recipeGrid.appendChild(noResults);
            return;
        }

        // Sort items alphabetically
        filteredItems.sort((a, b) => a.name.localeCompare(b.name));

        // Create recipe items
        filteredItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'recipe-item';

            // Check if item has a recipe
            const hasRecipe = findRecipesForItem(item.id) !== null;

            if (!hasRecipe) {
                itemEl.classList.add('is-raw-item');
                itemEl.title = "This item don't have AIC recipe.";
            }

            // Set image source with fallback
            const imgSrc = item.img ? `images/${item.img}` : 'images/default-item.png';

            itemEl.innerHTML = `
                <img src="${imgSrc}" alt="${item.name}">
                <div class="recipe-item-info">
                    <div class="recipe-item-name">${item.name}</div>
                    <div class="recipe-item-type">${item.type ? item.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'unknown'}</div>
                    ${!hasRecipe ? '<div class="recipe-item-status">Uncraftable</div>' : ''}
                </div>
            `;

            // Add click event only for craftable items
            if (hasRecipe) {
                itemEl.addEventListener('click', () => selectRecipe(item));
            }

            recipeGrid.appendChild(itemEl);
        });
    }

    /**
     * Select a recipe for production
     * @param {Object} item - The selected item
     */
    function selectRecipe(item) {
        currentTargetItem = item;
        selectedItemName.textContent = item.name;
        recipeSelectorModal.classList.remove('is-active');
    }

    // --- PRODUCTION LOGIC ---
    /**
     * Calculate production based on selected item and target rate
     */
    function calculateProduction() {
        // Validate inputs
        if (!currentTargetItem) {
            alert('Please select an item to produce.');
            return;
        }
        const targetRate = parseFloat(amountInput.value);
        if (isNaN(targetRate) || targetRate <= 0) {
            alert('Please enter a valid production rate.');
            return;
        }

        // Show loading state
        showLoading(true);
        noRecipeMessage.style.display = 'none';

        // Reset graph
        resetGraph();

        // Calculate with a small delay to allow UI to update
        setTimeout(() => {
            // Clear previous calculations
            allNeedsMap.clear();

            // Calculate needs recursively
            calculateNeedsRecursive(currentTargetItem.id, targetRate);

            // Check if any recipes were found
            if (allNeedsMap.size === 0) {
                showLoading(false);
                noRecipeMessage.style.display = 'block';
                productionGraph = null;
                return;
            }

            // Create and render the production graph
            productionGraph = new ProductionGraph(graphSvg, nodesContainer, allNeedsMap);
            renderGraph();
            updateTotalPower();
            showLoading(false);
        }, 100);
    }

    /**
     * Recursively calculate production needs for an item
     * @param {string} itemId - ID of the item
     * @param {number} desiredRate - Desired production rate
     * @param {number} level - Current level in the production chain
     * @param {boolean} isTarget - Whether this is the target item
     */
    function calculateNeedsRecursive(itemId, desiredRate, level = 0, isTarget = false) {
        // If item already exists in the map, update its rate
        if (allNeedsMap.has(itemId)) {
            const existing = allNeedsMap.get(itemId);
            const oldRate = existing.rate;
            existing.rate += desiredRate;
            existing.level = Math.max(existing.level, level);

            // Update machine count if item has recipes
            if (existing.allRecipes && existing.allRecipes.length > 0) {
                const selectedRecipe = existing.allRecipes[existing.selectedRecipeIndex];
                if (selectedRecipe) {
                    const recipeTimeInMinutes = selectedRecipe.time / SECONDS_PER_MINUTE;
                    const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
                    const machinesNeeded = existing.rate / (product.amount / recipeTimeInMinutes);
                    existing.machineCount = machinesNeeded;
                }
            }
            return;
        }

        // Find recipes for the item
        const allRecipes = findRecipesForItem(itemId);
        const selectedIndex = selectedRecipesMap.get(itemId) ?? 0;
        const selectedRecipe = allRecipes ? allRecipes[selectedIndex] : null;

        // Determine if this is a raw material
        const isRaw = !allRecipes || allRecipes.length === 0 ||
            (selectedRecipe && (!selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0));

        // Add item to the needs map
        allNeedsMap.set(itemId, {
            itemId,
            rate: desiredRate,
            level,
            isRaw,
            isTarget,
            allRecipes: allRecipes || [],
            selectedRecipeIndex: selectedIndex,
            machineCount: 0
        });

        // If item has a recipe, calculate needs for its ingredients
        if (selectedRecipe) {
            const recipeTimeInMinutes = selectedRecipe.time / SECONDS_PER_MINUTE;
            const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
            const machinesNeeded = desiredRate / (product.amount / recipeTimeInMinutes);

            // Update machine count for this item
            const itemData = allNeedsMap.get(itemId);
            itemData.machineCount = machinesNeeded;

            // Calculate needs for ingredients
            let totalInputRate = 0;
            if (selectedRecipe.ingredients) {
                for (const ingredient of selectedRecipe.ingredients) {
                    const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                    totalInputRate += consumptionRate;
                    calculateNeedsRecursive(ingredient.item_id, consumptionRate, level + 1, false);
                }
            }
            itemData.totalInputRate = totalInputRate;
        }
    }

    /**
     * Render the production graph
     */
    function renderGraph() {
        if (!productionGraph) return;
        productionGraph.applyLayout('hierarchical');
        productionGraph.render();
    }

    /**
     * Update the total power consumption display
     */
    function updateTotalPower() {
        if (!allNeedsMap || allNeedsMap.size === 0) return;

        let totalPower = 0;
        allNeedsMap.forEach(itemData => {
            if (itemData.machineCount > 0) {
                const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
                if (recipe) {
                    const power = buildingsData.buildings[recipe.buildingId].power || 0;
                    totalPower += Math.ceil(itemData.machineCount) * power;
                }
            }
        });
        totalPowerEl.textContent = totalPower.toFixed(0);
    }

    // --- PRODUCTION GRAPH CLASS ---
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
        constructor(svg, container, allNeedsMap) {
            this.svg = svg;
            this.container = container;
            this.nodes = new Map();
            this.edges = [];

            // Filter nodes based on display options
            const filteredData = Array.from(allNeedsMap.values()).filter(itemData => {
                if (itemData.isTarget) return true;
                if (itemData.isRaw && !showRawMaterials.checked) return false;
                return true;
            });

            // Create nodes
            filteredData.forEach(itemData => {
                const node = new ProductionNode(itemData, this.container, this);
                this.nodes.set(itemData.itemId, node);
            });

            // Create edges
            allNeedsMap.forEach(itemData => {
                if (itemData.isRaw) return;
                const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
                if (recipe && recipe.ingredients) {
                    const recipeTimeInMinutes = recipe.time / SECONDS_PER_MINUTE;
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
            // Group nodes by level
            const levels = new Map();
            this.nodes.forEach(node => {
                const level = node.data.level;
                if (!levels.has(level)) levels.set(level, []);
                levels.get(level).push(node);
            });

            // Sort levels
            const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
            const nodeWidth = 240;
            const levelHeight = 150;

            // Position nodes
            sortedLevels.forEach((level, index) => {
                const nodes = levels.get(level);
                const totalWidth = nodes.length * nodeWidth;
                const svgWidth = this.svg.clientWidth || 800;
                let startX = (svgWidth - totalWidth) / 2;
                if (startX < 10) startX = 10;

                nodes.forEach(node => {
                    node.x = startX;
                    node.y = index * levelHeight + 100;
                    startX += nodeWidth;
                });
            });
        }

        /**
         * Render the graph
         */
        render() {
            // Clear SVG
            this.svg.innerHTML = '';

            // Render nodes
            this.nodes.forEach(node => node.render());

            // Apply canvas transform
            const transformString = `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`;

            this.svg.style.transform = transformString;
            this.svg.style.transformOrigin = '0 0';

            this.container.style.transform = transformString;
            this.container.style.transformOrigin = '0 0';

            // Create arrow marker
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
            const scale = canvasTransform.scale || 1;

            // Draw edges
            this.edges.forEach(edge => {
                const sourceNode = this.nodes.get(edge.source);
                const targetNode = this.nodes.get(edge.target);
                if (!sourceNode || !targetNode) return;

                // Get node dimensions
                const sourceRect = sourceNode.element.getBoundingClientRect();
                const targetRect = targetNode.element.getBoundingClientRect();

                const sourceWidth = sourceRect.width / scale;
                const sourceHeight = sourceRect.height / scale;
                const targetWidth = targetRect.width / scale;
                const targetHeight = targetRect.height / scale;

                const sourceCenterX = sourceNode.x + sourceWidth / 2;
                const sourceCenterY = sourceNode.y + sourceHeight / 2;
                const targetCenterX = targetNode.x + targetWidth / 2;
                const targetCenterY = targetNode.y + targetHeight / 2;

                // Calculate connection points
                const connectionPoints = this.getConnectionPoints(
                    sourceCenterX, sourceCenterY, sourceWidth, sourceHeight,
                    targetCenterX, targetCenterY, targetWidth, targetHeight
                );

                const startX = connectionPoints.startX;
                const startY = connectionPoints.startY;
                const endX = connectionPoints.endX;
                const endY = connectionPoints.endY;

                // Create path for edge
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

    // --- PRODUCTION NODE CLASS ---
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
            this.data = data;
            this.container = container;
            this.graph = graph;
            this.element = null;
            this.x = 0;
            this.y = 0;
            this.create();
        }

        /**
         * Create the node element
         */
        create() {
            const isRaw = this.data.isRaw;
            const isTarget = this.data.isTarget;
            const itemInfo = itemsData.items[this.data.itemId];

            // Create node element
            const nodeEl = document.createElement('div');
            nodeEl.className = `node ${isRaw ? 'is-raw' : ''} ${isTarget ? 'is-target' : ''}`;
            nodeEl.style.left = `${this.x}px`;
            nodeEl.style.top = `${this.y}px`;

            // Get recipe information
            const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
            const recipe = hasRecipe ? this.data.allRecipes[this.data.selectedRecipeIndex] : null;
            const building = recipe ? buildingsData.buildings[recipe.buildingId] : null;

            // Format item type for display
            const formattedType = itemInfo.type ? itemInfo.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';

            // Create ingredients summary
            let ingredientsSummaryHtml = '';
            if (!isRaw && hasRecipe) {
                const recipeTimeInMinutes = recipe.time / SECONDS_PER_MINUTE;
                const machinesNeeded = this.data.machineCount;

                // Create ingredient elements
                const ingredientElements = recipe.ingredients.map(ing => {
                    const item = itemsData.items[ing.item_id];
                    const consumptionRate = (ing.amount / recipeTimeInMinutes) * machinesNeeded;
                    const imgSrc = item.img ? `images/${item.img}` : 'images/default-item.png';
                    return `
                        <div class="ingredient-summary-item">
                            <img src="${imgSrc}" alt="${item.name}">
                            <span>${consumptionRate.toFixed(1)}</span>
                        </div>
                    `;
                }).join('');

                ingredientsSummaryHtml = `
                    <div class="node-ingredients-summary">
                        <div class="node-ingredients-list">
                            ${ingredientElements}
                        </div>
                        <div class="summary-arrow">→</div>
                        <div class="summary-rate">${this.data.rate.toFixed(2)} / min</div>
                    </div>
                `;
            } else {
                ingredientsSummaryHtml = `
                    <div class="node-ingredients-summary-raw">
                        <div class="summary-rate">${this.data.rate.toFixed(2)} / min</div>
                    </div>
                `;
            }

            // Set node HTML
            nodeEl.innerHTML = `
                <div class="node-header">
                    <img src="images/${itemInfo.img}" class="node-icon" alt="${itemInfo.name}">
                    <div class="node-title-container">
                        <div class="node-title">${itemInfo.name}</div>
                        ${formattedType ? `<div class="node-type">${formattedType}</div>` : ''}
                    </div>
                    <button class="node-delete-btn" data-node-id="${this.data.itemId}" title="Удалить узел и все зависимые">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                ${ingredientsSummaryHtml}
                <div class="node-body">
                    ${hasRecipe ? `
                        <div class="node-machine">
                            <img src="images/${building.img}" class="machine-icon" alt="${building.name}">
                            <div class="machine-info">
                                <div class="machine-name">${building.name}</div>
                                <div class="machine-count">${this.data.machineCount.toFixed(2)}x</div>
                                ${showPower.checked ? `<div class="machine-power"><i class="fas fa-bolt"></i> ${(Math.ceil(this.data.machineCount) * building.power).toFixed(0)}</div>` : ''}
                            </div>
                        </div>
                        ${this.data.allRecipes.length > 1 ? `
                            <div class="recipe-selector" data-node-id="${this.data.itemId}">
                                <span>Recipe: ${this.data.selectedRecipeIndex + 1} / ${this.data.allRecipes.length}</span>
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
         * Set up node interactions
         */
        setupInteractions() {
            // Node dragging
            this.element.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isDraggingNode = this;
                dragStart.mouseX = e.clientX;
                dragStart.mouseY = e.clientY;
                dragStart.nodeX = this.x;
                dragStart.nodeY = this.y;
                this.element.classList.add('is-dragging');
            });

            // Recipe selector
            const selector = this.element.querySelector('.recipe-selector');
            if (selector) {
                selector.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showRecipeDropdown(e);
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
            // Remove any existing dropdowns
            document.querySelectorAll('.recipe-dropdown.is-active').forEach(d => d.remove());

            // Create dropdown
            const dropdown = document.createElement('div');
            dropdown.className = 'recipe-dropdown';

            // Add recipe options
            this.data.allRecipes.forEach((recipe, index) => {
                const option = document.createElement('div');
                option.className = 'recipe-option';
                const building = buildingsData.buildings[recipe.buildingId];

                option.innerHTML = `
                    <div class="recipe-option-header">
                        <img src="images/${building.img}" alt="${building.name}">
                        <span>${building.name}</span>
                    </div>
                    <div class="recipe-option-content">
                        ${this.renderIngredients(recipe.ingredients)}
                        <div class="recipe-arrow">→</div>
                        ${this.renderProducts(recipe.products)}
                    </div>
                `;

                // Add click event to select recipe
                option.addEventListener('click', () => {
                    selectedRecipesMap.set(this.data.itemId, index);
                    calculateProduction();
                });
                dropdown.appendChild(option);
            });

            // Add dropdown to container
            graphContainer.appendChild(dropdown);

            // Position dropdown
            const rect = e.target.getBoundingClientRect();
            const containerRect = graphContainer.getBoundingClientRect();

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
            if (!ingredients) return '';
            return ingredients.map(ing => {
                const item = itemsData.items[ing.item_id];
                const formattedType = item.type ? item.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';

                return `
                    <div class="recipe-component">
                        <img src="images/${item.img}" title="${item.name}: ${ing.amount}">
                        ${formattedType ? `<div class="component-category">${formattedType}</div>` : ''}
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
            if (!products) return '';
            return products.map(prod => {
                const item = itemsData.items[prod.item_id];
                const formattedType = item.type ? item.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';

                return `
                    <div class="recipe-component">
                        <img src="images/${item.img}" title="${item.name}: ${prod.amount}">
                        ${formattedType ? `<div class="component-category">${formattedType}</div>` : ''}
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

    // --- NODE DELETION ---
    // Drag start state
    let dragStart = { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 };

    /**
     * Find all nodes that should be deleted when deleting a specific node
     * @param {string} initialNodeId - ID of the initial node to delete
     * @returns {Set} Set of node IDs to delete
     */
    function findNodesToDelete(initialNodeId) {
        const nodesToDelete = new Set([initialNodeId]);
        const nodesToCheck = [initialNodeId];

        while (nodesToCheck.length > 0) {
            const currentNodeId = nodesToCheck.pop();
            const currentNodeData = allNeedsMap.get(currentNodeId);

            // Skip if node doesn't exist or is a raw material
            if (!currentNodeData || currentNodeData.isRaw) {
                continue;
            }

            const recipe = currentNodeData.allRecipes[currentNodeData.selectedRecipeIndex];
            if (!recipe || !recipe.ingredients) {
                continue;
            }

            // Check each ingredient
            for (const ingredient of recipe.ingredients) {
                const ingredientId = ingredient.item_id;

                // Skip if already marked for deletion
                if (nodesToDelete.has(ingredientId)) {
                    continue;
                }

                // Check if ingredient is used elsewhere
                let isUsedElsewhere = false;
                for (const [otherNodeId, otherNodeData] of allNeedsMap.entries()) {
                    // Skip self and nodes already marked for deletion
                    if (otherNodeId === currentNodeId || nodesToDelete.has(otherNodeId)) {
                        continue;
                    }

                    // Check if other node uses this ingredient
                    const otherRecipe = otherNodeData.allRecipes[otherNodeData.selectedRecipeIndex];
                    if (otherRecipe && otherRecipe.ingredients) {
                        if (otherRecipe.ingredients.some(ing => ing.item_id === ingredientId)) {
                            isUsedElsewhere = true;
                            break;
                        }
                    }
                }

                // If not used elsewhere, mark for deletion
                if (!isUsedElsewhere) {
                    nodesToDelete.add(ingredientId);
                    nodesToCheck.push(ingredientId);
                }
            }
        }

        return nodesToDelete;
    }

    /**
     * Delete a node and all its dependent nodes
     * @param {string} nodeId - ID of the node to delete
     */
    function deleteNodeAndDependents(nodeId) {
        // Find all nodes to delete
        const nodesToDelete = findNodesToDelete(nodeId);

        // Clear the graph
        graphSvg.innerHTML = '';
        while (nodesContainer.firstChild) {
            nodesContainer.removeChild(nodesContainer.firstChild);
        }

        // Remove nodes from the needs map
        nodesToDelete.forEach(idToDelete => {
            allNeedsMap.delete(idToDelete);
        });

        // If deleted node was the target, reset target
        if (currentTargetItem && currentTargetItem.id === nodeId) {
            currentTargetItem = null;
            selectedItemName.textContent = 'Choose a recipe...';
        }

        // Recreate graph if there are still nodes
        if (allNeedsMap.size > 0) {
            productionGraph = new ProductionGraph(graphSvg, nodesContainer, allNeedsMap);
            renderGraph();
            updateTotalPower();
        } else {
            productionGraph = null;
            totalPowerEl.textContent = '0';
        }
    }

    // --- GRAPH RESET ---
    /**
     * Reset the graph
     */
    function resetGraph() {
        graphSvg.innerHTML = '';
        while (nodesContainer.firstChild) {
            nodesContainer.removeChild(nodesContainer.firstChild);
        }
        productionGraph = null;
        totalPowerEl.textContent = '0';
    }

    // --- CANVAS INTERACTION ---
    /**
     * Handle mouse down on canvas
     * @param {Event} e - Mouse event
     */
    function handleCanvasMouseDown(e) {
        // Ignore if clicking on a node
        if (e.target.closest('.node')) {
            return;
        }

        // Start panning
        isPanningCanvas = true;
        panStart.x = e.clientX - canvasTransform.x;
        panStart.y = e.clientY - canvasTransform.y;
        graphContainer.style.cursor = 'grabbing';
    }

    /**
     * Handle mouse move
     * @param {Event} e - Mouse event
     */
    function handleMouseMove(e) {
        // Handle node dragging
        if (isDraggingNode) {
            const deltaX = (e.clientX - dragStart.mouseX) / canvasTransform.scale;
            const deltaY = (e.clientY - dragStart.mouseY) / canvasTransform.scale;

            isDraggingNode.x = dragStart.nodeX + deltaX;
            isDraggingNode.y = dragStart.nodeY + deltaY;

            isDraggingNode.render();
            if (productionGraph) productionGraph.render();
        }
        // Handle canvas panning
        else if (isPanningCanvas) {
            canvasTransform.x = e.clientX - panStart.x;
            canvasTransform.y = e.clientY - panStart.y;
            if (productionGraph) productionGraph.render();
        }
    }

    /**
     * Handle mouse up
     */
    function handleMouseUp() {
        // Stop dragging node
        if (isDraggingNode) {
            isDraggingNode.element.classList.remove('is-dragging');
            isDraggingNode = null;
        }
        // Stop panning canvas
        if (isPanningCanvas) {
            isPanningCanvas = false;
            graphContainer.style.cursor = 'grab';
        }
    }

    /**
     * Handle wheel event for zooming
     * @param {Event} e - Wheel event
     */
    function handleWheel(e) {
        // Ignore if hovering over dropdown
        if (e.target.closest('.recipe-dropdown')) {
            return;
        }

        e.preventDefault();
        if (!productionGraph) return;

        // Calculate new scale
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = canvasTransform.scale * delta;
        if (newScale < 0.2 || newScale > 3) return;

        // Calculate new transform
        const rect = graphContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        canvasTransform.x = x - (x - canvasTransform.x) * delta;
        canvasTransform.y = y - (y - canvasTransform.y) * delta;
        canvasTransform.scale = newScale;

        // Re-render graph
        if (productionGraph) productionGraph.render();
    }

    // --- HELPER FUNCTIONS ---
    /**
     * Get all items from itemsData
     * @returns {Array} Array of all items
     */
    function getAllItems() {
        if (!itemsData || !itemsData.items) {
            console.error('itemsData or itemsData.items is not defined');
            return [];
        }
        return Object.keys(itemsData.items).map(itemId => ({
            id: itemId,
            ...itemsData.items[itemId]
        }));
    }

    /**
     * Find all recipes for an item
     * @param {string} itemId - ID of the item
     * @returns {Array|null} Array of recipes or null if none found
     */
    function findRecipesForItem(itemId) {
        const recipes = [];
        for (const buildingId in buildingsData.buildings) {
            const building = buildingsData.buildings[buildingId];
            if (!building.modes) continue;
            for (const modeId in building.modes) {
                const mode = building.modes[modeId];
                if (!mode.recipes) continue;
                for (const recipe of mode.recipes) {
                    if (recipe.products && Array.isArray(recipe.products) && recipe.products.some(p => p.item_id === itemId)) {
                        recipe.buildingId = buildingId;
                        recipes.push(recipe);
                    }
                }
            }
        }
        return recipes.length > 0 ? recipes : null;
    }

    /**
     * Show or hide loading message
     * @param {boolean} show - Whether to show the loading message
     */
    function showLoading(show) {
        loadingMessage.style.display = show ? 'flex' : 'none';
    }

    /**
     * Reset the entire application
     */
    function resetApp() {
        currentTargetItem = null;
        selectedItemName.textContent = 'Choose a recipe...';
        allNeedsMap.clear();
        selectedRecipesMap.clear();
        canvasTransform = { x: 0, y: 0, scale: 1 };

        // Clear graph
        graphSvg.innerHTML = '';
        while (nodesContainer.firstChild) {
            nodesContainer.removeChild(nodesContainer.firstChild);
        }

        productionGraph = null;
        totalPowerEl.textContent = '0';
        noRecipeMessage.style.display = 'none';
    }

    // --- START THE APP ---
    initializeApp();
});