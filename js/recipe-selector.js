/**
 * Render recipe categories and set up category tabs
 */
function renderRecipeCategories() {
    const app = window.productionApp;
    
    // Clear and rebuild categories
    app.allCategories.clear();
    getAllItems().forEach(item => {
        if (item.type) {
            app.allCategories.add(item.type);
        }
    });

    // Create "All" tab
    app.categoryTabs.innerHTML = `<button class="category-tab active" data-category="all">${window.localization.t('app.all')}</button>`;

    // Create category tabs
    app.allCategories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        tab.setAttribute('data-category', category);
        // Use localized category name
        tab.textContent = window.localization.getItemTypeName(category);
        app.categoryTabs.appendChild(tab);
    });

    // Add click event to tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            app.currentCategory = tab.getAttribute('data-category');
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
    const app = window.productionApp;
    const allItems = getAllItems();
    let filteredItems = allItems;

    // Filter by category
    if (app.currentCategory !== 'all') {
        filteredItems = filteredItems.filter(item => item.type === app.currentCategory);
    }

    // Filter by search query
    const searchQuery = app.recipeSearchInput.value.toLowerCase().trim();
    if (searchQuery) {
        filteredItems = filteredItems.filter(item => {
            const itemName = window.localization.getItemName(item);
            return itemName && itemName.toLowerCase().includes(searchQuery);
        });
    }

    // Clear the grid
    app.recipeGrid.innerHTML = '';

    // Show message if no results
    if (filteredItems.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'no-recipes-message';
        noResults.textContent = window.localization.t('app.no_recipes_found');
        app.recipeGrid.appendChild(noResults);
        return;
    }

    // Sort items alphabetically by localized name
    filteredItems.sort((a, b) => {
        const nameA = window.localization.getItemName(a);
        const nameB = window.localization.getItemName(b);
        return nameA.localeCompare(nameB);
    });

    // Create recipe items
    filteredItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'recipe-item';

        // Check if item has a recipe
        const hasRecipe = findRecipesForItem(item.id) !== null;

        if (!hasRecipe) {
            itemEl.classList.add('is-raw-item');
            itemEl.title = window.localization.t('app.uncraftable');
        }

        // Set image source with fallback
        const imgSrc = item.img ? `${window.productionApp.projectBaseUrl}images/${item.img}` : '${window.productionApp.projectBaseUrl}images/default-item.png';

        itemEl.innerHTML = `
            <img src="${imgSrc}" alt="${window.localization.getItemName(item)}">
            <div class="recipe-item-info">
                <div class="recipe-item-name">${window.localization.getItemName(item)}</div>
                <div class="recipe-item-type">${window.localization.getItemTypeName(item.type)}</div>
                ${!hasRecipe ? `<div class="recipe-item-status">${window.localization.t('app.uncraftable')}</div>` : ''}
            </div>
        `;

        // Add click event only for craftable items
        if (hasRecipe) {
            itemEl.addEventListener('click', () => selectRecipe(item));
        }

        app.recipeGrid.appendChild(itemEl);
    });
}

/**
 * Select a recipe for production
 * @param {Object} item - The selected item
 */
function selectRecipe(item) {
    const app = window.productionApp;
    app.currentTargetItem = item;
    app.selectedItemName.textContent = window.localization.getItemName(item);
    app.recipeSelectorModal.classList.remove('is-active');
}

/**
 * Checks whether the current device is mobile based on a CSS media query.
 * @returns {boolean}
 */
function isMobileDevice() {
    return window.matchMedia('(max-width: 768px)').matches;
}

/**
 * A mobile modal window for selecting a recipe is displayed.
 * @param {string} nodeId — the ID of the node for which you are selecting a recipe.
 */
function showMobileRecipeSelector(nodeId) {
    const app = window.productionApp;

    const nodeInstance = app.productionGraph.nodes.get(nodeId);
    if (!nodeInstance) return;

    const nodeData = app.allNeedsMap.get(nodeId);
    if (!nodeData) return;

    const modal = document.getElementById('recipe-selector-modal-mobile');
    const optionsContainer = document.getElementById('mobile-recipe-options');

    // Store the node ID in the modal for language change updates
    modal.dataset.nodeId = nodeId;

    optionsContainer.innerHTML = '';

    nodeData.allRecipes.forEach((recipe, index) => {
        const option = document.createElement('div');
        option.className = 'recipe-option-mobile';
        option.setAttribute('tabindex', '0');

        const building = app.buildingsData.buildings[recipe.buildingId];
        const isSelected = index === nodeData.selectedRecipeIndex;

        option.innerHTML = `
            <div class="recipe-option-header">
                <img src="${window.productionApp.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                <span>${window.localization.getBuildingName(building)} ${isSelected ? window.localization.t('app.current') : ''}</span>
            </div>
            <div class="recipe-option-content">
                ${nodeInstance.renderIngredients(recipe.ingredients)}
                <div class="recipe-arrow">→</div>
                ${nodeInstance.renderProducts(recipe.products)}
            </div>
        `;

        option.addEventListener('click', () => {
            app.selectedRecipesMap.set(nodeId, index);
            calculateProduction(true);
            hideMobileRecipeSelector();
        });

        optionsContainer.appendChild(option);
    });

    modal.classList.add('is-active');
}

/**
 * Hides the mobile recipe selection modal.
 */
function hideMobileRecipeSelector() {
    const modal = document.getElementById('recipe-selector-modal-mobile');
    modal.classList.remove('is-active');
}