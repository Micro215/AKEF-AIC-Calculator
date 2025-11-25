import { resetGraph } from "./GraphUtils.js";

/**
 * Clears all application data from localStorage and performs a hard refresh.
 * This is a "nuclear" option for the user to start completely fresh.
 */
export function clearApp() {
    console.log("[utils.AppUtils.clearApp] Clearing all application data and reloading.");
    // Set a flag to prevent unwanted interactions during the reset process.
    window.isResetting = true;
    // Clear all data stored in localStorage.
    localStorage.clear();
    // Reload the page to re-initialize everything from scratch.
    window.location.reload();
}

/**
 * Resets the current production graph and related UI elements to their default state.
 * This is a "soft" reset, clearing the current calculation but not localStorage.
 */
export function resetApp() {
    console.log("[utils.AppUtils.resetApp] Resetting the current production graph.");
    // Clear the current target item and its name from the UI.
    window.datas.currentTargetItem = null;
    window.elements.selectedItemName.textContent = window.localization.t('app.choose_recipe');

    // Clear the map of calculated production needs.
    window.datas.allNeedsMap.clear();

    // Clear the map of saved node positions for the current session.
    window.datas.nodePositions.clear();

    // Reset the canvas view to its default position and zoom.
    window.states.canvasTransform = { x: 0, y: 0, scale: 1 };

    // Use the dedicated utility to clear the visual graph.
    resetGraph();

    // Hide the "no recipe" message, as it's no longer relevant.
    window.elements.noRecipeMessage.style.display = 'none';
}

/**
 * Determines if the user's device is a mobile device based on a CSS media query.
 * This is used to conditionally show/hide UI elements or change interaction logic.
 * @returns {boolean} - True if the viewport width is 768px or less.
 */
export function isMobileDevice() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    console.debug(`[utils.AppUtils.isMobileDevice] Device isMobile: ${isMobile}`);
    return isMobile;
}

/**
 * Calculates and displays the total power consumption of the current production graph.
 * It iterates through all non-raw, non-byproduct nodes and sums their power usage.
 */
export function updateTotalPower() {
    // Guard clause to prevent errors if the needs map is empty.
    if (!window.datas.allNeedsMap || window.datas.allNeedsMap.size === 0) {
        console.debug("[utils.AppUtils.updateTotalPower] No production data to calculate power from.");
        return;
    }

    let totalPower = 0;
    // Iterate over each item in the production needs map.
    window.datas.allNeedsMap.forEach(itemData => {
        // Skip byproducts and raw materials if their display is toggled off.
        if (itemData.isByproduct) return;
        if (itemData.isRaw && !window.elements.showRawMaterials.checked) return;

        // Only calculate power for nodes that require machines.
        if (itemData.machineCount > 0) {
            const recipe = itemData.allRecipes[itemData.selectedRecipeIndex];
            if (recipe) {
                // Get the power consumption of the building from the recipe.
                const power = window.datas.buildingsData.buildings[recipe.buildingId].power || 0;
                // Add the machine's total power (number of machines * power per machine).
                totalPower += Math.ceil(itemData.machineCount) * power;
            }
        }
    });

    // Update the UI element with the calculated total power.
    window.elements.totalPowerEl.textContent = totalPower.toFixed(0);
    console.debug(`[utils.AppUtils.updateTotalPower] Total power calculated: ${totalPower.toFixed(0)} MW`);
}

/**
 * Displays a confirmation modal to the user before deleting a production node.
 * @param {string} itemId - The ID of the item corresponding to the node to be deleted.
 */
export function showDeleteConfirmation(itemId) {
    const deleteModal = document.getElementById('delete-confirmation-modal');
    const deleteItemName = document.getElementById('delete-item-name');

    // Find the item's data to get its localized name for the confirmation message.
    const item = window.datas.itemsData.items[itemId];
    if (item) {
        // Set the name in the confirmation modal.
        deleteItemName.textContent = window.localization.getItemName(item);
        // Store the ID of the node pending deletion.
        window.datas.nodePendingDeletion = itemId;
        // Show the modal.
        deleteModal.classList.add('is-active');
        console.log(`[utils.AppUtils.showDeleteConfirmation] Showing delete confirmation for item: ${window.localization.getItemName(item)} (${itemId})`);
    } else {
        console.error(`[utils.AppUtils.showDeleteConfirmation] Could not find item with ID: ${itemId} to show confirmation.`);
    }
}

/**
 * Hides the delete confirmation modal and clears the pending deletion state.
 */
export function hideDeleteConfirmation() {
    const deleteModal = document.getElementById('delete-confirmation-modal');
    // Hide the modal.
    deleteModal.classList.remove('is-active');
    // Clear the pending deletion state.
    window.datas.nodePendingDeletion = null;
    console.debug("[utils.AppUtils.hideDeleteConfirmation] Delete confirmation modal hidden.");
}