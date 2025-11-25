// =============================================================================
// IMPORTS
// =============================================================================

// --- Configs ---
import { saveDisplaySettings } from "./config/DisplaySettings.js";

// --- Services ---
import {
    handleCanvasMouseDown, handleMouseMove, handleMouseUp, handleWheel,
    handleTouchStart, handleTouchMove, handleTouchEnd
} from "./services/CanvasInteractionService.js"
import { calculateProduction } from "./services/ProductionCalculator.js";
import { deleteNodeAndDependents } from "./services/NodeDeletionService.js";

// --- Views ---
import {
    renderRecipeCategories, handleRecipeSearch, hideMobileRecipeSelector,
    setupRecipeSearchClearButton
} from "./ui/views/RecipeSelector.js";

// --- Utils ---
import { clearApp, hideDeleteConfirmation, updateTotalPower } from "./utils/AppUtils.js";
import { resetNodePositions } from "./utils/NodeUtils.js";

// --- UI ---
import { updateItemSelectorIcon } from "./ui/controllers/UpdateIcons.js";


// =============================================================================
// MAIN EVENT LISTENER SETUP
// =============================================================================

/**
 * Initializes the application by setting up all necessary global event listeners.
 * This function acts as the central hub for user interactions, connecting UI elements
 * to their respective service functions and utility handlers.
 */
export function setupEventListeners() {
    console.log("   Initializing application event listeners...");

    // --- Mouse Events for Graph Interaction ---
    // Attach listeners for panning, dragging, and zooming on the main graph container.
    window.elements.graphContainer.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.elements.graphContainer.addEventListener('wheel', handleWheel, { passive: false });
    console.log("Mouse event listeners attached to graph container.");

    // --- Touch Events for Mobile Interaction ---
    // Attach listeners for touch-based panning, dragging, and pinch-to-zoom.
    window.elements.graphContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.elements.graphContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.elements.graphContainer.addEventListener('touchend', handleTouchEnd);
    console.log("Touch event listeners attached to graph container.");

    // --- Main Control Buttons ---
    // Listener for the primary 'Calculate' button to trigger production calculation.
    window.elements.calculateBtn.addEventListener('click', calculateProduction);

    // Listener for the 'Reset' button to clear the entire application state.
    const clearCache = document.getElementById('clear-cache-modal')
    window.elements.resetBtn.addEventListener( 'click', () => {
        clearCache.classList.add('is-active');
    });

    clearCache.querySelector('.modal-close').addEventListener('click', () => {
        clearCache.classList.remove('is-active');
    });

    document.getElementById('clear-cache-cancel-btn').addEventListener('click', () => {
        clearCache.classList.remove('is-active');
    });

    document.getElementById('clear-cache-clear-btn').addEventListener('click', () => {
        clearCache.classList.remove('is-active');
        clearApp();
    });

    // Listeners for the 'Help' button to show/hide the help modal.
    window.elements.helpBtn.addEventListener('click', () => window.elements.helpModal.classList.add('is-active'));
    window.elements.modalClose.addEventListener('click', () => window.elements.helpModal.classList.remove('is-active'));
    console.log("Main control button listeners attached.");

    // --- Recipe Selector Modal ---
    // Listener to open the recipe selection modal when the main item selector is clicked.
    window.elements.itemSelectorBtn.addEventListener('click', () => {
        window.elements.recipeSelectorModal.classList.add('is-active');
        // Render categories only if the grid is empty to avoid redundant re-renders.
        if (!window.elements.recipeGrid.innerHTML) {
            renderRecipeCategories();
        }
    });
    // Listener for the search input within the recipe modal to filter recipes.
    window.elements.recipeSearchInput.addEventListener('input', handleRecipeSearch);
    // Listener for the close button within the recipe modal.
    const modalCloseBtn = window.elements.recipeSelectorModal.querySelector('.modal-close');
    modalCloseBtn.addEventListener('click', () => {
        window.elements.recipeSelectorModal.classList.remove('is-active');
    });
    console.log("Recipe selector modal listeners attached.");

    // --- Amount Input Field ---
    // Listener for 'amount-input' field to re-calculate.
    window.elements.amountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            calculateProduction(true);
        }
    });
    console.log("Amount Input Field listeners attached.");

    // --- Display Options Checkboxes ---
    // Listener for 'Show Raw Materials' checkbox to re-calculate and save settings.
    window.elements.showRawMaterials.addEventListener('change', () => {
        if (window.datas.currentTargetItem) {
            calculateProduction(true);
        }
        saveDisplaySettings();
    });
    // Listener for 'Show Power' checkbox to update the graph display and save settings.
    window.elements.showPower.addEventListener('change', () => {
        if (window.datas.productionGraph) {
            window.datas.productionGraph.updatePowerDisplay();
            updateTotalPower();
            // Save current tab data if tabs are active.
            if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
                window.tabsManager.saveCurrentTabData();
            }
        }
        saveDisplaySettings();
    });
    // Listener for 'Show Alternative Recipes' checkbox to toggle recipe visibility and save settings.
    window.elements.showAlternativeRecipes.addEventListener('change', () => {
        // Toggle a class on the graph container to hide/show alternative recipe paths.
        window.elements.graphContainer.classList.toggle('hide-alternative-recipes', !window.elements.showAlternativeRecipes.checked);
        // Save current tab data if tabs are active.
        if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
            window.tabsManager.saveCurrentTabData();
        }
        saveDisplaySettings();
    });
    // Listener for 'Physics Simulation' checkbox to start/stop the graph simulation.
    window.elements.physicsSimulation.addEventListener('change', () => {
        if (window.datas.productionGraph) {
            if (window.elements.physicsSimulation.checked) {
                window.datas.productionGraph.startSimulation();
            } else {
                window.datas.productionGraph.stopSimulation();
            }
            // Save current tab data if tabs are active.
            if (window.tabsManager && window.tabsManager.saveCurrentTabData) {
                window.tabsManager.saveCurrentTabData();
            }
        }
        saveDisplaySettings();
    });
    console.log("Display option checkbox listeners attached.");

    // --- Delete Confirmation Modal ---
    // Listeners for the delete confirmation modal buttons.
    const deleteModal = document.getElementById('delete-confirmation-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const deleteModalCloseBtn = deleteModal.querySelector('.modal-close');

    confirmDeleteBtn.addEventListener('click', () => {
        // Proceed with deletion only if a node is actually pending deletion.
        if (window.datas.nodePendingDeletion) {
            deleteNodeAndDependents(window.datas.nodePendingDeletion);
        }
        hideDeleteConfirmation();
    });
    cancelDeleteBtn.addEventListener('click', hideDeleteConfirmation);
    deleteModalCloseBtn.addEventListener('click', hideDeleteConfirmation);
    // Also close the modal if the user clicks the overlay background.
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            hideDeleteConfirmation();
        }
    });
    console.log("Delete confirmation modal listeners attached.");

    // --- Menu Toggle Control ---
    // Listener for the mobile menu toggle button.
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const appOverlay = document.createElement('div');
    appOverlay.className = 'app-overlay';
    document.body.appendChild(appOverlay);

    menuToggleBtn.addEventListener('click', () => {
        // Toggle classes to show/hide the control panel and overlay.
        window.elements.controlPanel.classList.toggle('is-open');
        appOverlay.classList.toggle('is-active');
    });

    appOverlay.addEventListener('click', () => {
        window.elements.controlPanel.classList.remove('is-open');
        appOverlay.classList.remove('is-active');
    });
    console.log("Menu toggle listener attached.");

    // --- Mobile Recipe Selector Modal ---
    // Listeners for the mobile-specific recipe selection modal.
    const mobileRecipeModal = document.getElementById('recipe-selector-modal-mobile');
    const mobileRecipeModalCloseBtn = mobileRecipeModal.querySelector('.modal-close');

    mobileRecipeModalCloseBtn.addEventListener('click', hideMobileRecipeSelector);
    // Close the modal if the user clicks the overlay background.
    mobileRecipeModal.addEventListener('click', (e) => {
        if (e.target === mobileRecipeModal) {
            hideMobileRecipeSelector();
        }
    });
    console.log("Mobile recipe selector modal listeners attached.");

    // --- Default Recipes Button ---
    // Listener for the button that opens the default recipes manager modal.
    const defaultRecipesBtn = document.getElementById('akef-default-recipes-btn');
    if (defaultRecipesBtn) {
        defaultRecipesBtn.addEventListener('click', () => {
            window.defaultRecipeManager.showModal();
        });
    }

    // --- Icon Updates ---
    // Update the main item selector icon once the DOM is fully loaded.
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            // Only update if a target item is already selected.
            if (window.productionApp && window.productionApp.currentTargetItem) {
                updateItemSelectorIcon();
            }
        }, 10);
    });
    // Also update the icon whenever a tab is loaded, as the target item might change.
    document.addEventListener('tabLoaded', () => {
        updateItemSelectorIcon();
    });
    console.log("Icon update listeners attached.");

    // --- Tab Data Persistence ---
    // Save the current tab's data whenever a production calculation is finished.
    document.addEventListener('productionCalculated', () => {
        if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
            window.tabsManager.saveCurrentTabData();
            window.tabsManager.renderTabs();
        }

        updateItemSelectorIcon();
    });
    console.log("Production calculation listener attached.");

    // --- Node Position Reset ---
    // Listener for the button to reset all node positions to their default layout.
    const resetPositionsBtn = document.getElementById('reset-positions-btn');
    if (resetPositionsBtn) {
        resetPositionsBtn.addEventListener('click', () => {
            resetNodePositions();
        });
    }

    // --- Recipe Search Clear Button ---
    // Set up the clear button functionality for the recipe search input.
    console.log("Setting up recipe search clear button.");
    setupRecipeSearchClearButton();

    // --- Page Unload ---
    // Save the current tab's state before the user leaves the page to prevent data loss.
    window.addEventListener('beforeunload', (e) => {
        // Prevent saving if a full app reset is in progress.
        if (window.isResetting) {
            return;
        }

        if (window.tabsManager && window.tabsManager.activeTabIndex !== undefined) {
            window.tabsManager.saveCurrentTabData();
        }
    });
    console.log("Page unload listener attached.");
}