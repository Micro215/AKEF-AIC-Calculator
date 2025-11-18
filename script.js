document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTS ---
    const itemSearch = document.getElementById('item-selector-search');
    const itemDropdown = document.getElementById('item-selector-dropdown');
    const amountInput = document.getElementById('amount-input');
    const calculateBtn = document.getElementById('calculate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const modalClose = document.querySelector('.modal-close');
    
    const showRawMaterials = document.getElementById('show-raw-materials');
    const showPower = document.getElementById('show-power');
    
    const graphContainer = document.getElementById('graph-container');
    const graphSvg = document.getElementById('graph-svg');
    const nodesContainer = document.getElementById('nodes-container');
    const loadingMessage = document.getElementById('loading-message');
    const noRecipeMessage = document.getElementById('no-recipe-message');
    const totalPowerEl = document.getElementById('total-power');

    // --- STATE ---
    let itemsData = {};
    let buildingsData = {};
    let productionGraph = null;
    let selectedRecipesMap = new Map();
    let allNeedsMap = new Map();
    let currentTargetItem = null;
    
    // Interaction state
    let isDraggingNode = null;
    let isPanningCanvas = false;
    let panStart = { x: 0, y: 0 };
    let canvasTransform = { x: 0, y: 0, scale: 1 };
    const SECONDS_PER_MINUTE = 60;
    
    // Debounce function for search optimization
    let searchTimeout;
    function debounce(func, delay) {
        return function(...args) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // --- INITIALIZATION ---
    async function initializeApp() {
        itemSearch.disabled = true;
        itemSearch.placeholder = 'Loading data...';
        calculateBtn.disabled = true;

        try {
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch('db/items.json'), 
                fetch('db/buildings.json')
            ]);
            if (!itemsResponse.ok || !buildingsResponse.ok) {
                throw new Error('Failed to load data files.');
            }
            
            itemsData = await itemsResponse.json();
            buildingsData = await buildingsResponse.json();
            
            setupEventListeners();
            itemSearch.disabled = false;
            itemSearch.placeholder = 'e.g., Ferrium';
            calculateBtn.disabled = false;

        } catch (error) {
            console.error("Initialization failed:", error);
            itemSearch.value = "";
            itemSearch.placeholder = 'Could not load data';
        }
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        const debouncedSearch = debounce(handleItemSearch, 300);
        itemSearch.addEventListener('input', debouncedSearch);
        itemSearch.addEventListener('focus', () => {
            const query = itemSearch.value.toLowerCase().trim();
            const allItems = getAllItems();
            const filteredItems = query
                ? allItems.filter(item => item.name.toLowerCase().includes(query))
                : allItems;
            renderDropdown(filteredItems);
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.control-group')) {
                itemDropdown.classList.remove('is-active');
            }
        });
        itemDropdown.addEventListener('click', (e) => e.stopPropagation());
    
        calculateBtn.addEventListener('click', calculateProduction);
        resetBtn.addEventListener('click', resetApp);
        helpBtn.addEventListener('click', () => helpModal.classList.add('is-active'));
        modalClose.addEventListener('click', () => helpModal.classList.remove('is-active'));
        
        showRawMaterials.addEventListener('change', () => { if (productionGraph) renderGraph(); });
        showPower.addEventListener('change', () => { if (productionGraph) renderGraph(); });

        graphContainer.addEventListener('mousedown', handleCanvasMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        graphContainer.addEventListener('wheel', handleWheel, { passive: false });
    }

    // --- SEARCH & ITEM SELECTION ---
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

    function renderDropdown(items) {
        itemDropdown.innerHTML = '';
        if (!items || items.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-item no-results';
            noResults.textContent = 'No items found';
            itemDropdown.appendChild(noResults);
            itemDropdown.classList.add('is-active');
            return;
        }
        
        items.sort((a, b) => a.name.localeCompare(b.name));
        
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            const imgSrc = item.img ? `images/${item.img}` : 'images/default-item.png';
            div.innerHTML = `<img src="${imgSrc}" alt="${item.name}"> ${item.name}`;
            div.addEventListener('click', () => selectItem(item));
            itemDropdown.appendChild(div);
        });
        
        itemDropdown.classList.add('is-active');
    }

    function handleItemSearch(e) {
        const query = e.target.value.toLowerCase().trim();
        const allItems = getAllItems();
        const filteredItems = query
            ? allItems.filter(item => item.name && item.name.toLowerCase().includes(query))
            : allItems;
        renderDropdown(filteredItems);
    }

    function selectItem(item) {
        currentTargetItem = item;
        itemSearch.value = item.name;
        itemDropdown.classList.remove('is-active');
    }

    // --- PRODUCTION LOGIC ---
    function calculateProduction() {
        if (!currentTargetItem) {
            alert('Please select an item to produce.');
            return;
        }
        const targetRate = parseFloat(amountInput.value);
        if (isNaN(targetRate) || targetRate <= 0) {
            alert('Please enter a valid production rate.');
            return;
        }

        showLoading(true);
        noRecipeMessage.style.display = 'none';
        graphSvg.innerHTML = '';
        nodesContainer.innerHTML = '';

        setTimeout(() => {
            allNeedsMap.clear();
            calculateNeedsRecursive(currentTargetItem.id, targetRate);
            
            if (allNeedsMap.size === 0) {
                showLoading(false);
                noRecipeMessage.style.display = 'block';
                productionGraph = null;
                return;
            }

            productionGraph = new ProductionGraph(graphSvg, nodesContainer, allNeedsMap);
            renderGraph();
            updateTotalPower();
            showLoading(false);
        }, 100);
    }
    
    function calculateNeedsRecursive(itemId, desiredRate, level = 0, isTarget = false) {
        if (allNeedsMap.has(itemId)) {
            const existing = allNeedsMap.get(itemId);
            const oldRate = existing.rate;
            existing.rate += desiredRate;
            existing.level = Math.max(existing.level, level);

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
    
        const allRecipes = findRecipesForItem(itemId);
        const selectedIndex = selectedRecipesMap.get(itemId) ?? 0;
        const selectedRecipe = allRecipes ? allRecipes[selectedIndex] : null;
    
        const isRaw = !allRecipes || allRecipes.length === 0 || 
                        (selectedRecipe && (!selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0));
    
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
    
        if (selectedRecipe) {
            const recipeTimeInMinutes = selectedRecipe.time / SECONDS_PER_MINUTE;
            const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
            const machinesNeeded = desiredRate / (product.amount / recipeTimeInMinutes);
    
            const itemData = allNeedsMap.get(itemId);
            itemData.machineCount = machinesNeeded;
    
            if (!isRaw && selectedRecipe.ingredients) {
                for (const ingredient of selectedRecipe.ingredients) {
                    const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                    calculateNeedsRecursive(ingredient.item_id, consumptionRate, level + 1, false);
                }
            }
        }
    }
    
    function renderGraph() {
        if (!productionGraph) return;
        productionGraph.applyLayout('hierarchical');
        productionGraph.render();
    }

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

    // --- GRAPH CLASS ---
    class ProductionGraph {
        constructor(svg, container, allNeedsMap) {
            this.svg = svg;
            this.container = container;
            this.nodes = new Map();
            this.edges = [];
            
            const filteredData = Array.from(allNeedsMap.values()).filter(itemData => {
                if (itemData.isTarget) return true;
                if (itemData.isRaw && !showRawMaterials.checked) return false;
                return true;
            });

            filteredData.forEach(itemData => {
                const node = new ProductionNode(itemData, this.container, this);
                this.nodes.set(itemData.itemId, node);
            });

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

        applyLayout(type) {
            const levels = new Map();
            this.nodes.forEach(node => {
                const level = node.data.level;
                if (!levels.has(level)) levels.set(level, []);
                levels.get(level).push(node);
            });
            
            const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
            const nodeWidth = 240;
            const levelHeight = 150;

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

        render() {
            this.svg.innerHTML = '';
            this.nodes.forEach(node => node.render());

            const transformString = `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`;

            this.svg.style.transform = transformString;
            this.svg.style.transformOrigin = '0 0';

            this.container.style.transform = transformString;
            this.container.style.transformOrigin = '0 0';

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

            this.edges.forEach(edge => {
                const sourceNode = this.nodes.get(edge.source);
                const targetNode = this.nodes.get(edge.target);
                if (!sourceNode || !targetNode) return;

                const startX = sourceNode.x + 110;
                const startY = sourceNode.y + 40;
                const endX = targetNode.x + 110;
                const endY = targetNode.y;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const d = `M ${startX} ${startY} L ${endX} ${endY}`;
                path.setAttribute('d', d);
                path.setAttribute('class', 'edge-path');
                path.setAttribute('marker-end', 'url(#arrowhead)');
                this.svg.appendChild(path);

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', (startX + endX) / 2);
                label.setAttribute('y', (startY + endY) / 2);
                label.setAttribute('class', 'edge-label');
                label.textContent = `${edge.amount.toFixed(1)}/min`;
                this.svg.appendChild(label);
            });
        }
    }

    // --- NODE CLASS ---
    class ProductionNode {
        constructor(data, container, graph) {
            this.data = data;
            this.container = container;
            this.graph = graph;
            this.element = null;
            this.x = 0;
            this.y = 0;
            this.create();
        }

        create() {
            const isRaw = this.data.isRaw;
            const isTarget = this.data.isTarget;
            const itemInfo = itemsData.items[this.data.itemId];
            
            const nodeEl = document.createElement('div');
            nodeEl.className = `node ${isRaw ? 'is-raw' : ''} ${isTarget ? 'is-target' : ''}`;
            nodeEl.style.left = `${this.x}px`;
            nodeEl.style.top = `${this.y}px`;

            const hasRecipe = this.data.allRecipes && this.data.allRecipes.length > 0;
            const recipe = hasRecipe ? this.data.allRecipes[this.data.selectedRecipeIndex] : null;
            const building = recipe ? buildingsData.buildings[recipe.buildingId] : null;
        
            nodeEl.innerHTML = `
                <div class="node-header">
                    <img src="images/${itemInfo.img}" class="node-icon" alt="${itemInfo.name}">
                    <div class="node-title">${itemInfo.name}</div>
                    <div class="node-rate">${this.data.rate.toFixed(2)} / min</div>
                </div>
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

        setupInteractions() {
            this.element.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isDraggingNode = this;
                dragStart.mouseX = e.clientX;
                dragStart.mouseY = e.clientY;
                dragStart.nodeX = this.x;
                dragStart.nodeY = this.y;
                this.element.classList.add('is-dragging');
            });

            const selector = this.element.querySelector('.recipe-selector');
            if (selector) {
                selector.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showRecipeDropdown(e);
                });
            }
        }
        
        showRecipeDropdown(e) {
            document.querySelectorAll('.recipe-dropdown.is-active').forEach(d => d.remove());
            const dropdown = document.createElement('div');
            dropdown.className = 'recipe-dropdown';
            
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
                option.addEventListener('click', () => {
                    selectedRecipesMap.set(this.data.itemId, index);
                    calculateProduction();
                });
                dropdown.appendChild(option);
            });

            graphContainer.appendChild(dropdown);
            
            const rect = e.target.getBoundingClientRect();
            const containerRect = graphContainer.getBoundingClientRect();
            
            dropdown.style.left = `${rect.left - containerRect.left}px`;
            dropdown.style.top = `${rect.bottom - containerRect.top}px`;
            dropdown.classList.add('is-active');

            const closeDropdown = (e) => {
                if (!dropdown.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', closeDropdown);
                }
            };
            setTimeout(() => document.addEventListener('click', closeDropdown), 100);
        }

        renderIngredients(ingredients) {
            if (!ingredients) return '';
            return ingredients.map(ing => {
                const item = itemsData.items[ing.item_id];
                return `<img src="images/${item.img}" title="${item.name}: ${ing.amount}">`;
            }).join('');
        }
        
        renderProducts(products) {
            if (!products) return '';
            return products.map(prod => {
                const item = itemsData.items[prod.item_id];
                return `<img src="images/${item.img}" title="${item.name}: ${prod.amount}">`;
            }).join('');
        }

        render() {
            this.element.style.left = `${this.x}px`;
            this.element.style.top = `${this.y}px`;
        }
    }

    let dragStart = { mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 };

    function handleCanvasMouseDown(e) {
        if (e.target.closest('.node')) {
            return;
        }

        isPanningCanvas = true;
        panStart.x = e.clientX - canvasTransform.x;
        panStart.y = e.clientY - canvasTransform.y;
        graphContainer.style.cursor = 'grabbing';
    }

    function handleMouseMove(e) {
        if (isDraggingNode) {
            const deltaX = (e.clientX - dragStart.mouseX) / canvasTransform.scale;
            const deltaY = (e.clientY - dragStart.mouseY) / canvasTransform.scale;

            isDraggingNode.x = dragStart.nodeX + deltaX;
            isDraggingNode.y = dragStart.nodeY + deltaY;
            
            isDraggingNode.render();
            if (productionGraph) productionGraph.render();
        } else if (isPanningCanvas) {
            canvasTransform.x = e.clientX - panStart.x;
            canvasTransform.y = e.clientY - panStart.y;
            if (productionGraph) productionGraph.render();
        }
    }

    function handleMouseUp() {
        if (isDraggingNode) {
            isDraggingNode.element.classList.remove('is-dragging');
            isDraggingNode = null;
        }
        if (isPanningCanvas) {
            isPanningCanvas = false;
            graphContainer.style.cursor = 'grab';
        }
    }

    function handleWheel(e) {
        if (e.target.closest('.recipe-dropdown')) {
            return;
        }

        e.preventDefault();
        if (!productionGraph) return;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = canvasTransform.scale * delta;
        if (newScale < 0.2 || newScale > 3) return;

        const rect = graphContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        canvasTransform.x = x - (x - canvasTransform.x) * delta;
        canvasTransform.y = y - (y - canvasTransform.y) * delta;
        canvasTransform.scale = newScale;
        
        if (productionGraph) productionGraph.render();
    }
    
    // --- HELPERS ---
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

    function showLoading(show) {
        loadingMessage.style.display = show ? 'flex' : 'none';
    }
    
    function resetApp() {
        currentTargetItem = null;
        itemSearch.value = '';
        itemDropdown.innerHTML = '';
        itemDropdown.classList.remove('is-active');
        graphSvg.innerHTML = '';
        nodesContainer.innerHTML = '';
        productionGraph = null;
        selectedRecipesMap.clear();
        canvasTransform = { x: 0, y: 0, scale: 1 };
        totalPowerEl.textContent = '0';
        noRecipeMessage.style.display = 'none';
    }

    // --- START THE APP ---
    initializeApp();
});