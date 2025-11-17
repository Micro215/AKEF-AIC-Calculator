document.addEventListener('DOMContentLoaded', () => {
    // --- Control elements ---
    const categorySelector = document.getElementById('category-selector');
    const categoryOptions = document.getElementById('category-options');
    const categorySelectedText = document.getElementById('category-selected-text');

    const itemSelector = document.getElementById('item-selector');
    const itemOptions = document.getElementById('item-options');
    const itemSelectedText = document.getElementById('item-selected-text');
    
    const amountInput = document.getElementById('amount-input');
    const calculateBtn = document.getElementById('calculate-btn');
    const nodesContainer = document.getElementById('nodes-container');
    const linesSvg = document.getElementById('lines-svg');
    const loadingMessage = document.getElementById('loading-message');
    const noRecipeMessage = document.getElementById('no-recipe-message');

    const totalPowerDiv = document.getElementById('total-power');

    // --- Global variables ---
    let itemsData = {};
    let buildingsData = {};
    let allNeedsMap = new Map();
    const selectedRecipesMap = new Map(); //itemId -> selectedRecipeIndex
    const SECONDS_PER_MINUTE = 60;

    // --- Custom selector control ---
    function setupCustomSelect(selector, optionsContainer, selectedTextSpan, onOptionClick) {
        const styledDiv = selector.querySelector('.select-styled');
        
        styledDiv.addEventListener('click', () => {
            document.querySelectorAll('.custom-select.active').forEach(s => {
                if (s !== selector) s.classList.remove('active');
            });
            selector.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target)) {
                selector.classList.remove('active');
            }
        });
    }

    function addOption(container, text, value, imgSrc, onClick) {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.textContent = text;
        if (imgSrc) {
            const img = document.createElement('img');
            img.src = `images/${imgSrc}`;
            img.alt = text;
            option.prepend(img);
        }
        option.addEventListener('click', () => {
            container.parentElement.setAttribute('data-selected-value', value);
            onClick(value, text);
        });
        container.appendChild(option);
    }

    function clearOptions(container) {
        container.innerHTML = '';
    }

    // --- Data load ---
    async function loadData() {
        try {
            const [itemsResponse, buildingsResponse] = await Promise.all([
                fetch('db/items.json'), fetch('db/buildings.json')
            ]);
            if (!itemsResponse.ok || !buildingsResponse.ok) throw new Error(`Data loading error.`);
            itemsData = await itemsResponse.json();
            buildingsData = await buildingsResponse.json();
            
            populateCategories();
        } catch (error) {
            categorySelectedText.textContent = `Error: ${error.message}`;
        }
    }

    function populateCategories() {
        const categories = new Set();
        for (const itemId in itemsData.items) {
            categories.add(itemsData.items[itemId].type);
        }

        clearOptions(categoryOptions);
        addOption(categoryOptions, 'Choose category...', '', null, () => {
            categorySelectedText.textContent = 'Choose category...';
            itemSelectedText.textContent = 'Choose item first...';
            clearOptions(itemOptions);
            itemSelector.classList.remove('active');
        });

        Array.from(categories).sort().forEach(category => {
            const displayText = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            addOption(categoryOptions, displayText, category, null, (value, text) => {
                categorySelectedText.textContent = text;
                populateItems(value);
                itemSelector.classList.remove('active');
            });
        });
    }

    function populateItems(category) {
        clearOptions(itemOptions);
        if (!category) {
            itemSelectedText.textContent = 'Choose item first...';
            return;
        }

        const itemsInCategory = [];
        for (const itemId in itemsData.items) {
            if (itemsData.items[itemId].type === category) {
                itemsInCategory.push({ id: itemId, ...itemsData.items[itemId] });
            }
        }

        itemsInCategory.sort((a, b) => a.name.localeCompare(b.name));

        if (itemsInCategory.length > 0) {
            addOption(itemOptions, itemsInCategory[0].name, itemsInCategory[0].id, itemsInCategory[0].img, (value, text) => {
                itemSelectedText.textContent = text;
                itemSelector.classList.remove('active');
            });
        } else {
            itemSelectedText.textContent = 'No items in this category';
        }
        
        itemsInCategory.forEach(item => {
            addOption(itemOptions, item.name, item.id, item.img, (value, text) => {
                itemSelectedText.textContent = text;
                itemSelector.classList.remove('active');
            });
        });
    }

    // --- Main logic ---
    function calculateProduction() {
        const itemValue = itemSelectedText.textContent; 
        const targetItemId = itemSelector.getAttribute('data-selected-value') || '';
        const targetRatePerMinute = parseFloat(amountInput.value);
        if (!targetItemId || isNaN(targetRatePerMinute) || targetRatePerMinute <= 0) {
            alert('Wrong input.');
            return;
        }

        loadingMessage.style.display = 'block';
        nodesContainer.style.display = 'none';
        noRecipeMessage.style.display = 'none';
        totalPowerDiv.innerHTML = '';

        setTimeout(() => {
            allNeedsMap.clear();

            calculateNeedsRecursive(targetItemId, targetRatePerMinute);

            if (allNeedsMap.size > 0) {
                const groupedByLevel = groupByLevel();

                renderGraph(groupedByLevel);
                nodesContainer.style.display = 'flex';

                let totalPower = 0;
                allNeedsMap.forEach(itemData => {
                    if (!itemData.isRawMaterial) {
                        const ceiledCount = Math.ceil(itemData.machineCount);
                        totalPower += ceiledCount * itemData.powerPerMachine;
                    }
                });
                totalPowerDiv.innerHTML = `Energy consumption: ${totalPower.toFixed(0)}`;
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
            machineImg: '',
            powerPerMachine: 0
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
            itemData.powerPerMachine = buildingsData.buildings[selectedRecipe.buildingId].power || 0;

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

        if (!isRaw) {
            const ceiledCount = itemData.machineCount;
            const totalPower = Math.ceil(ceiledCount) * itemData.powerPerMachine;

            const machineDiv = document.createElement('div');
            machineDiv.className = 'node-machine';
            machineDiv.innerHTML = `
                <div class="tree-node-content">
                    <img src="images/${itemData.machineImg || 'placeholder.png'}" alt="${itemData.machineName}">
                    <div class="tree-node-name">${itemData.machineName}</div>
                    <div class="tree-node-rate">${ceiledCount.toFixed(2)} pcs.</div>
                    <div class="tree-node-power">Energy: ${totalPower.toFixed(0)}</div>
                </div>
            `;
            container.appendChild(machineDiv);

            if (itemData.allRecipes.length > 1) {
                const selector = document.createElement('select');
                selector.className = 'recipe-selector';
                itemData.allRecipes.forEach((r, index) => {
                    const option = document.createElement('option');
                    option.textContent = `${r.buildingName} (${r.power} Вт)`;
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
                        recipe.buildingId = buildingId;
                        recipe.power = building.power || 0;
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
    setupCustomSelect(categorySelector, categoryOptions, categorySelectedText);
    setupCustomSelect(itemSelector, itemOptions, itemSelectedText);

    calculateBtn.addEventListener('click', calculateProduction);
    loadData();
});