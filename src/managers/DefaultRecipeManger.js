import { StorageService } from "../services/StorageService.js";
import { CONSTANTS } from "../config/Constants.js";
import { calculateProduction } from "../services/ProductionCalculator.js";
import { getAllItems, findRecipesCountForItem } from "../data/DataLoader.js";

/**
 * Manages the selection and persistence of default recipes for items that have multiple production options.
 * This class handles the UI modal for selecting defaults, saves them to local storage,
 * and applies them to the production graph.
 */
export class DefaultRecipeManager {
    constructor() {
        // A Map to store the default recipe index for each item ID.
        // Key: itemId (string), Value: recipeIndex (number)
        this.defaultRecipes = new Map();

        // Cache DOM elements for the modal and its components.
        this.modal = document.getElementById('akef-default-recipe-modal');
        this.recipeList = document.getElementById('akef-default-recipe-list');
        this.saveBtn = document.getElementById('akef-save-default-recipes-btn');
        this.cancelBtn = document.getElementById('akef-cancel-default-recipes-btn');
        this.closeBtn = this.modal.querySelector('.akef-modal-close');

        this.setupEventListeners();
        this.loadFromStorage();
        console.debug("[managers.DefaultRecipeManager] Initialized.");
    }

    /**
     * Attaches event listeners to the modal's control buttons.
     */
    setupEventListeners() {
        this.saveBtn.addEventListener('click', () => this.saveDefaults());
        this.cancelBtn.addEventListener('click', () => this.hideModal());
        this.closeBtn.addEventListener('click', () => this.hideModal());
        // Close modal if the user clicks on the background overlay.
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hideModal();
        });
    }

    /**
     * Displays the modal, populating it with all items that have multiple recipes.
     * It allows the user to select a default recipe for each such item.
     */
    showModal() {
        console.debug("[managers.DefaultRecipeManager] Showing modal to configure default recipes.");
        this.recipeList.innerHTML = '';
        const allItems = getAllItems();
        const itemsWithMultipleRecipes = [];

        // Filter out items that have more than one recipe, excluding waste items.
        allItems.forEach(item => {
            if (window.wasteManager && window.wasteManager.isWasteItem(item.id)) return;
            const recipes = findRecipesCountForItem(item.id);
            if (recipes && recipes.length > 1) {
                itemsWithMultipleRecipes.push(item);
            }
        });

        // Display a message if no items have multiple recipes.
        if (itemsWithMultipleRecipes.length === 0) {
            this.recipeList.innerHTML = '<p>No items with multiple recipes found.</p>';
            console.warn("[managers.DefaultRecipeManager] No items with multiple recipes found to display.");
        } else {
            console.log(`[managers.DefaultRecipeManager] Found ${itemsWithMultipleRecipes.length} items with multiple recipes.`);
            // For each item, create a collapsible group with all its recipe options.
            itemsWithMultipleRecipes.forEach(item => {
                const recipes = findRecipesCountForItem(item.id);
                if (!recipes || recipes.length <= 1) return;

                const recipeGroup = document.createElement('div');
                recipeGroup.className = 'akef-recipe-group';

                const itemHeader = document.createElement('div');
                itemHeader.className = 'akef-recipe-group-header';

                // Determine the currently selected default recipe for this item.
                const defaultRecipeIndex = this.defaultRecipes.get(item.id) ?? 0;
                const defaultRecipe = recipes[defaultRecipeIndex];
                const defaultBuilding = window.datas.buildingsData.buildings[defaultRecipe.buildingId];

                // Populate the header with item icon, name, and the current default recipe.
                itemHeader.innerHTML = `
                    <div class="akef-recipe-header-content">
                        <img src="${window.projectBaseUrl}images/${item.img}" alt="${window.localization.getItemName(item)}">
                        <div class="akef-recipe-header-info">
                            <span class="akef-recipe-item-name">${window.localization.getItemName(item)}</span>
                            <span class="akef-recipe-current-default">${window.localization.t('app.current')}: ${window.localization.getBuildingName(defaultBuilding)} <img src="${window.projectBaseUrl}images/${defaultBuilding.img}" alt="${window.localization.getBuildingName(defaultBuilding)}" class="akef-current-building-icon"></span>
                        </div>
                    </div>
                    <i class="fas fa-chevron-down akef-recipe-chevron"></i>
                `;

                const recipeOptions = document.createElement('div');
                recipeOptions.className = 'akef-recipe-options';
                recipeOptions.style.display = 'none'; // Start collapsed

                // Create a selectable option for each recipe.
                recipes.forEach((recipe, index) => {
                    const building = window.datas.buildingsData.buildings[recipe.buildingId];
                    const isSelected = this.defaultRecipes.get(item.id) === index;

                    const option = document.createElement('div');
                    option.className = `akef-recipe-option ${isSelected ? 'selected' : ''}`;
                    option.innerHTML = `
                        <div class="akef-recipe-option-header">
                            <input type="radio" name="recipe-${item.id}" value="${index}" ${isSelected ? 'checked' : ''}>
                            <img src="${window.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                            <span>${window.localization.getBuildingName(building)}</span>
                        </div>
                        <div class="akef-recipe-option-content">
                            ${this.renderIngredients(recipe.ingredients)}
                            <div class="recipe-arrow">→</div>
                            ${this.renderProducts(recipe.products)}
                        </div>
                    `;

                    // Add a click listener to handle recipe selection.
                    option.addEventListener('click', () => {
                        const radio = option.querySelector('input[type="radio"]');
                        radio.checked = true;
                        // Remove 'selected' class from all options for this item.
                        document.querySelectorAll(`.akef-recipe-option input[name="recipe-${item.id}"]`).forEach(r => {
                            r.closest('.akef-recipe-option').classList.remove('selected');
                        });
                        option.classList.add('selected');
                        // Update the header to show the newly selected default.
                        const headerInfo = itemHeader.querySelector('.akef-recipe-current-default');
                        headerInfo.innerHTML = `${window.localization.t('app.current')}: ${window.localization.getBuildingName(building)}
                            <img src="${window.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}"
                            class="akef-current-building-icon">
                        `;
                    });

                    recipeOptions.appendChild(option);
                });

                // Add a click listener to the header to toggle the visibility of the options (accordion behavior).
                itemHeader.addEventListener('click', () => {
                    const isExpanded = recipeOptions.style.display !== 'none';
                    recipeOptions.style.display = isExpanded ? 'none' : 'block';
                    const chevron = itemHeader.querySelector('.akef-recipe-chevron');
                    chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
                });

                recipeGroup.appendChild(itemHeader);
                recipeGroup.appendChild(recipeOptions);
                this.recipeList.appendChild(recipeGroup);
            });
        }

        this.modal.classList.add('is-active');
    }

    /**
     * Hides the default recipe selection modal.
     */
    hideModal() {
        this.modal.classList.remove('is-active');
        console.debug("[managers.DefaultRecipeManager] Modal hidden.");
    }

    /**
     * Saves the selected default recipes from the modal into the manager's state and local storage.
     * It then applies these defaults to the current production graph.
     */
    saveDefaults() {
        console.log("[managers.DefaultRecipeManager] Saving default recipes...");
        document.querySelectorAll('.akef-recipe-group').forEach(group => {
            const selectedRadio = group.querySelector('input[type="radio"]:checked');
            if (selectedRadio) {
                const itemId = selectedRadio.name.replace('recipe-', '');
                const recipeIndex = parseInt(selectedRadio.value);
                this.defaultRecipes.set(itemId, recipeIndex);
            }
        });

        this.saveToStorage();
        this.applyDefaultsToProduction();
        this.hideModal();

        // If a production graph is already active, recalculate it to apply the new defaults.
        if (window.datas.currentTargetItem) {
            console.log("[managers.DefaultRecipeManager] Recalculating production with new defaults.");
            calculateProduction(true);
        }
    }

    /**
     * Applies the stored default recipes to the production graph's selected recipes map.
     * This only sets a recipe if the user hasn't already manually selected one for the current session.
     */
    applyDefaultsToProduction() {
        let appliedCount = 0;
        this.defaultRecipes.forEach((recipeIndex, itemId) => {
            // Only apply the default if a recipe for this item hasn't been selected yet.
            if (!window.datas.selectedRecipesMap.has(itemId)) {
                window.datas.selectedRecipesMap.set(itemId, recipeIndex);
                appliedCount++;
            }
        });
        console.log(`[managers.DefaultRecipeManager] Applied ${appliedCount} default recipes to the production graph.`);
    }

    /**
     * Helper function to generate HTML for a list of ingredients.
     * @param {Array} ingredients - Array of ingredient objects.
     * @returns {string} HTML string for the ingredients.
     */
    renderIngredients(ingredients) {
        if (!ingredients) return '';
        return ingredients.map(ing => {
            const item = window.datas.itemsData.items[ing.item_id];
            return `
                <div class="akef-recipe-component" data-amount="${ing.amount.toFixed(0)}">
                    <img src="${window.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${ing.amount.toFixed(0)}">
                </div>
            `;
        }).join('');
    }

    /**
     * Helper function to generate HTML for a list of products.
     * @param {Array} products - Array of product objects.
     * @returns {string} HTML string for the products.
     */
    renderProducts(products) {
        if (!products) return '';
        return products.map(prod => {
            const item = window.datas.itemsData.items[prod.item_id];
            return `
                <div class="akef-recipe-component" data-amount="${prod.amount}">
                    <img src="${window.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${prod.amount}">
                </div>
            `;
        }).join('');
    }

    /**
     * Saves the default recipes map to local storage.
     * The Map is converted to a plain object for serialization.
     */
    saveToStorage() {
        const defaultsObject = {};
        this.defaultRecipes.forEach((value, key) => {
            defaultsObject[key] = value;
        });
        StorageService.set(CONSTANTS.STORAGE_KEYS.DEFAULT_RECIPES, defaultsObject);
        console.log("[DefaultRecipeManager] Default recipes saved to storage.", defaultsObject);
    }

    /**
     * Loads default recipes from local storage.
     * It also checks for any new items with multiple recipes and adds them to the defaults with a default index of 0.
     */
    loadFromStorage() {
        const saved = StorageService.get(CONSTANTS.STORAGE_KEYS.DEFAULT_RECIPES);
        if (saved) {
            Object.entries(saved).forEach(([key, value]) => {
                this.defaultRecipes.set(key, value);
            });
            console.log("[managers.DefaultRecipeManager] Default recipes loaded from storage.", saved);
        } else {
            console.debug("[managers.DefaultRecipeManager] No saved default recipes found in storage.");
        }

        // Check for new items that might have been added since the last save.
        const allItems = getAllItems();
        let mapNeedsSaving = false;
        let newItemsCount = 0;

        allItems.forEach(item => {
            if (window.wasteManager && window.wasteManager.isWasteItem(item.id)) return;

            const recipes = findRecipesCountForItem(item.id);
            // If an item has multiple recipes and isn't already in our defaults map, add it.
            if (recipes && recipes.length > 1 && !this.defaultRecipes.has(item.id)) {
                this.defaultRecipes.set(item.id, 0); // Default to the first recipe (index 0).
                mapNeedsSaving = true;
                newItemsCount++;
            }
        });

        if (mapNeedsSaving) {
            console.log(`[managers.DefaultRecipeManager] Found ${newItemsCount} new items with multiple recipes. Adding them to defaults and saving.`);
            this.saveToStorage();
        }
    }
}