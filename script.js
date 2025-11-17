document.addEventListener('DOMContentLoaded', () => {
    // --- Control elements ---
    const itemSelect = document.getElementById('item-select');
    const amountInput = document.getElementById('amount-input');
    const calculateBtn = document.getElementById('calculate-btn');
    const nodesContainer = document.getElementById('nodes-container');
    const linesSvg = document.getElementById('lines-svg');
    const loadingMessage = document.getElementById('loading-message');
    const noRecipeMessage = document.getElementById('no-recipe-message');

    // --- Global variabels ---
    let itemsData = {};
    let buildingsData = {};
    let allNeedsMap = new Map();
    const selectedRecipesMap = new Map(); // Persistent: itemId -> selectedRecipeIndex
    const SECONDS_PER_MINUTE = 60;

    // --- Data load ---
    async function loadData() {
        try {
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch('db/items.json'), fetch('db/buildings.json')
            ]);
            itemsData = await itemsResponse.json();
            buildingsData = await buildingsResponse.json();
            populateItemSelect();
        } catch (error) {
            itemSelect.innerHTML = `<option value="">Error: ${error.message}</option>`;
        }
    }

    function populateItemSelect() {
        itemSelect.innerHTML = '<option value="">Choose item...</option>';
        for (const itemId in itemsData.items) {
            const item = itemsData.items[itemId];
            const option = document.createElement('option');
            option.value = itemId;
            option.textContent = item.name;
            itemSelect.appendChild(option);
        }
    }

    // --- Main logic ---
    function calculateProduction() {
        const targetItemId = itemSelect.value;
        const targetRatePerMinute = parseFloat(amountInput.value);
        if (!targetItemId || isNaN(targetRatePerMinute) || targetRatePerMinute <= 0) { alert('Wrong input.'); return; }

        loadingMessage.style.display = 'block';
        nodesContainer.style.display = 'none';
        noRecipeMessage.style.display = 'none';

        setTimeout(() => {
            allNeedsMap.clear();

            calculateNeedsRecursive(targetItemId, targetRatePerMinute);

            if (allNeedsMap.size > 0) {
                const groupedByLevel = groupByLevel();

                renderGraph(groupedByLevel);
                nodesContainer.style.display = 'flex';
            } else {
                noRecipeMessage.style.display = 'block';
            }
            loadingMessage.style.display = 'none';
        }, 100);
    }

    function calculateNeedsRecursive(itemId, desiredRate, level = 0) {
        if (allNeedsMap.has(itemId)) {
            const existing = allNeedsMap.get(itemId);
            existing.rate += desiredRate;
            existing.level = Math.max(existing.level, level);
            return;
        }

        const allRecipes = findRecipesForItem(itemId);
        const isRawMaterial = !allRecipes || allRecipes.length === 0;
        const selectedIndex = selectedRecipesMap.get(itemId) ?? 0;
        const selectedRecipe = allRecipes ? allRecipes[selectedIndex] : null;

        allNeedsMap.set(itemId, {
            itemId,
            rate: desiredRate,
            level,
            isRawMaterial,
            allRecipes: allRecipes || [],
            selectedRecipeIndex: selectedIndex,
            machineCount: 0,
            machineName: '',
            machineImg: ''
        });

        if (!isRawMaterial && selectedRecipe) {
            const recipeTimeInMinutes = selectedRecipe.time / SECONDS_PER_MINUTE;
            const product = selectedRecipe.products.find(p => p.item_id === itemId) || selectedRecipe.products[0];
            const machinesNeeded = desiredRate / (product.amount / recipeTimeInMinutes);
            const buildingData = findBuildingDataForRecipe(selectedRecipe);

            const itemData = allNeedsMap.get(itemId);
            itemData.machineCount = machinesNeeded;
            itemData.machineName = buildingData.name;
            itemData.machineImg = buildingData.img;

            if (selectedRecipe.ingredients) {
                for (const ingredient of selectedRecipe.ingredients) {
                    const consumptionRate = (ingredient.amount / recipeTimeInMinutes) * machinesNeeded;
                    calculateNeedsRecursive(ingredient.item_id, consumptionRate, level + 1);
                }
            }
        }
    }

    function groupByLevel() {
        const grouped = new Map();
        for (const data of allNeedsMap.values()) {
            if (!grouped.has(data.level)) {
                grouped.set(data.level, []);
            }
            grouped.get(data.level).push(data);
        }
        return grouped;
    }

    function renderGraph(groupedByLevel) {
        nodesContainer.innerHTML = '';
        linesSvg.innerHTML = '';
        const allRenderedNodes = [];

        const sortedLevels = Array.from(groupedByLevel.keys()).sort((a, b) => a - b);

        sortedLevels.forEach(level => {
            const row = document.createElement('div');
            row.className = 'node-row';
            row.dataset.level = level;

            const itemsAtLevel = groupedByLevel.get(level);
            itemsAtLevel.forEach(itemData => {
                const nodeElement = createNodeElement(itemData);
                row.appendChild(nodeElement);
                allRenderedNodes.push({ element: nodeElement, data: itemData });
            });

            nodesContainer.appendChild(row);
        });

        setTimeout(() => drawLines(allRenderedNodes), 0);
    }

    function createNodeElement(itemData) {
        const isRaw = itemData.isRawMaterial;
        const itemInfo = itemsData.items[itemData.itemId];

        const container = document.createElement('div');
        container.className = 'node-container';
        container.setAttribute('data-node-id', itemData.itemId);

        // Узел предмета (выход)
        const itemDiv = document.createElement('div');
        itemDiv.className = `node-item ${isRaw ? 'raw-material' : ''}`;
        itemDiv.innerHTML = `
            <div class="tree-node-content">
                <img src="images/${itemInfo ? itemInfo.img : 'placeholder.png'}" alt="${itemInfo ? itemInfo.name : itemData.itemId}">
                <div class="tree-node-name">${itemInfo ? itemInfo.name : itemData.itemId}</div>
                <div class="tree-node-rate">${itemData.rate.toFixed(2)} / min</div>
            </div>
        `;
        container.appendChild(itemDiv);

        // Узел машины (если не сырье)
        if (!isRaw) {
            const machineDiv = document.createElement('div');
            machineDiv.className = 'node-machine';
            machineDiv.innerHTML = `
                <div class="tree-node-content">
                    <img src="images/${itemData.machineImg || 'placeholder.png'}" alt="${itemData.machineName}">
                    <div class="tree-node-name">${itemData.machineName}</div>
                    <div class="tree-node-rate">${itemData.machineCount.toFixed(2)} pcs.</div>
                </div>
            `;
            container.appendChild(machineDiv);

            if (itemData.allRecipes.length > 1) {
                console.log(`[DEBUG] Создаю селектор для "${itemData.itemId}", recipes finded: ${itemData.allRecipes.length}`);
                const selector = document.createElement('select');
                selector.className = 'recipe-selector';
                itemData.allRecipes.forEach((r, index) => {
                    const option = document.createElement('option');
                    option.textContent = `На: ${r.buildingName}`;
                    option.value = index;
                    option.selected = index === itemData.selectedRecipeIndex;
                    selector.appendChild(option);
                });

                selector.addEventListener('change', (e) => {
                    const newIndex = parseInt(e.target.value);
                    selectedRecipesMap.set(itemData.itemId, newIndex);
                    calculateProduction();
                });
                machineDiv.appendChild(selector);
            }
        }
        return container;
    }

    function drawLines(renderedNodes) {
        linesSvg.innerHTML = '';
        const svgRect = linesSvg.getBoundingClientRect();

        const nodeMap = new Map(renderedNodes.map(n => [n.data.itemId, n]));

        renderedNodes.forEach(node => {
            if (node.data.isRawMaterial) return;

            const machineElement = node.element.querySelector('.node-machine');
            if (!machineElement) return;

            const machineRect = machineElement.getBoundingClientRect();
            const machineCenterX = machineRect.left + machineRect.width / 2 - svgRect.left;
            const machineBottomY = machineRect.bottom - svgRect.top;

            const currentRecipe = node.data.allRecipes[node.data.selectedRecipeIndex];
            if (!currentRecipe || !currentRecipe.ingredients) return;

            currentRecipe.ingredients.forEach(ingredient => {
                const childNode = nodeMap.get(ingredient.item_id);
                if (!childNode) return;

                const childItemElement = childNode.element.querySelector('.node-item');
                const childRect = childItemElement.getBoundingClientRect();
                const childCenterX = childRect.left + childRect.width / 2 - svgRect.left;
                const childTopY = childRect.top - svgRect.top;

                // Кривая Безье для более "древовидного" вида
                const midY = (machineBottomY + childTopY) / 2;
                const d = `M ${machineCenterX} ${machineBottomY} C ${machineCenterX} ${midY}, ${childCenterX} ${midY}, ${childCenterX} ${childTopY}`;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('stroke', '#ccc');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('fill', 'none');
                linesSvg.appendChild(path);
            });
        });
    }

    // --- Help funcs ---
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
                        recipe.buildingName = building.name;
                        recipe.buildingImg = building.img;
                        recipes.push(recipe);
                    }
                }
            }
        }
        return recipes.length > 0 ? recipes : null;
    }

    function findBuildingDataForRecipe(recipe) {
        return {
            name: recipe.buildingName,
            img: recipe.buildingImg
        };
    }

    // --- Run ---
    calculateBtn.addEventListener('click', calculateProduction);
    loadData();
});