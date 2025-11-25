import { getAllItems } from '../../data/DataLoader.js';
import { findRecipesForItem } from '../../data/RecipeFinder.js';
import { calculateProduction } from "../../services/ProductionCalculator.js";

/**
 * Handles the rendering and interaction logic for the recipe selection modal.
 * This includes managing categories, search, and the recipe grid itself.
 */

/**
 * Renders the recipe category tabs and sets up their click handlers.
 * It dynamically builds the "All" tab and tabs for each discovered item category.
 */
export function renderRecipeCategories() {
    console.log("[ui.views.RecipeSelector.renderRecipeCategories] Rendering recipe categories.");
    // Clear and rebuild the set of all available categories from the full item list.
    window.datas.allCategories.clear();
    getAllItems().forEach(item => {
        if (item.type) {
            window.datas.allCategories.add(item.type);
        }
    });

    // Create the "All" category tab, which is always active by default.
    window.elements.categoryTabs.innerHTML = `<button class="category-tab active" data-category="all">${window.localization.t('app.all')}</button>`;

    // Create a tab for each unique category found.
    window.datas.allCategories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        tab.setAttribute('data-category', category);
        // Use the localized name for the category's display text.
        tab.textContent = window.localization.getItemTypeName(category);
        window.elements.categoryTabs.appendChild(tab);
    });

    // Add a click event listener to all category tabs to handle filtering.
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and activate the clicked one.
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Update the global state with the selected category.
            window.datas.currentCategory = tab.getAttribute('data-category');
            // Re-render the recipe grid based on the new filter.
            renderRecipeGrid();
        });
    });

    // Perform an initial render of the recipe grid.
    renderRecipeGrid();
    console.log("[ui.views.RecipeSelector.renderRecipeCategories] Category tabs rendered.");
}

/**
 * Event handler for the recipe search input field.
 * It simply triggers a re-render of the recipe grid on each input.
 */
export function handleRecipeSearch() {
    console.debug("[ui.views.RecipeSelector.handleRecipeSearch] Search input changed. Re-rendering grid.");
    renderRecipeGrid();
}

/**
 * Sets up the clear button for the recipe search input.
 * The button is only visible when the input field is not empty.
 */
export function setupRecipeSearchClearButton() {
    const searchInput = document.getElementById('recipe-search-input');
    const clearBtn = document.getElementById('recipe-search-clear-btn');

    if (searchInput && clearBtn) {
        // Add an input listener to show/hide the clear button based on whether there's text.
        searchInput.addEventListener('input', () => {
            clearBtn.style.display = searchInput.value ? 'block' : 'none';
        });

        // Add a click listener to clear the input and hide the button.
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            handleRecipeSearch();
        });

        // Initially, the clear button should be hidden.
        clearBtn.style.display = 'none';
    }
}

/**
 * Renders the grid of recipe items based on the active category and search query.
 * This is the main display function for the recipe selection modal.
 */
export function renderRecipeGrid() {
    const allItems = getAllItems();
    let filteredItems = allItems;

    // First, filter items by the selected category, if not "all".
    if (window.datas.currentCategory !== 'all') {
        filteredItems = filteredItems.filter(item => item.type === window.datas.currentCategory);
    }
    console.debug(`[ui.views.RecipeSelector.renderRecipeGrid] Filtered by category '${window.datas.currentCategory}'. Count: ${filteredItems.length}`);

    // Second, filter the results by the search query, if one exists.
    const searchQuery = window.elements.recipeSearchInput.value.toLowerCase().trim();
    if (searchQuery) {
        filteredItems = filteredItems.filter(item => {
            const itemName = window.localization.getItemName(item);
            return itemName && itemName.toLowerCase().includes(searchQuery);
        });
    }
    console.debug(`[ui.views.RecipeSelector.renderRecipeGrid] Filtered by search '${searchQuery}'. Final count: ${filteredItems.length}`);

    // Clear the existing grid content.
    window.elements.recipeGrid.innerHTML = '';

    // If no items match the filters, display a "no results" message.
    if (filteredItems.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'no-recipes-message';
        noResults.textContent = window.localization.t('app.no_recipes_found');
        window.elements.recipeGrid.appendChild(noResults);
        return;
    }

    // Sort the filtered items alphabetically by their localized names for consistent order.
    filteredItems.sort((a, b) => {
        const nameA = window.localization.getItemName(a);
        const nameB = window.localization.getItemName(b);
        return nameA.localeCompare(nameB);
    });

    // Create and append a DOM element for each filtered item.
    filteredItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'recipe-item';

        // Check if the item has any production recipes.
        const hasRecipe = findRecipesForItem(item.id) !== null;

        if (!hasRecipe) {
            // Add a special class for raw materials that cannot be crafted.
            itemEl.classList.add('is-raw-item');
            // Add a tooltip to indicate it's uncraftable.
            itemEl.title = window.localization.t('app.uncraftable');
        }

        // Set the image source, with a fallback to a default icon.
        const imgSrc = item.img ? `${window.projectBaseUrl}images/${item.img}` : `${window.projectBaseUrl}images/default-item.png`;

        itemEl.innerHTML = `
            <img src="${imgSrc}" alt="${window.localization.getItemName(item)}">
            <div class="recipe-item-info">
                <div class="recipe-item-name">${window.localization.getItemName(item)}</div>
                <div class="recipe-item-type">${window.localization.getItemTypeName(item.type)}</div>
                ${!hasRecipe ? `<div class="recipe-item-status">${window.localization.t('app.uncraftable')}</div>` : ''}
            </div>
        `;

        // Only add a click listener for items that can be crafted (have recipes).
        if (hasRecipe) {
            itemEl.addEventListener('click', () => selectRecipe(item));
        }

        window.elements.recipeGrid.appendChild(itemEl);
    });
    console.log("[ui.views.RecipeSelector.renderRecipeGrid] Recipe grid rendered.");
}

/**
 * Sets the selected item as the new target for production calculation.
 * @param {Object} item - The item object selected by the user.
 */
export function selectRecipe(item) {
    console.log(`[ui.views.RecipeSelector.selectRecipe] Item selected: ${window.localization.getItemName(item)} (${item.id})`);
    // Update the global state with the new target item.
    window.datas.currentTargetItem = item;
    // Update the UI to show the selected item's name.
    window.elements.selectedItemName.textContent = window.localization.getItemName(item);
    // Hide the recipe selector modal.
    window.elements.recipeSelectorModal.classList.remove('is-active');

    // Trigger the main production calculation for the new target item.
    calculateProduction();
}

/**
 * Displays a mobile-specific modal for selecting a recipe for an existing node.
 * This is used when a node's recipe selector is clicked on a mobile device.
 * @param {string} nodeId - The ID of the production node.
 */
export function showMobileRecipeSelector(nodeId) {
    console.log(`[ui.views.RecipeSelector.showMobileRecipeSelector] Showing mobile selector for node: ${nodeId}`);
    const nodeInstance = window.datas.productionGraph.nodes.get(nodeId);
    if (!nodeInstance) {
        console.error(`[ui.views.RecipeSelector.showMobileRecipeSelector] Node instance not found for ID: ${nodeId}`);
        return;
    }

    const nodeData = window.datas.allNeedsMap.get(nodeId);
    if (!nodeData) {
        console.error(`[ui.views.RecipeSelector.showMobileRecipeSelector] Node data not found for ID: ${nodeId}`);
        return;
    }

    const modal = document.getElementById('recipe-selector-modal-mobile');
    const optionsContainer = document.getElementById('mobile-recipe-options');

    // Store the node ID in the modal's dataset for potential language change updates.
    modal.dataset.nodeId = nodeId;

    // Clear any previous options in the modal.
    optionsContainer.innerHTML = '';

    // Populate the modal with options for each recipe available for the node's item.
    nodeData.allRecipes.forEach((recipe, index) => {
        const option = document.createElement('div');
        option.className = 'recipe-option-mobile';
        option.setAttribute('tabindex', '0');

        const building = window.datas.buildingsData.buildings[recipe.buildingId];
        const isSelected = index === nodeData.selectedRecipeIndex;

        option.innerHTML = `
            <div class="recipe-option-header">
                <img src="${window.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                <span>${window.localization.getBuildingName(building)} ${isSelected ? "(" + window.localization.t('app.current' + ")") : ''}</span>
            </div>
            <div class="recipe-option-content">
                ${nodeInstance.renderIngredients(recipe.ingredients)}
                <div class="recipe-arrow">→</div>
                ${nodeInstance.renderProducts(recipe.products)}
            </div>
        `;

        // Add a click listener to select the recipe and recalculate.
        option.addEventListener('click', () => {
            window.datas.selectedRecipesMap.set(nodeId, index);
            calculateProduction(true);
            hideMobileRecipeSelector();
        });

        optionsContainer.appendChild(option);
    });

    // Make the modal visible.
    modal.classList.add('is-active');
    console.log("[ui.views.RecipeSelector.showMobileRecipeSelector] Mobile modal is now active.");
}

/**
 * Hides the mobile recipe selection modal.
 */
export function hideMobileRecipeSelector() {
    const modal = document.getElementById('recipe-selector-modal-mobile');
    modal.classList.remove('is-active');
    console.log("[ui.views.RecipeSelector.hideMobileRecipeSelector] Mobile modal hidden.");
}