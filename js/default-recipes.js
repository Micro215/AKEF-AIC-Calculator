/**
 * Manage default recipe selections
 */
class DefaultRecipeManager {
    constructor() {
        this.defaultRecipes = new Map();
        this.modal = document.getElementById('akef-default-recipe-modal');
        this.recipeList = document.getElementById('akef-default-recipe-list');
        this.saveBtn = document.getElementById('akef-save-default-recipes-btn');
        this.cancelBtn = document.getElementById('akef-cancel-default-recipes-btn');
        this.closeBtn = this.modal.querySelector('.akef-modal-close');

        this.setupEventListeners();
        this.loadFromStorage();
    }

    /**
     * Setup event listeners for the modal
     */
    setupEventListeners() {
        this.saveBtn.addEventListener('click', () => this.saveDefaults());
        this.cancelBtn.addEventListener('click', () => this.hideModal());
        this.closeBtn.addEventListener('click', () => this.hideModal());

        // Close modal when clicking outside
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });
    }

    /**
     * Show the modal with all items that have multiple recipes
     */
    showModal() {
        this.recipeList.innerHTML = '';

        // Get all items that have multiple recipes
        const allItems = getAllItems();
        const itemsWithMultipleRecipes = [];

        allItems.forEach(item => {
            const recipes = findRecipesForItem(item.id);
            if (recipes && recipes.length > 1) {
                itemsWithMultipleRecipes.push(item);
            }
        });

        if (itemsWithMultipleRecipes.length === 0) {
            this.recipeList.innerHTML = '<p>No items with multiple recipes found.</p>';
        } else {
            itemsWithMultipleRecipes.forEach(item => {
                const recipes = findRecipesForItem(item.id);
                if (!recipes || recipes.length <= 1) return;

                const recipeGroup = document.createElement('div');
                recipeGroup.className = 'akef-recipe-group';

                // Create collapsible header
                const itemHeader = document.createElement('div');
                itemHeader.className = 'akef-recipe-group-header';

                // Get current default recipe index
                const defaultRecipeIndex = this.defaultRecipes.get(item.id) ?? 0;
                const defaultRecipe = recipes[defaultRecipeIndex];
                const defaultBuilding = window.productionApp.buildingsData.buildings[defaultRecipe.buildingId];

                itemHeader.innerHTML = `
                    <div class="akef-recipe-header-content">
                        <img src="${window.productionApp.projectBaseUrl}images/${item.img}" alt="${window.localization.getItemName(item)}">
                        <div class="akef-recipe-header-info">
                            <span class="akef-recipe-item-name">${window.localization.getItemName(item)}</span>
                            <span class="akef-recipe-current-default">Current: ${window.localization.getBuildingName(defaultBuilding)} <img src="${window.productionApp.projectBaseUrl}images/${defaultBuilding.img}" alt="${window.localization.getBuildingName(defaultBuilding)}" class="akef-current-building-icon"></span>
                        </div>
                    </div>
                    <i class="fas fa-chevron-down akef-recipe-chevron"></i>
                `;

                // Create collapsible content
                const recipeOptions = document.createElement('div');
                recipeOptions.className = 'akef-recipe-options';
                recipeOptions.style.display = 'none'; // Initially collapsed

                recipes.forEach((recipe, index) => {
                    const building = window.productionApp.buildingsData.buildings[recipe.buildingId];
                    const isSelected = this.defaultRecipes.get(item.id) === index;

                    const option = document.createElement('div');
                    option.className = `akef-recipe-option ${isSelected ? 'selected' : ''}`;
                    option.innerHTML = `
                        <div class="akef-recipe-option-header">
                            <input type="radio" name="recipe-${item.id}" value="${index}" ${isSelected ? 'checked' : ''}>
                            <img src="${window.productionApp.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}">
                            <span>${window.localization.getBuildingName(building)}</span>
                        </div>
                        <div class="akef-recipe-option-content">
                            ${this.renderIngredients(recipe.ingredients)}
                            <div class="recipe-arrow">→</div>
                            ${this.renderProducts(recipe.products)}
                        </div>
                    `;

                    option.addEventListener('click', () => {
                        // Select this recipe
                        const radio = option.querySelector('input[type="radio"]');
                        radio.checked = true;

                        // Update UI
                        document.querySelectorAll(`.akef-recipe-option input[name="recipe-${item.id}"]`).forEach(r => {
                            r.closest('.akef-recipe-option').classList.remove('selected');
                        });
                        option.classList.add('selected');

                        // Update header to show new selection
                        const headerInfo = itemHeader.querySelector('.akef-recipe-current-default');
                        headerInfo.innerHTML = `Current: ${window.localization.getBuildingName(building)}
                            <img src="${window.productionApp.projectBaseUrl}images/${building.img}" alt="${window.localization.getBuildingName(building)}"
                            class="akef-current-building-icon">
                        `;
                    });

                    recipeOptions.appendChild(option);
                });

                // Add click event to header for collapsing/expanding
                itemHeader.addEventListener('click', () => {
                    const isExpanded = recipeOptions.style.display !== 'none';
                    recipeOptions.style.display = isExpanded ? 'none' : 'block';

                    // Rotate chevron icon
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
     * Hide the modal
     */
    hideModal() {
        this.modal.classList.remove('is-active');
    }

    /**
     * Save the selected default recipes
     */
    saveDefaults() {
        // Collect selected recipes
        document.querySelectorAll('.akef-recipe-group').forEach(group => {
            const selectedRadio = group.querySelector('input[type="radio"]:checked');
            if (selectedRadio) {
                const itemId = selectedRadio.name.replace('recipe-', '');
                const recipeIndex = parseInt(selectedRadio.value);
                this.defaultRecipes.set(itemId, recipeIndex);
            }
        });

        // Save to storage
        this.saveToStorage();

        // Apply defaults to current production
        this.applyDefaultsToProduction();

        // Hide modal
        this.hideModal();

        // Recalculate if there's a current production
        if (window.productionApp.currentTargetItem) {
            calculateProduction(true);
        }
    }

    /**
     * Apply default recipes to the current production
     */
    applyDefaultsToProduction() {
        if (!window.productionApp) return;

        // Apply default recipes only if they're not already set in selectedRecipesMap
        this.defaultRecipes.forEach((recipeIndex, itemId) => {
            if (!window.productionApp.selectedRecipesMap.has(itemId)) {
                window.productionApp.selectedRecipesMap.set(itemId, recipeIndex);
            }
        });
    }

    /**
     * Render ingredients for recipe option
     * @param {Array} ingredients - Array of ingredients
     * @returns {string} HTML string for ingredients
     */
    renderIngredients(ingredients) {
        if (!ingredients) return '';
        return ingredients.map(ing => {
            const item = window.productionApp.itemsData.items[ing.item_id];
            return `
                <div class="akef-recipe-component" data-amount="${ing.amount}">
                    <img src="${window.productionApp.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${ing.amount}">
                </div>
            `;
        }).join('');
    }

    /**
     * Render products for recipe option
     * @param {Array} products - Array of products
     * @returns {string} HTML string for products
     */
    renderProducts(products) {
        if (!products) return '';
        return products.map(prod => {
            const item = window.productionApp.itemsData.items[prod.item_id];
            return `
                <div class="akef-recipe-component" data-amount="${prod.amount}">
                    <img src="${window.productionApp.projectBaseUrl}images/${item.img}" title="${window.localization.getItemName(item)}: ${prod.amount}">
                </div>
            `;
        }).join('');
    }

    /**
     * Save default recipes to localStorage
     */
    saveToStorage() {
        const defaultsObject = {};
        this.defaultRecipes.forEach((value, key) => {
            defaultsObject[key] = value;
        });
        localStorage.setItem('akef-default-recipes', JSON.stringify(defaultsObject));
    }

    /**
     * Load default recipes from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('akef-default-recipes');
            if (saved) {
                const defaultsObject = JSON.parse(saved);
                Object.entries(defaultsObject).forEach(([key, value]) => {
                    this.defaultRecipes.set(key, value);
                });
            }
        } catch (error) {
            console.error('Error loading default recipes:', error);
        }
    }
}

// Export the class
window.DefaultRecipeManager = DefaultRecipeManager;