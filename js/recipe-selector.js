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
    app.categoryTabs.innerHTML = '<button class="category-tab active" data-category="all">All</button>';

    // Create category tabs
    app.allCategories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        tab.setAttribute('data-category', category);
        // Format category name for display
        tab.textContent = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
        filteredItems = filteredItems.filter(item =>
            item.name && item.name.toLowerCase().includes(searchQuery)
        );
    }

    // Clear the grid
    app.recipeGrid.innerHTML = '';

    // Show message if no results
    if (filteredItems.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'no-recipes-message';
        noResults.textContent = 'No recipes found';
        app.recipeGrid.appendChild(noResults);
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
    app.selectedItemName.textContent = item.name;
    app.recipeSelectorModal.classList.remove('is-active');
}